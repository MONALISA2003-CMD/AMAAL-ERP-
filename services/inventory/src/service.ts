import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';
import { assertImeiTransition, assertAllocationTransition, type ImeiState, type AllocationStatus } from '@amaal/business-rules';

export type AllocationTarget =
  | { kind: 'WAREHOUSE'; warehouseId: string }
  | { kind: 'MANAGER'; holderUserId: string }
  | { kind: 'TEAM'; teamId: string }
  | { kind: 'AGENT'; holderUserId: string; teamId: string }
  | { kind: 'SHOP'; holderUserId: string; teamId: string; shopId: string };

export type AllocationRequest = {
  imeiIds: string[];
  target: AllocationTarget;
  reason: string;
  notes?: string;
};

export type AllocationResult = {
  allocationId: string;
  status: 'REQUESTED';
  imeiIds: string[];
};

interface ImeiRow {
  id: string;
  imei: string;
  state: ImeiState;
  current_holder_user_id: string | null;
  current_warehouse_id: string | null;
  current_region_id: string | null;
  current_team_id: string | null;
  current_shop_id: string | null;
  condition_status: string;
}

interface ScopeRow {
  region_id: string | null;
  team_id: string | null;
  manager_user_id: string | null;
}


async function targetScope(tx: DatabaseTransaction, target: AllocationTarget): Promise<ScopeRow> {
  if (target.kind === 'WAREHOUSE') {
    const rows = await tx.query<{ region_id: string | null; organization_id: string }>(`select region_id,organization_id from public.warehouses where id=$1 and status='ACTIVE'`, [target.warehouseId]);
    if (rows.length !== 1) throw new ValidationError('Target warehouse not found or inactive.');
    return { region_id: rows[0]!.region_id, team_id: null, manager_user_id: null };
  }
  if (target.kind === 'MANAGER') {
    const rows = await tx.query<{ region_id: string }>(`select region_id from public.managers where user_id=$1 and status='ACTIVE'`, [target.holderUserId]);
    if (rows.length !== 1) throw new ValidationError('Target manager not found or inactive.');
    return { region_id: rows[0]!.region_id, team_id: null, manager_user_id: target.holderUserId };
  }
  if (target.kind === 'TEAM') {
    const rows = await tx.query<{ region_id: string; manager_user_id: string }>(`select region_id,manager_user_id from public.teams where id=$1 and status='ACTIVE'`, [target.teamId]);
    if (rows.length !== 1) throw new ValidationError('Target team not found or inactive.');
    return { region_id: rows[0]!.region_id, team_id: target.teamId, manager_user_id: rows[0]!.manager_user_id };
  }
  const rows = await tx.query<{ region_id: string; manager_user_id: string }>(`select t.region_id,t.manager_user_id from public.teams t where t.id=$1 and t.status='ACTIVE'`, [target.teamId]);
  if (rows.length !== 1) throw new ValidationError('Target team not found or inactive.');
  if (target.kind === 'SHOP') {
    const shopRows = await tx.query<{ id: string }>(`select id from public.shops where id=$1 and team_id=$2 and status='ACTIVE'`, [target.shopId, target.teamId]);
    if (shopRows.length !== 1) throw new ValidationError('Target shop not found or inactive.');
  }
  return { region_id: rows[0]!.region_id, team_id: target.teamId, manager_user_id: rows[0]!.manager_user_id };
}

async function assertTargetOwnership(tx: DatabaseTransaction, actorUserId: string, target: AllocationTarget, context: Awaited<ReturnType<typeof loadAuthorizationContext>>): Promise<void> {
  const scope = await targetScope(tx, target);
  const actorOrg = (await tx.query<{ organization_id: string }>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`, [actorUserId]))[0]?.organization_id;
  if (!actorOrg) throw new AuthorizationError('Actor is not linked to an active Amaal organization.');
  let targetOrg: string | null = null;
  if (target.kind === 'WAREHOUSE') targetOrg = (await tx.query<{ organization_id:string }>(`select organization_id from public.warehouses where id=$1 and status='ACTIVE'`, [target.warehouseId]))[0]?.organization_id ?? null;
  else if (target.kind === 'MANAGER') targetOrg = (await tx.query<{ organization_id:string }>(`select p.organization_id from public.managers m join public.profiles p on p.user_id=m.user_id where m.user_id=$1 and m.status='ACTIVE' limit 1`, [target.holderUserId]))[0]?.organization_id ?? null;
  else if (target.kind === 'TEAM') targetOrg = (await tx.query<{ organization_id:string }>(`select r.organization_id from public.teams t join public.regions r on r.id=t.region_id where t.id=$1 and t.status='ACTIVE'`, [target.teamId]))[0]?.organization_id ?? null;
  else if (target.kind === 'SHOP') targetOrg = (await tx.query<{ organization_id:string }>(`select organization_id from public.shops where id=$1 and status='ACTIVE'`, [target.shopId]))[0]?.organization_id ?? null;
  else targetOrg = (await tx.query<{ organization_id:string }>(`select r.organization_id from public.teams t join public.regions r on r.id=t.region_id where t.id=$1 and t.status='ACTIVE'`, [target.teamId]))[0]?.organization_id ?? null;
  if (!targetOrg || targetOrg !== actorOrg) throw new AuthorizationError('Allocation target is outside the Amaal organization.');
  if (context.roles.includes('CEO') || context.roles.includes('ADMIN')) return;
  if (context.roles.includes('REGIONAL_MANAGER') && scope.region_id && context.regionIds.includes(scope.region_id)) return;
  if (scope.team_id && context.teamIds.includes(scope.team_id)) return;
  if (scope.manager_user_id === actorUserId) return;
  throw new AuthorizationError('Allocation target is outside your organizational scope.');
}

async function targetDetails(tx: DatabaseTransaction, target: AllocationTarget): Promise<{ targetState: ImeiState; holderUserId: string | null; warehouseId: string | null; regionId: string | null; teamId: string | null; shopId: string | null }> {
  if (target.kind === 'WAREHOUSE') {
    const rows = await tx.query<{ warehouse_type: string; region_id: string | null }>(`select warehouse_type,region_id from public.warehouses where id=$1 and status='ACTIVE'`, [target.warehouseId]);
    if (rows.length !== 1) throw new ValidationError('Target warehouse not found or inactive.');
    return { targetState: rows[0]!.warehouse_type === 'MASTER' ? 'MASTER_WAREHOUSE' : 'REGIONAL_WAREHOUSE', holderUserId: null, warehouseId: target.warehouseId, regionId: rows[0]!.region_id, teamId: null, shopId: null };
  }
  if (target.kind === 'MANAGER') return { targetState:'ALLOCATED_TO_MANAGER', holderUserId:target.holderUserId, warehouseId:null, regionId:(await targetScope(tx,target)).region_id, teamId:null, shopId:null };
  if (target.kind === 'TEAM') return { targetState:'ALLOCATED_TO_TEAM', holderUserId:null, warehouseId:null, regionId:(await targetScope(tx,target)).region_id, teamId:target.teamId, shopId:null };
  if (target.kind === 'AGENT') return { targetState:'ALLOCATED_TO_AGENT', holderUserId:target.holderUserId, warehouseId:null, regionId:(await targetScope(tx,target)).region_id, teamId:target.teamId, shopId:null };
  return { targetState:'ALLOCATED_TO_SHOP', holderUserId:target.holderUserId, warehouseId:null, regionId:(await targetScope(tx,target)).region_id, teamId:target.teamId, shopId:target.shopId };
}

export class PostgresInventoryService {
  async requestAllocation(tx: DatabaseTransaction, actorUserId: string, command: AllocationRequest): Promise<AllocationResult> {
    if (!actorUserId.trim()) throw new ValidationError('actorUserId is required.');
    if (!command.imeiIds.length) throw new ValidationError('At least one IMEI is required.');
    if (!command.reason.trim()) throw new ValidationError('Reason is required.');

    const context = await loadAuthorizationContext(tx, actorUserId);
    const actorOrg = (await tx.query<{ organization_id: string }>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`, [actorUserId]))[0]?.organization_id;
    if (!actorOrg) throw new AuthorizationError('Actor is not linked to an active Amaal organization.');
    const decision = authorize(context, 'inventory.allocate');
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
    await assertTargetOwnership(tx, actorUserId, command.target, context);
    const destination = await targetDetails(tx, command.target);

    const locked: ImeiRow[] = [];
    for (const imeiId of [...new Set(command.imeiIds)]) {
      const rows = await tx.query<ImeiRow>(
        `select id, imei, state, current_holder_user_id, current_warehouse_id, current_region_id, current_team_id, current_shop_id, condition_status
         from public.imei_units where id=$1 for update`, [imeiId]);
      if (rows.length !== 1) throw new ValidationError(`IMEI ${imeiId} not found.`);
      const imei = rows[0]!;
        if (imei.state === 'SOLD' || imei.state === 'LOST') throw new ConflictError(`IMEI ${imei.imei} is not allocatable from state ${imei.state}.`);
      assertImeiTransition(imei.state, 'TRANSFER_PENDING');
      const sourceOrg = (await tx.query<{ organization_id:string }>(`select b.organization_id from public.imei_units i join public.product_variants pv on pv.id=i.product_variant_id join public.products p on p.id=pv.product_id join public.brands b on b.id=p.brand_id where i.id=$1`, [imei.id]))[0]?.organization_id;
      if (sourceOrg !== actorOrg) throw new AuthorizationError(`IMEI ${imei.imei} is outside the Amaal organization.`);
      const resource = {
        ...(imei.current_holder_user_id ? { ownerUserId: imei.current_holder_user_id } : {}),
        ...(imei.current_region_id ? { regionId: imei.current_region_id } : {}),
      };
      const sourceAccess = authorize(context, 'inventory.allocate', resource);
      if (!sourceAccess.allowed) throw new AuthorizationError(`Allocation source for IMEI ${imei.imei} is outside your scope.`);
      locked.push(imei);
    }

    if (!locked.length) throw new ValidationError('At least one unique IMEI is required.');
    const source = locked[0]!;
    for (const imei of locked) {
      if (imei.current_holder_user_id !== source.current_holder_user_id || imei.current_warehouse_id !== source.current_warehouse_id || imei.current_region_id !== source.current_region_id || imei.current_team_id !== source.current_team_id || imei.current_shop_id !== source.current_shop_id || imei.state !== source.state) {
        throw new ValidationError('An allocation batch must contain IMEIs from one source holder/location and state.');
      }
    }

    const allocationRows = await tx.query<{ id: string }>(
      `insert into public.stock_allocations
       (source_warehouse_id,source_holder_user_id,source_region_id,source_team_id,source_shop_id,target_warehouse_id,target_holder_user_id,target_team_id,target_shop_id,status,requested_by,notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'REQUESTED',$10,$11) returning id`,
      [source.current_warehouse_id,source.current_holder_user_id,source.current_region_id,source.current_team_id,source.current_shop_id,destination.warehouseId,destination.holderUserId,destination.teamId,destination.shopId,actorUserId,command.notes ?? command.reason],
    );
    if (allocationRows.length !== 1) throw new ValidationError('Allocation could not be created.');
    const allocationId = allocationRows[0]!.id;

    for (const imei of locked) {
      await tx.query(`insert into public.stock_allocation_items(allocation_id,imei_id,source_state) values ($1,$2,$3)`, [allocationId,imei.id,imei.state]);
      await tx.query(
        `insert into public.inventory_movements
         (imei_id,from_holder_user_id,from_warehouse_id,from_team_id,from_shop_id,reason,movement_type,requested_by,requested_at,condition_before,condition_after,notes,allocation_id)
         values ($1,$2,$3,$4,$5,$6,'ALLOCATION',$7,now(),$8,$8,$9,$10)`,
        [imei.id,imei.current_holder_user_id,imei.current_warehouse_id,imei.current_team_id,imei.current_shop_id,command.reason,actorUserId,imei.condition_status,`Allocation ${allocationId} reserved stock`,allocationId],
      );
      await tx.query(`update public.imei_units set state='TRANSFER_PENDING',updated_at=now() where id=$1`, [imei.id]);
    }

    await tx.query(
      `insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id)
       values ($1,'STOCK_ALLOCATION_REQUESTED','STOCK_ALLOCATION',$2,$3::jsonb,$4,current_setting('amaal.request_id', true))`,
      [actorUserId,allocationId,JSON.stringify({ imei_ids: locked.map((x)=>x.id), target_state: destination.targetState }),command.reason],
    );
    await tx.query(
      `insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload)
       values ('STOCK_ALLOCATION_REQUESTED','STOCK_ALLOCATION',$1,$2,$3,$4,$5::jsonb)`,
      [allocationId,destination.regionId,destination.teamId,actorUserId,JSON.stringify({ allocation_id:allocationId, imei_ids:locked.map((x)=>x.id), target_state:destination.targetState })],
    );

    return { allocationId, status:'REQUESTED', imeiIds: locked.map((x)=>x.id) };
  }

  async approveAllocation(tx: DatabaseTransaction, actorUserId: string, allocationId: string): Promise<void> {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const decision = authorize(context,'inventory.allocate');
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
    const rows = await tx.query<{ requested_by:string;status:string;source_region_id:string|null;target_warehouse_id:string|null;target_holder_user_id:string|null;target_team_id:string|null;target_shop_id:string|null }>(`select requested_by,status,source_region_id,target_warehouse_id,target_holder_user_id,target_team_id,target_shop_id from public.stock_allocations where id=$1 for update`,[allocationId]);
    if (rows.length !== 1) throw new ValidationError('Allocation not found.');
    const allocation = rows[0]!;
    if (allocation.status !== 'REQUESTED') throw new ConflictError(`Allocation is ${allocation.status}, not REQUESTED.`);
    if (allocation.requested_by === actorUserId) throw new AuthorizationError('Requester and approver must be different users.');
    const approvalTarget: AllocationTarget = allocation.target_shop_id
      ? { kind:'SHOP', holderUserId: allocation.target_holder_user_id ?? '', teamId: allocation.target_team_id ?? '', shopId: allocation.target_shop_id }
      : allocation.target_team_id && allocation.target_holder_user_id
        ? { kind:'AGENT', holderUserId: allocation.target_holder_user_id, teamId: allocation.target_team_id }
        : allocation.target_team_id
          ? { kind:'TEAM', teamId: allocation.target_team_id }
          : allocation.target_holder_user_id
            ? { kind:'MANAGER', holderUserId: allocation.target_holder_user_id }
            : { kind:'WAREHOUSE', warehouseId: allocation.target_warehouse_id ?? '' };
    await assertTargetOwnership(tx, actorUserId, approvalTarget, context);
    const approvalScope = await targetDetails(tx, approvalTarget);
    const sourceResource = {
      ...(allocation.source_holder_user_id ? { ownerUserId: allocation.source_holder_user_id } : {}),
      ...(allocation.source_region_id ? { regionId: allocation.source_region_id } : {}),
    };
    const sourceDecision = authorize(context, 'inventory.allocate', sourceResource);
    if (!sourceDecision.allowed) throw new AuthorizationError('Allocation source is outside your organizational scope.');
    assertAllocationTransition(allocation.status as AllocationStatus, 'APPROVED');
    await tx.query(`update public.stock_allocations set status='APPROVED',approved_by=$1,approved_at=now() where id=$2`,[actorUserId,allocationId]);
    await tx.query(`update public.inventory_movements set approved_by=$1,approved_at=now() where allocation_id=$2 and approved_by is null`,[actorUserId,allocationId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,request_id) values ($1,'STOCK_ALLOCATION_APPROVED','STOCK_ALLOCATION',$2,$3::jsonb,current_setting('amaal.request_id', true))`,[actorUserId,allocationId,JSON.stringify({status:'APPROVED'})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values ('STOCK_TRANSFER_APPROVED','STOCK_ALLOCATION',$1,$2,$3,$4,$5::jsonb)`,[allocationId,approvalScope.region_id,approvalScope.team_id,actorUserId,JSON.stringify({status:'APPROVED',allocation_id:allocationId})]);
  }


  async dispatchAllocation(tx: DatabaseTransaction, actorUserId: string, allocationId: string): Promise<void> {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const decision = authorize(context, 'inventory.transfer');
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
    const rows = await tx.query<{ status:string; requested_by:string; target_warehouse_id:string|null; target_holder_user_id:string|null; target_team_id:string|null; target_shop_id:string|null }>(
      `select status,requested_by,target_warehouse_id,target_holder_user_id,target_team_id,target_shop_id from public.stock_allocations where id=$1 for update`,
      [allocationId],
    );
    if (rows.length !== 1) throw new ValidationError('Allocation not found.');
    const allocation = rows[0]!;
    if (allocation.status !== 'APPROVED') throw new ConflictError(`Allocation is ${allocation.status}, not APPROVED.`);
    const target: AllocationTarget = allocation.target_shop_id
      ? { kind:'SHOP', holderUserId: allocation.target_holder_user_id ?? '', teamId: allocation.target_team_id ?? '', shopId: allocation.target_shop_id }
      : allocation.target_team_id && allocation.target_holder_user_id
        ? { kind:'AGENT', holderUserId: allocation.target_holder_user_id, teamId: allocation.target_team_id }
        : allocation.target_team_id
          ? { kind:'TEAM', teamId: allocation.target_team_id }
          : allocation.target_holder_user_id
            ? { kind:'MANAGER', holderUserId: allocation.target_holder_user_id }
            : { kind:'WAREHOUSE', warehouseId: allocation.target_warehouse_id ?? '' };
    await assertTargetOwnership(tx, actorUserId, target, context);
    const dispatchScope = await targetDetails(tx, target);
    assertAllocationTransition(allocation.status as AllocationStatus, 'IN_TRANSIT');
    await tx.query(`update public.stock_allocations set status='IN_TRANSIT' where id=$1`, [allocationId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,request_id) values ($1,'STOCK_ALLOCATION_DISPATCHED','STOCK_ALLOCATION',$2,$3::jsonb,current_setting('amaal.request_id', true))`, [actorUserId,allocationId,JSON.stringify({status:'IN_TRANSIT'})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values ('STOCK_TRANSFER_DISPATCHED','STOCK_ALLOCATION',$1,$2,$3,$4,$5::jsonb)`, [allocationId,dispatchScope.region_id,dispatchScope.team_id,actorUserId,JSON.stringify({status:'IN_TRANSIT',allocation_id:allocationId})]);
  }


  async cancelAllocation(tx: DatabaseTransaction, actorUserId: string, allocationId: string, mode: 'CANCELLED' | 'REJECTED', reason: string): Promise<void> {
    if (!reason.trim()) throw new ValidationError('Cancellation/rejection reason is required.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    const permission = mode === 'REJECTED' ? 'approvals.reject' : 'inventory.allocate';
    const decision = authorize(context, permission);
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
    const rows = await tx.query<{
      status:string; requested_by:string; source_holder_user_id:string|null; source_warehouse_id:string|null; source_region_id:string|null; source_team_id:string|null; source_shop_id:string|null;
    }>(`select status,requested_by,source_holder_user_id,source_warehouse_id,source_region_id,source_team_id,source_shop_id from public.stock_allocations where id=$1 for update`,[allocationId]);
    if (rows.length !== 1) throw new ValidationError('Allocation not found.');
    const allocation = rows[0]!;
    if (mode === 'CANCELLED' && allocation.requested_by !== actorUserId) throw new AuthorizationError('Only the allocation requester may cancel it before approval.');
    if (allocation.status !== 'REQUESTED') throw new ConflictError(`Allocation is ${allocation.status}; only REQUESTED allocations may be cancelled/rejected.`);
    assertAllocationTransition(allocation.status as AllocationStatus, mode);
    const items = await tx.query<{ imei_id:string; source_state:ImeiState }>(`select imei_id,source_state from public.stock_allocation_items where allocation_id=$1`,[allocationId]);
    for (const item of items) {
      const imeis = await tx.query<{ imei:string; state:ImeiState; condition_status:string }>(`select imei,state,condition_status from public.imei_units where id=$1 for update`,[item.imei_id]);
      if (imeis.length !== 1) throw new ValidationError('IMEI not found while cancelling allocation.');
      const imei = imeis[0]!;
      if (imei.state !== 'TRANSFER_PENDING') throw new ConflictError(`IMEI ${imei.imei} is ${imei.state}; cancellation would be unsafe.`);
      assertImeiTransition('TRANSFER_PENDING',item.source_state);
      await tx.query(`update public.imei_units set state=$1,current_holder_user_id=$2,current_warehouse_id=$3,current_region_id=$4,current_team_id=$5,current_shop_id=$6,current_holder_started_at=case when $2 is not null then coalesce(current_holder_started_at,now()) else null end,updated_at=now() where id=$7`,[item.source_state,allocation.source_holder_user_id,allocation.source_warehouse_id,allocation.source_region_id,allocation.source_team_id,allocation.source_shop_id,item.imei_id]);
      await tx.query(`insert into public.inventory_movements(imei_id,from_holder_user_id,to_holder_user_id,from_warehouse_id,to_warehouse_id,to_team_id,to_shop_id,reason,movement_type,requested_by,accepted_by,requested_at,accepted_at,condition_before,condition_after,notes,allocation_id) values ($1,null,$2,null,$3,$4,$5,$6,'ADJUSTMENT',$7,$7,now(),now(),$8,$8,$9,$10)`,[item.imei_id,allocation.source_holder_user_id,allocation.source_warehouse_id,allocation.source_team_id,allocation.source_shop_id,reason,actorUserId,imei.condition_status,`Allocation ${allocationId} ${mode.toLowerCase()}; stock returned to source`,allocationId]);
    }
    await tx.query(`update public.stock_allocations set status=$1 where id=$2`,[mode,allocationId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values ($1,$2,'STOCK_ALLOCATION',$3,$4::jsonb,$5,current_setting('amaal.request_id',true))`,[actorUserId,mode==='CANCELLED'?'STOCK_ALLOCATION_CANCELLED':'STOCK_ALLOCATION_REJECTED',allocationId,JSON.stringify({status:mode,imei_count:items.length}),reason]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values ($1,'STOCK_ALLOCATION',$2,$3,$4,$5::jsonb)`,[mode==='CANCELLED'?'STOCK_TRANSFER_CANCELLED':'STOCK_TRANSFER_REJECTED',allocationId,allocation.source_region_id,actorUserId,JSON.stringify({allocation_id:allocationId,status:mode,reason})]);
  }

  async receiveAllocation(tx: DatabaseTransaction, actorUserId: string, allocationId: string): Promise<void> {
    const context = await loadAuthorizationContext(tx,actorUserId);
    const decision = authorize(context,'inventory.allocate');
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
    const rows = await tx.query<{ status:string;source_warehouse_id:string|null;source_holder_user_id:string|null;source_region_id:string|null;source_team_id:string|null;source_shop_id:string|null;target_warehouse_id:string|null;target_holder_user_id:string|null;target_team_id:string|null;target_shop_id:string|null }>(
      `select status,source_warehouse_id,source_holder_user_id,source_region_id,source_team_id,source_shop_id,target_warehouse_id,target_holder_user_id,target_team_id,target_shop_id from public.stock_allocations where id=$1 for update`,[allocationId]);
    if (rows.length !== 1) throw new ValidationError('Allocation not found.');
    const allocation = rows[0]!;
    if (allocation.status !== 'IN_TRANSIT') throw new ConflictError(`Allocation is ${allocation.status}, not IN_TRANSIT.`);
    const target: AllocationTarget = allocation.target_shop_id
      ? { kind:'SHOP', holderUserId: allocation.target_holder_user_id ?? '', teamId: allocation.target_team_id ?? '', shopId: allocation.target_shop_id }
      : allocation.target_team_id && allocation.target_holder_user_id
        ? { kind:'AGENT', holderUserId: allocation.target_holder_user_id, teamId: allocation.target_team_id }
        : allocation.target_team_id
          ? { kind:'TEAM', teamId: allocation.target_team_id }
          : allocation.target_holder_user_id
            ? { kind:'MANAGER', holderUserId: allocation.target_holder_user_id }
            : { kind:'WAREHOUSE', warehouseId: allocation.target_warehouse_id ?? '' };
    await assertTargetOwnership(tx, actorUserId, target, context);

    const items = await tx.query<{ imei_id:string;source_state:ImeiState }>('select imei_id,source_state from public.stock_allocation_items where allocation_id=$1',[allocationId]);
    if (!items.length) throw new ValidationError('Allocation has no items.');
    let finalState: ImeiState;
    let finalRegionId: string | null = null;
    if (allocation.target_shop_id) {
      const team = await tx.query<{ region_id:string }>(`select region_id from public.teams where id=$1 and status='ACTIVE'`,[allocation.target_team_id]);
      if (team.length!==1) throw new ValidationError('Target shop team not found.');
      finalState='ALLOCATED_TO_SHOP';
      finalRegionId=team[0]!.region_id;
    } else if (allocation.target_holder_user_id) {
      const roles = await tx.query<{ role:string }>(`select role from public.role_assignments where user_id=$1 and status='ACTIVE' order by case role when 'SHOP_OWNER' then 1 when 'AGENT' then 2 when 'MANAGER' then 3 else 4 end`,[allocation.target_holder_user_id]);
      const role=roles[0]?.role;
      if (role==='MANAGER') {
        finalState='ALLOCATED_TO_MANAGER';
        const region=await tx.query<{ region_id:string }>(`select region_id from public.managers where user_id=$1 and status='ACTIVE'`,[allocation.target_holder_user_id]);
        finalRegionId=region[0]?.region_id ?? null;
      } else if (role==='AGENT') {
        finalState='ALLOCATED_TO_AGENT';
        const team=await tx.query<{ region_id:string }>(`select region_id from public.teams where id=$1 and status='ACTIVE'`,[allocation.target_team_id]);
        if (team.length!==1) throw new ValidationError('Target agent team not found.');
        finalRegionId=team[0]!.region_id;
      } else if (role==='SHOP_OWNER') {
        finalState='ALLOCATED_TO_SHOP';
        const team=await tx.query<{ region_id:string }>(`select region_id from public.teams where id=$1 and status='ACTIVE'`,[allocation.target_team_id]);
        if (team.length!==1) throw new ValidationError('Target shop team not found.');
        finalRegionId=team[0]!.region_id;
      } else throw new ValidationError('Target holder does not have a supported inventory role.');
    } else if (allocation.target_team_id) {
      const team=await tx.query<{ region_id:string }>(`select region_id from public.teams where id=$1 and status='ACTIVE'`,[allocation.target_team_id]);
      if (team.length!==1) throw new ValidationError('Target team not found.');
      finalState='ALLOCATED_TO_TEAM'; finalRegionId=team[0]!.region_id;
    } else if (allocation.target_warehouse_id) {
      const wh=await tx.query<{ warehouse_type:string;region_id:string|null }>(`select warehouse_type,region_id from public.warehouses where id=$1 and status='ACTIVE'`,[allocation.target_warehouse_id]);
      if (wh.length!==1) throw new ValidationError('Target warehouse not found.');
      finalState=wh[0]!.warehouse_type==='MASTER'?'MASTER_WAREHOUSE':'REGIONAL_WAREHOUSE'; finalRegionId=wh[0]!.region_id;
    } else throw new ValidationError('Allocation target is incomplete.');

    for (const item of items) {
      const imeis=await tx.query<{ imei:string;state:ImeiState;condition_status:string }>(`select imei,state,condition_status from public.imei_units where id=$1 for update`,[item.imei_id]);
      if (imeis.length!==1) throw new ValidationError('IMEI not found during receipt.');
      const imei=imeis[0]!;
      if (imei.state!=='TRANSFER_PENDING') throw new ConflictError(`IMEI ${imei.imei} is ${imei.state}; expected TRANSFER_PENDING.`);
      assertImeiTransition(imei.state,finalState);
      const targetWarehouse=(finalState==='MASTER_WAREHOUSE'||finalState==='REGIONAL_WAREHOUSE')?allocation.target_warehouse_id:null;
      await tx.query(`update public.imei_units set state=$1,current_holder_user_id=$2,current_warehouse_id=$3,current_region_id=$4,current_team_id=$5,current_shop_id=$6,current_holder_started_at=case when $2 is not null then now() else null end,field_age_started_at=coalesce(field_age_started_at,now()),aging_due_at=coalesce(aging_due_at, now() + interval '18 days'),updated_at=now() where id=$7`,[finalState,allocation.target_holder_user_id,targetWarehouse,finalRegionId,allocation.target_team_id,allocation.target_shop_id,item.imei_id]);
      await tx.query(`insert into public.inventory_movements(imei_id,from_holder_user_id,to_holder_user_id,from_warehouse_id,to_warehouse_id,from_team_id,to_team_id,from_shop_id,to_shop_id,reason,movement_type,requested_by,approved_by,accepted_by,requested_at,approved_at,accepted_at,condition_before,condition_after,notes,allocation_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ALLOCATION_RECEIVED','ALLOCATION',$10,(select approved_by from public.stock_allocations where id=$11),$12,(select requested_at from public.stock_allocations where id=$11),(select approved_at from public.stock_allocations where id=$11),now(),$13,$13,$14,$11)`,[item.imei_id,allocation.source_holder_user_id,allocation.target_holder_user_id,allocation.source_warehouse_id,targetWarehouse,allocation.source_team_id,allocation.target_team_id,allocation.source_shop_id,allocation.target_shop_id,actorUserId,allocationId,actorUserId,imei.condition_status,`Allocation ${allocationId} received`]);
    }
    await tx.query(`update public.stock_allocations set status='RECEIVED',received_by=$1,received_at=now(),aging_start_at=coalesce(aging_start_at,now()) where id=$2`,[actorUserId,allocationId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,request_id) values ($1,'STOCK_ALLOCATION_RECEIVED','STOCK_ALLOCATION',$2,$3::jsonb,current_setting('amaal.request_id', true))`,[actorUserId,allocationId,JSON.stringify({status:'RECEIVED',imei_count:items.length,final_state:finalState})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values ('STOCK_RECEIVED','STOCK_ALLOCATION',$1,$2,$3,$4,$5::jsonb)`,[allocationId,finalRegionId,allocation.target_team_id,actorUserId,JSON.stringify({allocation_id:allocationId,imei_count:items.length,final_state:finalState})]);
  }

  async returnToWarehouse(
    tx: DatabaseTransaction,
    actorUserId: string,
    input: { imeiId: string; warehouseId: string; reason: string; approvalId?: string },
  ): Promise<void> {
    if (!input.reason.trim()) throw new ValidationError('Return reason is required.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, 'inventory.transfer');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);

    const warehouseRows = await tx.query<{ warehouse_type: string; region_id: string | null; status: string }>(
      `select warehouse_type,region_id,status from public.warehouses where id=$1`, [input.warehouseId],
    );
    if (warehouseRows.length !== 1 || warehouseRows[0]!.status !== 'ACTIVE') throw new ValidationError('Return warehouse not found or inactive.');
    const warehouse = warehouseRows[0]!;

    const imeiRows = await tx.query<ImeiRow>(
      `select id,imei,state,current_holder_user_id,current_warehouse_id,current_region_id,current_team_id,current_shop_id,condition_status
       from public.imei_units where id=$1 for update`, [input.imeiId],
    );
    if (imeiRows.length !== 1) throw new ValidationError('IMEI not found.');
    const imei = imeiRows[0]!;
    const fieldStates: readonly ImeiState[] = ['ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP'];
    if (!fieldStates.includes(imei.state)) throw new ConflictError(`IMEI ${imei.imei} is ${imei.state}; only field-held stock can be returned by this workflow.`);
    if (warehouse.warehouse_type === 'REGIONAL' && warehouse.region_id !== imei.current_region_id) {
      throw new AuthorizationError('Regional return warehouse must belong to the IMEI region.');
    }
    assertImeiTransition(imei.state, 'RETURNED');

    const returnApproval = input.approvalId
      ? (await tx.query<{ approval_type:string; status:string; requested_by:string; decided_by:string|null }>(
          `select ar.approval_type,ar.status,ar.requested_by,ad.decided_by
             from public.approval_requests ar
             left join lateral (select decided_by from public.approval_decisions where approval_request_id=ar.id and decision='APPROVED' order by decided_at desc limit 1) ad on true
             where ar.id=$1 for update`, [input.approvalId],
        ))[0]
      : undefined;
    if (input.approvalId) {
      if (!returnApproval || returnApproval.approval_type !== 'FINANCIAL_CORRECTION' && returnApproval.approval_type !== 'WAREHOUSE_CORRECTION') {
        throw new ValidationError('Return approval is missing or not a return/warehouse correction approval.');
      }
      if (returnApproval.status !== 'APPROVED') throw new ConflictError(`Return approval is ${returnApproval.status}.`);
    }

    await tx.query(`update public.imei_units set state='RETURNED',updated_at=now() where id=$1`, [input.imeiId]);
    await tx.query(
      `insert into public.inventory_movements
       (imei_id,from_holder_user_id,from_warehouse_id,from_team_id,from_shop_id,reason,movement_type,requested_by,approved_by,accepted_by,requested_at,approved_at,accepted_at,condition_before,condition_after,notes,approval_id)
       values ($1,$2,$3,$4,$5,$6,'RETURN',$7,$8,$7,now(),case when $8 is null then null else now() end,now(),$9,$9,$10,$11)`,
      [input.imeiId,imei.current_holder_user_id,imei.current_warehouse_id,imei.current_team_id,imei.current_shop_id,input.reason,actorUserId,returnApproval?.decided_by ?? null,imei.condition_status,`Field custody returned; awaiting warehouse state transition`,input.approvalId ?? null],
    );

    const finalState: ImeiState = warehouse.warehouse_type === 'MASTER' ? 'MASTER_WAREHOUSE' : 'REGIONAL_WAREHOUSE';
    assertImeiTransition('RETURNED', finalState);
    await tx.query(
      `update public.imei_units
       set state=$1,current_holder_user_id=null,current_warehouse_id=$2,current_region_id=$3,current_team_id=null,current_shop_id=null,current_holder_started_at=null,field_age_started_at=null,aging_due_at=null,updated_at=now()
       where id=$4`,
      [finalState,input.warehouseId,warehouse.region_id,input.imeiId],
    );
    await tx.query(
      `insert into public.inventory_movements
       (imei_id,from_holder_user_id,to_warehouse_id,from_team_id,from_shop_id,reason,movement_type,requested_by,approved_by,accepted_by,requested_at,approved_at,accepted_at,condition_before,condition_after,notes,approval_id)
       values ($1,$2,$3,$4,$5,$6,'RETURN',$7,$8,$7,now(),case when $8 is null then null else now() end,now(),$9,$9,$10,$11)`,
      [input.imeiId,imei.current_holder_user_id,input.warehouseId,imei.current_team_id,imei.current_shop_id,'WAREHOUSE_ACCEPTED_RETURN',actorUserId,returnApproval?.decided_by ?? null,imei.condition_status,`Return accepted into ${finalState}`,input.approvalId ?? null],
    );
    await tx.query(
      `insert into public.audit_events(actor_user_id,action,target_type,target_id,previous_state,new_state,reason,approval_id,request_id)
       values ($1,'STOCK_RETURNED','IMEI',$2,$3::jsonb,$4::jsonb,$5,$6,current_setting('amaal.request_id',true))`,
      [actorUserId,input.imeiId,JSON.stringify({state:imei.state,current_holder_user_id:imei.current_holder_user_id,current_warehouse_id:imei.current_warehouse_id}),JSON.stringify({state:finalState,warehouse_id:input.warehouseId}),input.reason,input.approvalId ?? null],
    );
    await tx.query(
      `insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload)
       values ('STOCK_RETURNED','IMEI',$1,$2,$3,$4::jsonb)`,
      [input.imeiId,warehouse.region_id,actorUserId,JSON.stringify({imei_id:input.imeiId,warehouse_id:input.warehouseId,state:finalState})],
    );
  }

  async executeApprovedCorrection(
    tx: DatabaseTransaction,
    actorUserId: string,
    input: { imeiId: string; approvalId: string; targetState: ImeiState; targetHolderUserId?: string; targetWarehouseId?: string; targetRegionId?: string; targetTeamId?: string; targetShopId?: string; reason: string; movementType?: 'ADJUSTMENT' | 'WRITE_OFF' },
  ): Promise<void> {
    if (!input.reason.trim()) throw new ValidationError('Correction reason is required.');
    if (!input.approvalId.trim()) throw new ValidationError('approvalId is required.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, input.movementType === 'WRITE_OFF' ? 'inventory.writeoff' : 'inventory.adjust');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);

    const approvals = await tx.query<{ approval_type:string; status:string; requested_by:string }>(
      `select ar.approval_type,ar.status,ar.requested_by,ad.decided_by
             from public.approval_requests ar
             left join lateral (select decided_by from public.approval_decisions where approval_request_id=ar.id and decision='APPROVED' order by decided_at desc limit 1) ad on true
             where ar.id=$1 for update`, [input.approvalId],
    );
    if (approvals.length !== 1) throw new ValidationError('Approval request not found.');
    const approval = approvals[0]!;
    const expected = input.movementType === 'WRITE_OFF' ? 'WRITE_OFF' : 'INVENTORY_ADJUSTMENT';
    if (approval.approval_type !== expected) throw new ValidationError(`Approval type must be ${expected}.`);
    if (approval.status !== 'APPROVED') throw new ConflictError(`Approval is ${approval.status}; execution is blocked.`);
    if (approval.requested_by === actorUserId) throw new AuthorizationError('Requester and correction executor must be different users.');

    const imeiRows = await tx.query<ImeiRow>(
      `select id,imei,state,current_holder_user_id,current_warehouse_id,current_region_id,current_team_id,current_shop_id,condition_status from public.imei_units where id=$1 for update`, [input.imeiId],
    );
    if (imeiRows.length !== 1) throw new ValidationError('IMEI not found.');
    const imei = imeiRows[0]!;
    assertImeiTransition(imei.state, input.targetState);

    const holder = input.targetHolderUserId ?? null;
    const warehouse = input.targetWarehouseId ?? null;
    const region = input.targetRegionId ?? null;
    if (holder && warehouse) throw new ValidationError('Corrected IMEI cannot have both a holder and warehouse.');
    if ((input.targetState === 'MASTER_WAREHOUSE' || input.targetState === 'REGIONAL_WAREHOUSE') && !warehouse) throw new ValidationError('Warehouse is required for a warehouse state.');
    if (input.targetState.startsWith('ALLOCATED_') && !holder && input.targetState !== 'ALLOCATED_TO_TEAM') throw new ValidationError('Holder is required for holder allocation states.');
    if (input.targetState === 'ALLOCATED_TO_TEAM' && !input.targetTeamId) throw new ValidationError('Team is required for ALLOCATED_TO_TEAM.');

    await tx.query(
      `update public.imei_units set state=$1,current_holder_user_id=$2,current_warehouse_id=$3,current_region_id=$4,current_holder_started_at=case when $2 is not null then now() else null end,current_team_id=$5,current_shop_id=$6,updated_at=now() where id=$7`,
      [input.targetState,holder,warehouse,region,input.targetTeamId ?? null,input.targetShopId ?? null,input.imeiId],
    );
    await tx.query(
      `insert into public.inventory_movements
       (imei_id,from_holder_user_id,to_holder_user_id,from_warehouse_id,to_warehouse_id,from_team_id,to_team_id,from_shop_id,to_shop_id,reason,movement_type,requested_by,approved_by,accepted_by,requested_at,approved_at,accepted_at,condition_before,condition_after,notes,approval_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12,now(),now(),now(),$14,$15,$16,$17)`,
      [input.imeiId,imei.current_holder_user_id,holder,imei.current_warehouse_id,warehouse,imei.current_team_id,input.targetTeamId ?? null,imei.current_shop_id,input.targetShopId ?? null,input.reason,input.movementType ?? 'ADJUSTMENT',approval.requested_by,actorUserId,imei.condition_status,input.targetState,`Approved correction executed; team=${input.targetTeamId ?? 'n/a'}; shop=${input.targetShopId ?? 'n/a'}`,input.approvalId],
    );
    await tx.query(
      `insert into public.audit_events(actor_user_id,action,target_type,target_id,previous_state,new_state,reason,approval_id,request_id)
       values ($1,$2,'IMEI',$3,$4::jsonb,$5::jsonb,$6,$7,current_setting('amaal.request_id',true))`,
      [actorUserId,input.movementType === 'WRITE_OFF' ? 'STOCK_WRITTEN_OFF' : 'STOCK_ADJUSTED',input.imeiId,JSON.stringify({state:imei.state,holder_user_id:imei.current_holder_user_id,warehouse_id:imei.current_warehouse_id}),JSON.stringify({state:input.targetState,holder_user_id:holder,warehouse_id:warehouse,region_id:region}),input.reason,input.approvalId],
    );
    await tx.query(
      `insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload)
       values ($1,'IMEI',$2,$3,$4,$5::jsonb)`,
      [input.movementType === 'WRITE_OFF' ? 'STOCK_WRITTEN_OFF' : 'STOCK_ADJUSTED',input.imeiId,region,actorUserId,JSON.stringify({imei_id:input.imeiId,target_state:input.targetState,approval_id:input.approvalId})],
    );
  }
}

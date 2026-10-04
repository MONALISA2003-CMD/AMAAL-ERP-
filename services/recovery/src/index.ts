import { randomUUID } from 'node:crypto';
import type { DatabaseTransaction } from '@amaal/database';
import { assertImeiTransition, assertRecoveryTransition, type ImeiState, type RecoveryState } from '@amaal/business-rules';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

export type RecoveryActivityType = 'CONTACTED'|'VISITED'|'PROMISE_TO_RETURN'|'FAILED_ATTEMPT'|'RECOVERED'|'ESCALATED';

export type CreateRecoveryCaseInput = {
  imeiId: string;
  customerId?: string;
  reason: string;
  priority?: number;
  dueAt?: string;
  notes?: string;
};

export type AssignRecoveryCaseInput = { caseId: string; officerUserId: string };

export type RecoveryActivityInput = {
  caseId: string;
  activityType: RecoveryActivityType;
  result?: string;
  verifiedImei?: string;
  notes?: string;
};

export type AcceptRecoveredStockInput = {
  caseId: string;
  warehouseId: string;
  scannedImei: string;
};

export type RecoveryTransitionCommand = {
  caseId: string;
  fromState: RecoveryState;
  toState: RecoveryState;
  actorUserId: string;
  imeiId: string;
};

function caseNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `REC-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function privileged(context: Awaited<ReturnType<typeof loadAuthorizationContext>>): boolean {
  return context.roles.includes('CEO') || context.roles.includes('ADMIN');
}

function assertAssignedOrPrivileged(
  context: Awaited<ReturnType<typeof loadAuthorizationContext>>,
  actorUserId: string,
  assignedOfficerUserId: string | null,
): void {
  if (privileged(context)) return;
  if (assignedOfficerUserId === actorUserId) return;
  throw new AuthorizationError('Recovery case is assigned to another officer.');
}

async function assertWarehouseScope(
  tx: DatabaseTransaction,
  actorUserId: string,
  warehouseId: string,
  sourceRegionId: string | null,
  context: Awaited<ReturnType<typeof loadAuthorizationContext>>,
): Promise<{ warehouseType: 'MASTER' | 'REGIONAL'; regionId: string | null }> {
  const rows = await tx.query<{ warehouse_type: 'MASTER'|'REGIONAL'; region_id: string | null; status: string }>(
    `select warehouse_type,region_id,status from public.warehouses where id=$1`,
    [warehouseId],
  );
  if (rows.length !== 1 || rows[0]!.status !== 'ACTIVE') throw new ValidationError('Recovery warehouse not found or inactive.');
  const warehouse = rows[0]!;
  if (warehouse.warehouse_type === 'REGIONAL' && sourceRegionId && warehouse.region_id !== sourceRegionId) {
    throw new AuthorizationError('Recovery warehouse is outside the IMEI region.');
  }
  if (warehouse.warehouse_type === 'REGIONAL' && !sourceRegionId) {
    throw new ValidationError('Regional recovery requires an IMEI region.');
  }
  if (privileged(context)) return { warehouseType: warehouse.warehouse_type, regionId: warehouse.region_id };
  if (warehouse.warehouse_type === 'MASTER') {
    if (!context.roles.includes('RECOVERY_OFFICER') && !context.roles.includes('REGIONAL_MANAGER')) {
      throw new AuthorizationError('Only recovery/privileged roles may accept into the Master Warehouse.');
    }
    return { warehouseType: warehouse.warehouse_type, regionId: null };
  }
  if (context.roles.includes('REGIONAL_MANAGER') && warehouse.region_id && context.regionIds.includes(warehouse.region_id)) {
    return { warehouseType: warehouse.warehouse_type, regionId: warehouse.region_id };
  }
  if (context.roles.includes('RECOVERY_OFFICER')) return { warehouseType: warehouse.warehouse_type, regionId: warehouse.region_id };
  throw new AuthorizationError(`User ${actorUserId} is not authorized for the recovery warehouse.`);
}

export class PostgresRecoveryService {
  async createCase(tx: DatabaseTransaction, actorUserId: string, input: CreateRecoveryCaseInput): Promise<string> {
    if (!input.imeiId.trim()) throw new ValidationError('imeiId is required.');
    if (!input.reason.trim()) throw new ValidationError('Recovery reason is required.');
    if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0)) throw new ValidationError('priority must be a non-negative integer.');

    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, 'recovery.assign');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);

    const imeis = await tx.query<{
      id: string; imei: string; state: ImeiState; current_holder_user_id: string | null; current_region_id: string | null; condition_status: string;
    }>(`select id,imei,state,current_holder_user_id,current_region_id,condition_status from public.imei_units where id=$1 for update`, [input.imeiId]);
    if (imeis.length !== 1) throw new ValidationError('IMEI not found.');
    const imei = imeis[0]!;
    const sellableHeldStates: readonly ImeiState[] = ['ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP'];
    if (!sellableHeldStates.includes(imei.state)) throw new ConflictError(`IMEI ${imei.imei} is ${imei.state}; only field-held stock can enter recovery.`);
    assertImeiTransition(imei.state, 'RECOVERY_PENDING');

    const duplicate = await tx.query<{ id: string }>(
      `select id from public.recovery_cases where imei_id=$1 and status not in ('CLOSED','CANCELLED') limit 1`,
      [input.imeiId],
    );
    if (duplicate.length) throw new ConflictError('An active recovery case already exists for this IMEI.');

    const number = caseNumber();
    const rows = await tx.query<{ id: string }>(
      `insert into public.recovery_cases(case_number,imei_id,customer_id,status,priority,reason,due_at,notes)
       values ($1,$2,$3,'OPEN',$4,$5,$6,$7) returning id`,
      [number,input.imeiId,input.customerId ?? null,input.priority ?? 0,input.reason,input.dueAt ?? null,input.notes ?? null],
    );
    if (rows.length !== 1) throw new ValidationError('Recovery case could not be created.');
    const caseId = rows[0]!.id;

    await tx.query(
      `update public.imei_units set state='RECOVERY_PENDING',updated_at=now() where id=$1`,
      [input.imeiId],
    );
    await tx.query(
      `insert into public.inventory_movements
       (imei_id,from_holder_user_id,from_team_id,from_shop_id,reason,movement_type,requested_by,accepted_by,requested_at,accepted_at,condition_before,condition_after,notes,recovery_case_id)
       values ($1,$2,$3,$4,$5,'RECOVERY',$6,$6,now(),now(),$7,$7,$8,$9)`,
      [input.imeiId,imei.current_holder_user_id,imei.current_team_id,imei.current_shop_id,input.reason,actorUserId,imei.condition_status,`Recovery case ${caseId} opened`,caseId],
    );
    await tx.query(
      `insert into public.audit_events(actor_user_id,action,target_type,target_id,previous_state,new_state,reason,request_id)
       values ($1,'RECOVERY_CREATED','RECOVERY_CASE',$2,$3::jsonb,$4::jsonb,$5,current_setting('amaal.request_id',true))`,
      [actorUserId,caseId,JSON.stringify({ imei_state: imei.state }),JSON.stringify({ case_status:'OPEN', imei_state:'RECOVERY_PENDING', imei_id:input.imeiId }),input.reason],
    );
    await tx.query(
      `insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload)
       values ('RECOVERY_CREATED','RECOVERY_CASE',$1,$2,$3,$4::jsonb)`,
      [caseId,imei.current_region_id,actorUserId,JSON.stringify({ case_id:caseId,case_number:number,imei_id:input.imeiId,priority:input.priority ?? 0 })],
    );
    return caseId;
  }

  async assignCase(tx: DatabaseTransaction, actorUserId: string, input: AssignRecoveryCaseInput): Promise<void> {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, 'recovery.assign');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    if (!input.officerUserId.trim()) throw new ValidationError('officerUserId is required.');

    const cases = await tx.query<{ id:string; status:string; imei_id:string; current_region_id:string|null }>(
      `select rc.id,rc.status,rc.imei_id,i.current_region_id from public.recovery_cases rc join public.imei_units i on i.id=rc.imei_id where rc.id=$1 for update`,
      [input.caseId],
    );
    if (cases.length !== 1) throw new ValidationError('Recovery case not found.');
    const recoveryCase = cases[0]!;
    if (recoveryCase.status !== 'OPEN') throw new ConflictError(`Recovery case is ${recoveryCase.status}; only OPEN cases can be assigned.`);

    const officer = await tx.query<{ role:string; status:string }>(
      `select ra.role,p.status from public.role_assignments ra join public.profiles p on p.user_id=ra.user_id where ra.user_id=$1 and ra.status='ACTIVE' and p.status='ACTIVE' and ra.role='RECOVERY_OFFICER'`,
      [input.officerUserId],
    );
    if (officer.length !== 1) throw new ValidationError('Assigned user must be an active Recovery Officer.');
    if (!privileged(context) && context.roles.includes('REGIONAL_MANAGER') && recoveryCase.current_region_id && !context.regionIds.includes(recoveryCase.current_region_id)) {
      throw new AuthorizationError('Recovery case is outside your region.');
    }

    assertRecoveryTransition('OPEN','ASSIGNED');
    await tx.query(`update public.recovery_cases set status='ASSIGNED',assigned_officer_user_id=$1,updated_at=now() where id=$2`,[input.officerUserId,input.caseId]);
await tx.query(`update public.recovery_case_assignments set ended_at=now() where recovery_case_id=$1 and ended_at is null`,[input.caseId]);
    await tx.query(`insert into public.recovery_case_assignments(recovery_case_id,officer_user_id,assigned_by,assignment_reason) values($1,$2,$3,'Manual recovery assignment')`,[input.caseId,input.officerUserId,actorUserId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,request_id) values ($1,'RECOVERY_ASSIGNED','RECOVERY_CASE',$2,$3::jsonb,current_setting('amaal.request_id',true))`,[actorUserId,input.caseId,JSON.stringify({status:'ASSIGNED',assigned_officer_user_id:input.officerUserId})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values ('RECOVERY_ASSIGNED','RECOVERY_CASE',$1,$2,$3,$4::jsonb)`,[input.caseId,recoveryCase.current_region_id,actorUserId,JSON.stringify({case_id:input.caseId,assigned_officer_user_id:input.officerUserId})]);
  }

  async addActivity(tx: DatabaseTransaction, actorUserId: string, input: RecoveryActivityInput): Promise<string> {
    if (!input.caseId.trim()) throw new ValidationError('caseId is required.');
    if (!input.activityType) throw new ValidationError('activityType is required.');
    const context = await loadAuthorizationContext(tx,actorUserId);
    const auth = authorize(context,'recovery.view');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    const cases = await tx.query<{ status:string; assigned_officer_user_id:string|null; imei_id:string }>(`select status,assigned_officer_user_id,imei_id from public.recovery_cases where id=$1 for update`,[input.caseId]);
    if (cases.length!==1) throw new ValidationError('Recovery case not found.');
    const recoveryCase = cases[0]!;
    if (!['ASSIGNED','IN_PROGRESS','PROMISED_RETURN','ESCALATED'].includes(recoveryCase.status)) throw new ConflictError(`Recovery case is ${recoveryCase.status}; activity cannot be added.`);
    assertAssignedOrPrivileged(context,actorUserId,recoveryCase.assigned_officer_user_id);

    if (input.activityType==='RECOVERED') {
      if (!input.verifiedImei?.trim()) throw new ValidationError('verifiedImei is required for RECOVERED activity.');
      const imeiRows = await tx.query<{ imei:string; state:ImeiState }>(`select imei,state from public.imei_units where id=$1 for update`,[recoveryCase.imei_id]);
      if (imeiRows.length!==1) throw new ValidationError('IMEI not found.');
      if (imeiRows[0]!.imei !== input.verifiedImei.trim()) throw new ConflictError('Scanned IMEI does not match the recovery case asset.');
    }

    const rows = await tx.query<{ id:string }>(
      `insert into public.recovery_activities(recovery_case_id,officer_user_id,activity_type,result,verified_imei,notes)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [input.caseId,actorUserId,input.activityType,input.result ?? null,input.verifiedImei?.trim() ?? null,input.notes ?? null],
    );
    if(rows.length!==1) throw new ValidationError('Recovery activity could not be recorded.');
    let nextStatus: RecoveryState | null = null;
    if (input.activityType === 'PROMISE_TO_RETURN') nextStatus = 'PROMISED_RETURN';
    else if (input.activityType === 'ESCALATED') nextStatus = 'ESCALATED';
    else if (recoveryCase.status === 'ASSIGNED') nextStatus = 'IN_PROGRESS';
    if (nextStatus && nextStatus !== recoveryCase.status) {
      assertRecoveryTransition(recoveryCase.status as RecoveryState, nextStatus);
      await tx.query(`update public.recovery_cases set status=$1,updated_at=now() where id=$2`,[nextStatus,input.caseId]);
    }
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,request_id) values ($1,'RECOVERY_ACTIVITY_RECORDED','RECOVERY_CASE',$2,$3::jsonb,current_setting('amaal.request_id',true))`,[actorUserId,input.caseId,JSON.stringify({activity_type:input.activityType})]);
    return rows[0]!.id;
  }

  async acceptRecoveredStock(tx: DatabaseTransaction, actorUserId: string, input: AcceptRecoveredStockInput): Promise<void> {
    if (!input.scannedImei.trim()) throw new ValidationError('scannedImei is required.');
    const context = await loadAuthorizationContext(tx,actorUserId);
    const auth = authorize(context,'recovery.close');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);

    const cases = await tx.query<{ status:string; assigned_officer_user_id:string|null; imei_id:string; current_region_id:string|null; current_holder_user_id:string|null }>(
      `select rc.status,rc.assigned_officer_user_id,rc.imei_id,i.current_region_id,i.current_holder_user_id,i.current_team_id,i.current_shop_id from public.recovery_cases rc join public.imei_units i on i.id=rc.imei_id where rc.id=$1 for update`,
      [input.caseId],
    );
    if(cases.length!==1) throw new ValidationError('Recovery case not found.');
    const recoveryCase=cases[0]!;
    if(!['IN_PROGRESS','PROMISED_RETURN','ESCALATED'].includes(recoveryCase.status)) throw new ConflictError(`Recovery case is ${recoveryCase.status}; it cannot be accepted yet.`);
    assertAssignedOrPrivileged(context,actorUserId,recoveryCase.assigned_officer_user_id);
    assertRecoveryTransition(recoveryCase.status as RecoveryState,'RECOVERED');

    const imeis=await tx.query<{ imei:string; state:ImeiState; condition_status:string; current_team_id:string|null; current_shop_id:string|null }>(`select imei,state,condition_status,current_team_id,current_shop_id from public.imei_units where id=$1 for update`,[recoveryCase.imei_id]);
    if(imeis.length!==1) throw new ValidationError('IMEI not found.');
    const imei=imeis[0]!;
    if(imei.imei!==input.scannedImei.trim()) throw new ConflictError('Scanned IMEI does not match the recovery case asset.');
    if(imei.state!=='RECOVERY_PENDING') throw new ConflictError(`IMEI is ${imei.state}; expected RECOVERY_PENDING.`);

    const warehouse=await assertWarehouseScope(tx,actorUserId,input.warehouseId,recoveryCase.current_region_id,context);
    const finalState: ImeiState = warehouse.warehouseType==='MASTER' ? 'MASTER_WAREHOUSE' : 'REGIONAL_WAREHOUSE';
    assertImeiTransition(imei.state,'RECOVERED');
    assertImeiTransition('RECOVERED',finalState);

    await tx.query(`update public.imei_units set state=$1,current_holder_user_id=null,current_warehouse_id=$2,current_region_id=$3,current_team_id=null,current_shop_id=null,current_holder_started_at=null,field_age_started_at=null,aging_due_at=null,updated_at=now() where id=$4`,[finalState,input.warehouseId,warehouse.regionId,recoveryCase.imei_id]);
    await tx.query(
      `insert into public.inventory_movements
       (imei_id,from_holder_user_id,to_warehouse_id,from_team_id,from_shop_id,reason,movement_type,requested_by,accepted_by,requested_at,accepted_at,condition_before,condition_after,notes,recovery_case_id)
       values ($1,$2,$3,$4,$5,$6,'RECOVERY',$7,$7,now(),now(),$8,$8,$9,$10)`,
      [recoveryCase.imei_id,recoveryCase.current_holder_user_id,input.warehouseId,imei.current_team_id,imei.current_shop_id,'RECOVERY_WAREHOUSE_ACCEPTED',actorUserId,imei.condition_status,`Recovery case ${input.caseId} accepted into ${finalState}`,input.caseId],
    );
    await tx.query(`insert into public.recovery_activities(recovery_case_id,officer_user_id,activity_type,result,verified_imei,notes) values ($1,$2,'RECOVERED','Warehouse accepted recovery',$3,$4)`,[input.caseId,actorUserId,input.scannedImei.trim(),`Accepted into warehouse ${input.warehouseId}`]);
    await tx.query(`update public.recovery_cases set status='RECOVERED',updated_at=now() where id=$1`,[input.caseId]);
    await tx.query(`update public.aging_alerts set status='RESOLVED',resolved_at=now(),last_seen_at=now() where recovery_case_id=$1 and status<>'RESOLVED'`,[input.caseId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,previous_state,new_state,reason,request_id) values ($1,'RECOVERY_COMPLETED','RECOVERY_CASE',$2,$3::jsonb,$4::jsonb,'Physical recovery verified and warehouse accepted',current_setting('amaal.request_id',true))`,[actorUserId,input.caseId,JSON.stringify({case_status:recoveryCase.status,imei_state:'RECOVERY_PENDING'}),JSON.stringify({case_status:'RECOVERED',imei_state:finalState,warehouse_id:input.warehouseId})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values ('RECOVERY_COMPLETED','RECOVERY_CASE',$1,$2,$3,$4::jsonb)`,[input.caseId,warehouse.regionId,actorUserId,JSON.stringify({case_id:input.caseId,imei_id:recoveryCase.imei_id,warehouse_id:input.warehouseId,imei_state:finalState})]);
  }

  async closeCase(tx: DatabaseTransaction, actorUserId: string, caseId: string, reason: string): Promise<void> {
    if(!reason.trim()) throw new ValidationError('Recovery close reason is required.');
    const context=await loadAuthorizationContext(tx,actorUserId);
    const auth=authorize(context,'recovery.close');
    if(!auth.allowed) throw new AuthorizationError(auth.reason);
    const rows=await tx.query<{status:string;assigned_officer_user_id:string|null;current_region_id:string|null}>(`select rc.status,rc.assigned_officer_user_id,i.current_region_id from public.recovery_cases rc join public.imei_units i on i.id=rc.imei_id where rc.id=$1 for update`,[caseId]);
    if(rows.length!==1) throw new ValidationError('Recovery case not found.');
    const recoveryCase=rows[0]!;
    assertAssignedOrPrivileged(context,actorUserId,recoveryCase.assigned_officer_user_id);
    if(recoveryCase.status!=='RECOVERED') throw new ConflictError(`Recovery case is ${recoveryCase.status}; only RECOVERED cases can close.`);
    assertRecoveryTransition('RECOVERED','CLOSED');
    await tx.query(`update public.recovery_case_assignments set ended_at=now() where recovery_case_id=$1 and ended_at is null`,[caseId]);
    await tx.query(`update public.recovery_cases set status='CLOSED',closed_at=now(),updated_at=now(),notes=coalesce(notes,'') || case when notes is null or notes='' then '' else E'\\n' end || $1 where id=$2`,[reason,caseId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values ($1,'RECOVERY_CLOSED','RECOVERY_CASE',$2,$3::jsonb,$4,current_setting('amaal.request_id',true))`,[actorUserId,caseId,JSON.stringify({status:'CLOSED'}),reason]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values ('RECOVERY_CLOSED','RECOVERY_CASE',$1,$2,$3,$4::jsonb)`,[caseId,recoveryCase.current_region_id,actorUserId,JSON.stringify({case_id:caseId,status:'CLOSED',reason})]);
  }

  async transitionCase(tx: DatabaseTransaction, command: RecoveryTransitionCommand): Promise<void> {
    if (!command.caseId.trim()) throw new ValidationError('caseId is required.');
    if (!command.imeiId.trim()) throw new ValidationError('imeiId is required.');
    if (!command.actorUserId.trim()) throw new ValidationError('actorUserId is required.');
    assertRecoveryTransition(command.fromState, command.toState);
  }
}

export function validateRecoveryTransition(command: RecoveryTransitionCommand): void {
  if (!command.caseId.trim()) throw new ValidationError('caseId is required.');
  if (!command.imeiId.trim()) throw new ValidationError('imeiId is required.');
  if (!command.actorUserId.trim()) throw new ValidationError('actorUserId is required.');
  assertRecoveryTransition(command.fromState, command.toState);
}
export { AgingRecoveryEngine } from './aging-engine.ts';
export { PostgresRecoveryGovernanceService } from './governance.ts';

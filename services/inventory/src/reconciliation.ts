import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

export type ReconciliationScope = { kind: 'REGION' | 'WAREHOUSE' | 'TEAM' | 'SHOP'; id: string };
export type ReconciliationScan = {
  imei: string;
  observedHolderUserId?: string;
  observedWarehouseId?: string;
  observedRegionId?: string;
  observedTeamId?: string;
  observedShopId?: string;
  observedCondition?: 'NEW' | 'GOOD' | 'DAMAGED' | 'QUARANTINED' | 'WRITEOFF';
};

function requirePermission(context: Awaited<ReturnType<typeof loadAuthorizationContext>>): void {
  const decision = authorize(context, 'inventory.reconcile');
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

async function actorOrganization(tx: DatabaseTransaction, actorUserId: string): Promise<string> {
  const row = (await tx.query<{ organization_id: string }>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`, [actorUserId]))[0];
  if (!row) throw new AuthorizationError('Actor is not linked to an active Amaal organization.');
  return row.organization_id;
}

async function validateScope(tx: DatabaseTransaction, organizationId: string, scope: ReconciliationScope): Promise<void> {
  const sql = scope.kind === 'REGION'
    ? `select 1 from public.regions where id=$1 and organization_id=$2 and status='ACTIVE'`
    : scope.kind === 'WAREHOUSE'
      ? `select 1 from public.warehouses where id=$1 and organization_id=$2 and status='ACTIVE'`
      : scope.kind === 'TEAM'
        ? `select 1 from public.teams t join public.regions r on r.id=t.region_id where t.id=$1 and r.organization_id=$2 and t.status='ACTIVE'`
        : `select 1 from public.shops where id=$1 and organization_id=$2 and status='ACTIVE'`;
  if (!(await tx.query(sql, [scope.id, organizationId])).length) throw new ValidationError('Reconciliation scope is invalid or outside the Amaal organization.');
}

function normalizedImei(value: string): string {
  const imei = value.trim();
  if (!/^\d{15}$/.test(imei)) throw new ValidationError(`Invalid IMEI: ${value}`);
  return imei;
}

export class PostgresInventoryReconciliationService {
  async createRun(tx: DatabaseTransaction, actorUserId: string, scope: ReconciliationScope, notes?: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context);
    const organizationId = await actorOrganization(tx, actorUserId);
    await validateScope(tx, organizationId, scope);
    const rows = await tx.query<{ id: string }>(
      `insert into public.inventory_reconciliation_runs(organization_id,scope_type,scope_id,requested_by,notes)
       values($1,$2,$3,$4,$5) returning id`,
      [organizationId, scope.kind, scope.id, actorUserId, notes?.trim() || null],
    );
    return { reconciliationId: rows[0]!.id, status: 'OPEN' as const };
  }

  async addScans(tx: DatabaseTransaction, actorUserId: string, reconciliationId: string, scans: ReconciliationScan[]) {
    if (!scans.length || scans.length > 500) throw new ValidationError('A scan batch must contain 1-500 IMEIs.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context);
    const organizationId = await actorOrganization(tx, actorUserId);
    const run = (await tx.query<{ organization_id:string; status:string }>(`select organization_id,status from public.inventory_reconciliation_runs where id=$1 for update`, [reconciliationId]))[0];
    if (!run) throw new ValidationError('Reconciliation run not found.');
    if (run.organization_id !== organizationId) throw new AuthorizationError('Reconciliation run is outside your organization.');
    if (run.status !== 'OPEN') throw new ConflictError(`Reconciliation is ${run.status}.`);
    const seen = new Set<string>();
    for (const scan of scans) {
      const imei = normalizedImei(scan.imei);
      if (seen.has(imei)) throw new ConflictError(`Duplicate IMEI ${imei} in this scan batch.`);
      seen.add(imei);
      await tx.query(
        `insert into public.inventory_reconciliation_scans(reconciliation_id,scanned_imei,observed_holder_user_id,observed_warehouse_id,observed_region_id,observed_team_id,observed_shop_id,observed_condition,scanned_by)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [reconciliationId, imei, scan.observedHolderUserId ?? null, scan.observedWarehouseId ?? null, scan.observedRegionId ?? null, scan.observedTeamId ?? null, scan.observedShopId ?? null, scan.observedCondition ?? null, actorUserId],
      );
    }
    return { reconciliationId, added: scans.length };
  }

  async finalizeRun(tx: DatabaseTransaction, actorUserId: string, reconciliationId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context);
    const organizationId = await actorOrganization(tx, actorUserId);
    const run = (await tx.query<{ organization_id:string; scope_type:string; scope_id:string; status:string }>(`select organization_id,scope_type,scope_id,status from public.inventory_reconciliation_runs where id=$1 for update`, [reconciliationId]))[0];
    if (!run) throw new ValidationError('Reconciliation run not found.');
    if (run.organization_id !== organizationId) throw new AuthorizationError('Reconciliation run is outside your organization.');
    if (run.status !== 'OPEN') throw new ConflictError(`Reconciliation is ${run.status}.`);

    const predicate = run.scope_type === 'REGION' ? `i.current_region_id=$1`
      : run.scope_type === 'WAREHOUSE' ? `i.current_warehouse_id=$1`
        : run.scope_type === 'TEAM' ? `i.current_team_id=$1`
          : `i.current_shop_id=$1`;
    const expected = await tx.query<{ id:string; imei:string; condition_status:string; holder:string|null; warehouse:string|null; region:string|null; team:string|null; shop:string|null }>(
      `select i.id,i.imei,i.condition_status,i.current_holder_user_id as holder,i.current_warehouse_id as warehouse,i.current_region_id as region,i.current_team_id as team,i.current_shop_id as shop
       from public.imei_units i
       join public.product_variants pv on pv.id=i.product_variant_id
       join public.products p on p.id=pv.product_id
       join public.brands b on b.id=p.brand_id
       where b.organization_id=$2 and ${predicate}`,
      [run.scope_id, organizationId],
    );
    const scans = await tx.query<{ scanned_imei:string; observed_holder_user_id:string|null; observed_warehouse_id:string|null; observed_region_id:string|null; observed_team_id:string|null; observed_shop_id:string|null; observed_condition:string|null }>(
      `select scanned_imei,observed_holder_user_id,observed_warehouse_id,observed_region_id,observed_team_id,observed_shop_id,observed_condition from public.inventory_reconciliation_scans where reconciliation_id=$1`, [reconciliationId]);

    const expectedByImei = new Map(expected.map((x) => [x.imei, x]));
    const scannedByImei = new Map(scans.map((x) => [x.scanned_imei, x]));
    const missing = expected.filter((x) => !scannedByImei.has(x.imei)).map((x) => x.imei);
    const unexpected = scans.filter((x) => !expectedByImei.has(x.scanned_imei)).map((x) => x.scanned_imei);
    const found = expected.filter((x) => scannedByImei.has(x.imei));
    const wrongHolder: string[] = [], wrongRegion: string[] = [], wrongWarehouse: string[] = [], wrongCondition: string[] = [];
    for (const item of found) {
      const scan = scannedByImei.get(item.imei)!;
      if (scan.observed_holder_user_id && scan.observed_holder_user_id !== item.holder) wrongHolder.push(item.imei);
      if (scan.observed_region_id && scan.observed_region_id !== item.region) wrongRegion.push(item.imei);
      if (scan.observed_warehouse_id && scan.observed_warehouse_id !== item.warehouse) wrongWarehouse.push(item.imei);
      if (scan.observed_condition && scan.observed_condition !== item.condition_status) wrongCondition.push(item.imei);
    }
    const report = { scope: { kind: run.scope_type, id: run.scope_id }, found: found.map((x) => x.imei), missing, unexpected, wrongHolder, wrongRegion, wrongWarehouse, wrongCondition };
    await tx.query(`update public.inventory_reconciliation_runs set status='FINALIZED',finalized_by=$2,finalized_at=now(),expected_count=$3,found_count=$4,missing_count=$5,unexpected_count=$6,wrong_holder_count=$7,wrong_region_count=$8,wrong_warehouse_count=$9,wrong_condition_count=$10,report=$11::jsonb where id=$1`, [reconciliationId,actorUserId,expected.length,found.length,missing.length,unexpected.length,wrongHolder.length,wrongRegion.length,wrongWarehouse.length,wrongCondition.length,JSON.stringify(report)]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'INVENTORY_RECONCILIATION_FINALIZED','INVENTORY_RECONCILIATION',$2,$3::jsonb,'Physical-vs-system inventory reconciliation',current_setting('amaal.request_id',true))`, [actorUserId,reconciliationId,JSON.stringify({expected:expected.length,found:found.length,missing:missing.length,unexpected:unexpected.length,wrongHolder:wrongHolder.length,wrongRegion:wrongRegion.length,wrongWarehouse:wrongWarehouse.length,wrongCondition:wrongCondition.length})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('INVENTORY_RECONCILIATION_FINALIZED','INVENTORY_RECONCILIATION',$1,$2,$3::jsonb)`, [reconciliationId,actorUserId,JSON.stringify({reconciliationId,missing:missing.length,unexpected:unexpected.length})]);
    return { reconciliationId, status:'FINALIZED' as const, counts:{expected:expected.length,found:found.length,missing:missing.length,unexpected:unexpected.length,wrongHolder:wrongHolder.length,wrongRegion:wrongRegion.length,wrongWarehouse:wrongWarehouse.length,wrongCondition:wrongCondition.length}, report };
  }

  async listRuns(tx: DatabaseTransaction, actorUserId: string, limit = 50) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context);
    const organizationId = await actorOrganization(tx, actorUserId);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return tx.query(`select id as "reconciliationId",scope_type as "scopeType",scope_id as "scopeId",status,requested_by as "requestedBy",finalized_by as "finalizedBy",started_at as "startedAt",finalized_at as "finalizedAt",expected_count as "expectedCount",found_count as "foundCount",missing_count as "missingCount",unexpected_count as "unexpectedCount",wrong_holder_count as "wrongHolderCount",wrong_region_count as "wrongRegionCount",wrong_warehouse_count as "wrongWarehouseCount",wrong_condition_count as "wrongConditionCount",notes,report from public.inventory_reconciliation_runs where organization_id=$1 order by started_at desc limit $2`, [organizationId,safeLimit]);
  }
}

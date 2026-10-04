import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ValidationError } from '@amaal/shared';

function requirePermission(context: Awaited<ReturnType<typeof loadAuthorizationContext>>, permission: string): void {
  const decision = authorize(context, permission);
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

export type InventoryListOptions = {
  query?: string;
  state?: string;
  agingStatus?: string;
  limit?: number;
};

export class PostgresInventoryReadService {
  async getSummary(tx: DatabaseTransaction, actorUserId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'inventory.view');
    const rows = await tx.query<{ state: string; aging_status: string | null; units: string }>(`
      select c.state, c."agingStatus" as aging_status, count(*)::text as units
      from public.imei_current_custody c
      where private.user_can_access_imei(c.imei_id)
      group by c.state, c."agingStatus"
      order by c.state, c."agingStatus"
    `);
    const states = Object.fromEntries(rows.map((row) => [row.state, Number(row.units)]));
    const aging = Object.fromEntries(rows.filter((row) => row.aging_status).map((row) => [row.aging_status!, Number(row.units)]));
    const total = rows.reduce((sum, row) => sum + Number(row.units), 0);
    return { total, states, aging };
  }

  async searchImeis(tx: DatabaseTransaction, actorUserId: string, options: InventoryListOptions = {}) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'inventory.view');
    const query = (options.query ?? '').trim().toLowerCase();
    const state = options.state?.trim() || null;
    const agingStatus = options.agingStatus?.trim() || null;
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
    return tx.query(`
      select c.*
      from public.imei_current_custody c
      where private.user_can_access_imei(c.imei_id)
        and ($1 = '' or lower(c.imei) like '%' || $1 || '%' or lower(coalesce(c."imei2",'')) like '%' || $1 || '%' or lower(coalesce(c."serialNumber",'')) like '%' || $1 || '%' or lower(coalesce(c."sku",'')) like '%' || $1 || '%' or lower(coalesce(c."modelName",'')) like '%' || $1 || '%')
        and ($2::text is null or c.state = $2)
        and ($3::text is null or c."agingStatus" = $3)
      order by c."updatedAt" desc, c.imei_id desc
      limit $4
    `, [query, state, agingStatus, limit]);
  }

  async listAllocations(tx: DatabaseTransaction, actorUserId: string, limit = 100) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'inventory.view');
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return tx.query(`
      select
        a.id as "allocationId",
        a.status,
        a.requested_by as "requestedBy",
        a.approved_by as "approvedBy",
        a.received_by as "receivedBy",
        a.source_warehouse_id as "sourceWarehouseId",
        a.source_holder_user_id as "sourceHolderUserId",
        a.source_region_id as "sourceRegionId",
        a.source_team_id as "sourceTeamId",
        a.source_shop_id as "sourceShopId",
        a.target_warehouse_id as "targetWarehouseId",
        a.target_holder_user_id as "targetHolderUserId",
        a.target_team_id as "targetTeamId",
        a.target_shop_id as "targetShopId",
        a.requested_at as "requestedAt",
        a.approved_at as "approvedAt",
        a.received_at as "receivedAt",
        count(ai.imei_id)::int as "imeiCount"
      from public.stock_allocations a
      join public.stock_allocation_items ai on ai.allocation_id=a.id
      where exists (
        select 1 from public.stock_allocation_items scoped
        where scoped.allocation_id=a.id and private.user_can_access_imei(scoped.imei_id)
      )
      group by a.id
      order by a.requested_at desc
      limit $1
    `, [safeLimit]);
  }

  async listMovements(tx: DatabaseTransaction, actorUserId: string, imeiId: string, limit = 100) {
    if (!imeiId.trim()) throw new ValidationError('imeiId is required.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    requirePermission(context, 'inventory.view');
    const access = await tx.query(`select 1 from public.imei_units where id=$1 and private.user_can_access_imei(id)`, [imeiId]);
    if (!access.length) throw new AuthorizationError('IMEI is outside your organizational scope.');
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return tx.query(`
      select
        m.id,
        m.imei_id as "imeiId",
        m.movement_type as "movementType",
        m.from_holder_user_id as "fromHolderUserId",
        m.to_holder_user_id as "toHolderUserId",
        m.from_warehouse_id as "fromWarehouseId",
        m.to_warehouse_id as "toWarehouseId",
        m.from_team_id as "fromTeamId",
        m.to_team_id as "toTeamId",
        m.from_shop_id as "fromShopId",
        m.to_shop_id as "toShopId",
        m.requested_by as "requestedBy",
        m.approved_by as "approvedBy",
        m.accepted_by as "acceptedBy",
        m.requested_at as "requestedAt",
        m.approved_at as "approvedAt",
        m.accepted_at as "acceptedAt",
        m.reason,
        m.notes,
        m.condition_before as "conditionBefore",
        m.condition_after as "conditionAfter",
        m.created_at as "createdAt"
      from public.inventory_movements m
      where m.imei_id=$1
      order by m.created_at desc
      limit $2
    `, [imeiId, safeLimit]);
  }
}

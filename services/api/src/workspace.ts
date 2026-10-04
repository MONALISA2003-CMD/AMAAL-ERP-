import type { DatabaseTransaction } from '@amaal/database';
import type { AuthorizationContext } from '@amaal/permissions';
import { loadAuthorizationContext } from '@amaal/permissions';
import type { ApiServices } from './index.ts';

export type WorkspaceView =
  | 'AGENT'
  | 'TEAM_LEADER'
  | 'MANAGER'
  | 'REGIONAL_MANAGER'
  | 'ADMIN'
  | 'CEO'
  | 'RECOVERY_OFFICER'
  | 'SHOP_OWNER';

const ROLE_PRIORITY: readonly WorkspaceView[] = [
  'CEO',
  'ADMIN',
  'REGIONAL_MANAGER',
  'MANAGER',
  'TEAM_LEADER',
  'AGENT',
  'SHOP_OWNER',
  'RECOVERY_OFFICER',
];

const WORKSPACE_LABELS: Record<WorkspaceView, string> = {
  CEO: 'CEO Command Center',
  ADMIN: 'Admin Control Center',
  REGIONAL_MANAGER: 'Regional Command Center',
  MANAGER: 'Manager Workspace',
  TEAM_LEADER: 'Team Leader Workspace',
  AGENT: 'Agent Workspace',
  SHOP_OWNER: 'Shop Owner Workspace',
  RECOVERY_OFFICER: 'Recovery Operations',
};

const DEFAULT_MODULES: Record<WorkspaceView, readonly string[]> = {
  AGENT: ['Sell', 'Customers', 'My Stock', 'Aged Stock', 'Recovery', 'Sales', 'Commission', 'Allocation History'],
  TEAM_LEADER: ['Team Sales', 'Agents', 'Customers', 'Team Stock', 'Aged Stock', 'Recovery', 'Commission', 'Agent Comparison'],
  MANAGER: ['Teams', 'Team Leaders', 'Stock Across Teams', 'Allocation', 'Performance', 'Commission', 'Direct Selling'],
  REGIONAL_MANAGER: ['Regions', 'Managers', 'Teams', 'Regional Warehouse', 'Regional Performance', 'Aging', 'Recovery', 'Best Agents'],
  ADMIN: ['Global Control', 'Master Warehouse', 'Regions', 'Users', 'Policy', 'Security', 'Commission', 'Performance', 'System Health'],
  CEO: ['Global Control', 'Master Warehouse', 'Regions', 'Users', 'Policy', 'Security', 'Commission', 'Performance', 'System Health'],
  SHOP_OWNER: ['Sell', 'Customers', 'Shop Stock', 'Aged Stock', 'Recovery', 'Sales', 'Commission', 'Allocation History'],
  RECOVERY_OFFICER: ['Recovery Queue', 'Aged Stock', 'Assigned Cases', 'Recovery Activity', 'Returns', 'Recovery Performance'],
};

export function selectWorkspaceRole(roles: readonly string[]): WorkspaceView {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  throw new Error('No supported workspace role is assigned to the authenticated user.');
}

export function workspaceDefinition(role: WorkspaceView): { label: string; modules: readonly string[] } {
  return { label: WORKSPACE_LABELS[role], modules: DEFAULT_MODULES[role] };
}

type SqlBuilder = { text: string; values: unknown[] };

function adminDomainPermission(resource: 'sales' | 'inventory' | 'inventory_authoritative' | 'recovery' | 'customers' | 'commission'): string {
  switch (resource) {
    case 'sales': return 'sales.view';
    case 'inventory':
    case 'inventory_authoritative': return 'inventory.view';
    case 'recovery': return 'recovery.view';
    case 'customers': return 'customers.view';
    case 'commission': return 'commissions.view';
  }
}

function isCompanyWideForResource(context: AuthorizationContext, resource: 'sales' | 'inventory' | 'inventory_authoritative' | 'recovery' | 'customers' | 'commission'): boolean {
  if (context.roles.includes('CEO')) return true;
  return context.roles.includes('ADMIN') && context.permissions.includes(adminDomainPermission(resource));
}

function roleScopedPredicate(
  context: AuthorizationContext,
  alias: string,
  resource: 'sales' | 'inventory' | 'inventory_authoritative' | 'recovery' | 'customers' | 'commission',
): SqlBuilder {
  const values: unknown[] = [];
  const push = (value: unknown) => { values.push(value); return `$${values.length}`; };
  const companyWide = isCompanyWideForResource(context, resource);
  if (context.roles.includes('ADMIN') && !companyWide) return { text: 'FALSE', values };

  if (companyWide) return { text: 'TRUE', values };

  const userParam = push(context.userId);

  // Customers do not carry organizational scope columns in the production schema.
  // Resolve their scope through the authoritative seller/recovery relationships.
  if (resource === 'customers') {
    if (context.roles.includes('REGIONAL_MANAGER')) {
      const regionParam = push(context.regionIds);
      return {
        text: `exists (select 1 from public.sales cs where cs.customer_id = ${alias}.id and cs.region_id = ANY(${regionParam}::uuid[]))`,
        values,
      };
    }
    if (context.roles.includes('RECOVERY_OFFICER')) {
      const regionParam = push(context.regionIds);
      return {
        text: `exists (select 1 from public.recovery_cases cr join public.imei_units ci on ci.id=cr.imei_id where cr.customer_id=${alias}.id and ci.current_region_id = ANY(${regionParam}::uuid[]))`,
        values,
      };
    }
    if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) {
      const teamParam = push(context.teamIds);
      return {
        text: `(${alias}.created_by = ${userParam} OR exists (select 1 from public.sales cs where cs.customer_id = ${alias}.id and (cs.team_id = ANY(${teamParam}::uuid[]) OR cs.seller_user_id = ${userParam})))`,
        values,
      };
    }
    return {
      text: `(${alias}.created_by = ${userParam} OR exists (select 1 from public.sales cs where cs.customer_id = ${alias}.id and cs.seller_user_id = ${userParam}))`,
      values,
    };
  }

  if (context.roles.includes('REGIONAL_MANAGER') || context.roles.includes('RECOVERY_OFFICER')) {
    const regionParam = push(context.regionIds);
    if (resource === 'recovery' || resource === 'inventory_authoritative') {
      return { text: `${alias}.current_region_id = ANY(${regionParam}::uuid[])`, values };
    }
    return { text: `${alias}.region_id = ANY(${regionParam}::uuid[])`, values };
  }

  if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) {
    const teamParam = push(context.teamIds);
    if (resource === 'sales' || resource === 'commission') {
      return { text: `(${alias}.team_id = ANY(${teamParam}::uuid[]) OR ${alias}.seller_user_id = ${userParam})`, values };
    }
    if (resource === 'inventory') {
      return { text: `(${alias}.team_id = ANY(${teamParam}::uuid[]) OR ${alias}.holder_user_id = ${userParam})`, values };
    }
    if (resource === 'inventory_authoritative') {
      return { text: `(${alias}.current_team_id = ANY(${teamParam}::uuid[]) OR ${alias}.current_holder_user_id = ${userParam})`, values };
    }
    return {
      text: `(${alias}.current_holder_user_id = ${userParam} OR exists (select 1 from public.team_memberships tms where tms.user_id = ${alias}.current_holder_user_id and tms.status='ACTIVE' and (tms.effective_to is null or tms.effective_to > now()) and tms.team_id = ANY(${teamParam}::uuid[])))`,
      values,
    };
  }

  if (resource === 'sales' || resource === 'commission') return { text: `${alias}.seller_user_id = ${userParam}`, values };
  if (resource === 'inventory') return { text: `${alias}.holder_user_id = ${userParam}`, values };
  if (resource === 'inventory_authoritative') return { text: `${alias}.current_holder_user_id = ${userParam}`, values };
  return { text: `${alias}.current_holder_user_id = ${userParam}`, values };
}

function roleScopedPredicateWithBase(
  context: AuthorizationContext,
  alias: string,
  resource: Parameters<typeof roleScopedPredicate>[2],
  startIndex: number,
): SqlBuilder {
  const result = roleScopedPredicate(context, alias, resource);
  const text = result.text.replace(/\$(\d+)/g, (_m, n: string) => `$${Number(n) + startIndex - 1}`);
  return { text, values: result.values };
}

function utcBoundaries(): { today: string; week: string; month: string } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = today.getUTCDay();
  const week = new Date(today);
  week.setUTCDate(week.getUTCDate() - ((day + 6) % 7));
  const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { today: today.toISOString(), week: week.toISOString(), month: month.toISOString() };
}

async function scalar<T>(tx: DatabaseTransaction, sql: string, values: readonly unknown[]): Promise<T> {
  const rows = await tx.query<T>(sql, values);
  if (!rows[0]) throw new Error('Expected workspace scalar query row.');
  return rows[0];
}

function canViewDomain(context: AuthorizationContext, permission: string): boolean {
  return context.roles.includes('CEO') || context.permissions.includes(permission);
}

export async function getWorkspaceSummary(
  services: ApiServices,
  requestId: string,
  actorUserId: string,
): Promise<unknown> {
  return services.transactions.withTransaction({ requestId, actorUserId }, async (tx) => {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const role = selectWorkspaceRole(context.roles);
    const definition = workspaceDefinition(role);
    const profile = await scalar<{ display_name: string }>(
      tx,
      `select display_name from public.profiles where user_id=$1`,
      [actorUserId],
    );

    const bounds = utcBoundaries();
    const salesBase = canViewDomain(context, 'sales.view') ? roleScopedPredicateWithBase(context, 'r', 'sales', 4) : { text: 'FALSE', values: [] };
    const salesVisible = canViewDomain(context, 'sales.view');
    const commissionBase = canViewDomain(context, 'commissions.view') ? roleScopedPredicateWithBase(context, 's', 'commission', 3) : { text: 'FALSE', values: [] };
    const commissionVisible = canViewDomain(context, 'commissions.view');
    const inventoryBase = canViewDomain(context, 'inventory.view') ? roleScopedPredicateWithBase(context, 'i', 'inventory_authoritative', 1) : { text: 'FALSE', values: [] };
    const inventoryVisible = canViewDomain(context, 'inventory.view');
    const recoveryBase = canViewDomain(context, 'recovery.view') ? roleScopedPredicateWithBase(context, 'i', 'recovery', 1) : { text: 'FALSE', values: [] };
    const recoveryVisible = canViewDomain(context, 'recovery.view');
    const customerBase = canViewDomain(context, 'customers.view') ? roleScopedPredicateWithBase(context, 'c', 'customers', 1) : { text: 'FALSE', values: [] };
    const customerVisible = canViewDomain(context, 'customers.view');

    const [sales, commission, inventory, aging, recovery, customers, notifications, hierarchy, system] = await Promise.all([
      scalar<{ today_units: string; today_revenue: string; week_units: string; week_revenue: string; month_units: string; month_revenue: string }>(
        tx,
        `select
          coalesce(sum(r.units-r.reversed_units) filter (where r.sale_date >= $1::date),0)::bigint::text as today_units,
          coalesce(sum(r.revenue-r.reversed_revenue) filter (where r.sale_date >= $1::date),0)::numeric::text as today_revenue,
          coalesce(sum(r.units-r.reversed_units) filter (where r.sale_date >= $2::date),0)::bigint::text as week_units,
          coalesce(sum(r.revenue-r.reversed_revenue) filter (where r.sale_date >= $2::date),0)::numeric::text as week_revenue,
          coalesce(sum(r.units-r.reversed_units) filter (where r.sale_date >= $3::date),0)::bigint::text as month_units,
          coalesce(sum(r.revenue-r.reversed_revenue) filter (where r.sale_date >= $3::date),0)::numeric::text as month_revenue
        from public.read_model_sales_daily r
        where ${salesBase.text}`,
        [bounds.today, bounds.week, bounds.month, ...salesBase.values],
      ),
      scalar<{ today: string; month: string }>(
        tx,
        `select
           coalesce(sum(c.amount) filter (where coalesce(s.completed_at,s.created_at) >= $1),0)::numeric::text as today,
           coalesce(sum(c.amount) filter (where coalesce(s.completed_at,s.created_at) >= $2),0)::numeric::text as month
         from public.commissions c
         join public.sales s on s.id=c.sale_id
         where c.status='ACTIVE' and ${commissionBase.text}`,
        [bounds.today, bounds.month, ...commissionBase.values],
      ),
      scalar<{ current_units: string }>(
        tx,
        `select count(*)::bigint::text as current_units
         from public.imei_units i
         where i.state in ('MASTER_WAREHOUSE','REGIONAL_WAREHOUSE','ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP','RECOVERY_PENDING','RECOVERED','DAMAGED','LOST','QUARANTINE','TRANSFER_PENDING')
           and ${inventoryBase.text}`,
        inventoryBase.values,
      ),
      scalar<{ aged_units: string; critical_units: string }>(
        tx,
        `select
           count(*) filter (where i.aging_due_at is not null and i.aging_due_at <= now() and i.state not in ('SOLD','RETURNED','DAMAGED','LOST'))::bigint::text as aged_units,
           count(*) filter (where i.aging_due_at is not null and i.aging_due_at <= now() and i.state not in ('SOLD','RETURNED','DAMAGED','LOST') and now() >= i.aging_due_at + interval '4 days')::bigint::text as critical_units
         from public.imei_units i
         where ${recoveryBase.text}`,
        recoveryBase.values,
      ),
      scalar<{ open_cases: string; overdue_cases: string; high_priority: string }>(
        tx,
        `select
           count(*) filter (where rc.status not in ('CLOSED','CANCELLED'))::bigint::text as open_cases,
           count(*) filter (where rc.status not in ('CLOSED','CANCELLED') and rc.due_at is not null and rc.due_at < now())::bigint::text as overdue_cases,
           count(*) filter (where rc.status not in ('CLOSED','CANCELLED') and rc.priority >= 50)::bigint::text as high_priority
         from public.recovery_cases rc
         join public.imei_units i on i.id=rc.imei_id
         where ${recoveryBase.text}`,
        recoveryBase.values,
      ),
      scalar<{ total: string }>(
        tx,
        `select count(*)::bigint::text as total from public.customers c where ${customerBase.text}`,
        customerBase.values,
      ),
      scalar<{ unread: string }>(
        tx,
        `select count(*) filter (where status='UNREAD')::bigint::text as unread from public.notifications where recipient_user_id=$1`,
        [actorUserId],
      ),
      scalar<{ regions: string; managers: string; teams: string; agents: string; shops: string }>(
        tx,
        `select
          (select count(*) from public.regions r where r.status='ACTIVE' and ($1 or r.id = any($2::uuid[])))::bigint::text as regions,
          (select count(*) from public.managers m where m.status='ACTIVE' and ($1 or m.region_id = any($2::uuid[])))::bigint::text as managers,
          (select count(*) from public.teams t where t.status='ACTIVE' and ($1 or t.id = any($3::uuid[])))::bigint::text as teams,
          (select count(*) from public.role_assignments ra where ra.role='AGENT' and ra.status='ACTIVE' and ($1 or ra.team_id = any($3::uuid[])))::bigint::text as agents,
          (select count(*) from public.shops s where s.status='ACTIVE' and ($1 or s.team_id = any($3::uuid[])))::bigint::text as shops`,
        [context.roles.includes('CEO') || (context.roles.includes('ADMIN') && (context.permissions.includes('users.view') || context.permissions.includes('reports.view'))), context.regionIds, context.teamIds],
      ),
      scalar<{ outbox_pending: string; realtime_events: string; latest_sequence: string | null }>(
        tx,
        (context.roles.includes('CEO') || context.roles.includes('ADMIN'))
          ? `select
               (select count(*) from public.outbox_events where published_at is null)::bigint::text as outbox_pending,
               (select count(*) from public.realtime_events)::bigint::text as realtime_events,
               (select max(sequence_number) from public.realtime_events)::text as latest_sequence`
          : `select 0::bigint::text as outbox_pending, 0::bigint::text as realtime_events, 0::bigint::text as latest_sequence`,
        [],
      ),
    ]);

    const operationalData = Number(sales.today_units) > 0 || Number(inventory.current_units) > 0 || Number(aging.aged_units) > 0 || Number(recovery.open_cases) > 0;

    return {
      role,
      label: definition.label,
      displayName: profile.display_name,
      modules: context.roles.includes('ADMIN') && !context.roles.includes('CEO')
        ? definition.modules.filter((module) => {
            const map: Record<string, string> = { 'Inventory & IMEI': 'inventory.view', 'Shop Stock': 'inventory.view', 'Team Stock': 'inventory.view', 'Stock Across Teams': 'inventory.view', 'Master Warehouse': 'inventory.view', 'Sales & Receipts': 'sales.view', 'Team Sales': 'sales.view', 'Performance': 'reports.view', 'Regional Performance': 'reports.view', 'Recovery': 'recovery.view', 'Aged Stock': 'aging.view', 'Commission': 'commissions.view' };
            return !map[module] || context.permissions.includes(map[module]);
          })
        : definition.modules,
      authorization: {
        roles: context.roles,
        permissions: context.permissions,
        regionIds: context.regionIds,
        subregionIds: context.subregionIds ?? [],
        teamIds: context.teamIds,
        shopIds: context.shopIds,
      },
      status: operationalData ? 'OPERATIONAL' : 'FOUNDATION_ONLY',
      visibility: { sales: salesVisible, inventory: inventoryVisible, recovery: recoveryVisible, customers: customerVisible, commission: commissionVisible },
      kpis: {
        sales: {
          today: { units: Number(sales.today_units), revenue: Number(sales.today_revenue) },
          week: { units: Number(sales.week_units), revenue: Number(sales.week_revenue) },
          month: { units: Number(sales.month_units), revenue: Number(sales.month_revenue) },
        },
        inventory: { currentUnits: Number(inventory.current_units) },
        aging: { agedUnits: Number(aging.aged_units), criticalUnits: Number(aging.critical_units) },
        recovery: { openCases: Number(recovery.open_cases), overdueCases: Number(recovery.overdue_cases), highPriorityCases: Number(recovery.high_priority) },
        customers: { total: Number(customers.total) },
        commission: { today: Number(commission.today), month: Number(commission.month) },
        notifications: { unread: Number(notifications.unread) },
      },
      hierarchy,
      system: {
        outboxPending: Number(system.outbox_pending),
        realtimeEvents: Number(system.realtime_events),
        latestSequence: system.latest_sequence ? Number(system.latest_sequence) : 0,
      },
      generatedAt: new Date().toISOString(),
    };
  });
}

import type { DatabaseTransaction } from '@amaal/database';
import type { AuthorizationContext } from '@amaal/permissions';
import { loadAuthorizationContext } from '@amaal/permissions';
import type { ApiServices } from './index.ts';
import { ageBand, clampLimit, concentration, percentChange, periodWindow, resolveAgeBands, type AgeBands, type PeriodWindow } from './reporting-math.ts';

export type ReportPeriod = 'TODAY' | 'WEEK' | 'MONTH' | '3M' | '6M' | '12M';
export type ComparisonType = 'AGENT' | 'TEAM' | 'MANAGER' | 'REGION';

export type OperationalReportRequest = {
  period: ReportPeriod;
  comparison: ComparisonType;
  regionId?: string;
  teamId?: string;
};

type Params = { values: unknown[]; add(value: unknown): string };
function params(): Params {
  const values: unknown[] = [];
  return { values, add(value: unknown) { values.push(value); return `$${values.length}`; } };
}

function appendAnd(clauses: readonly string[]): string {
  return clauses.length ? ` and ${clauses.join(' and ')}` : '';
}

async function one<T>(tx: DatabaseTransaction, sql: string, values: readonly unknown[]): Promise<T> {
  const rows = await tx.query<T>(sql, values);
  if (!rows[0]) throw new Error('Report query returned no summary row.');
  return rows[0];
}

function isCompanyWide(context: AuthorizationContext, permission: string): boolean {
  return context.roles.includes('CEO') || (context.roles.includes('ADMIN') && context.permissions.includes(permission));
}

function canView(context: AuthorizationContext, permission: string): boolean {
  return context.roles.includes('CEO') || context.permissions.includes(permission);
}

function salesScope(context: AuthorizationContext, alias: string, p: Params): string {
  if (isCompanyWide(context, 'sales.view')) return 'TRUE';
  if (context.roles.includes('REGIONAL_MANAGER')) return `${alias}.region_id = ANY(${p.add(context.regionIds)}::uuid[])`;
  if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) return `(${alias}.team_id = ANY(${p.add(context.teamIds)}::uuid[]) OR ${alias}.seller_user_id = ${p.add(context.userId)})`;
  return `${alias}.seller_user_id = ${p.add(context.userId)}`;
}

function inventoryScope(context: AuthorizationContext, alias: string, p: Params): string {
  if (isCompanyWide(context, 'inventory.view')) return 'TRUE';
  if (context.roles.includes('REGIONAL_MANAGER') || context.roles.includes('RECOVERY_OFFICER')) return `${alias}.current_region_id = ANY(${p.add(context.regionIds)}::uuid[])`;
  if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) return `(${alias}.current_team_id = ANY(${p.add(context.teamIds)}::uuid[]) OR ${alias}.current_holder_user_id = ${p.add(context.userId)})`;
  return `${alias}.current_holder_user_id = ${p.add(context.userId)}`;
}

function filterClause(alias: string, p: Params, regionId?: string, teamId?: string): string[] {
  const clauses: string[] = [];
  if (regionId) clauses.push(`${alias}.region_id = ${p.add(regionId)}`);
  if (teamId) clauses.push(`${alias}.team_id = ${p.add(teamId)}`);
  return clauses;
}

function inventoryFilterClause(alias: string, p: Params, regionId?: string, teamId?: string): string[] {
  const clauses: string[] = [];
  if (regionId) clauses.push(`${alias}.current_region_id = ${p.add(regionId)}`);
  if (teamId) clauses.push(`${alias}.current_team_id = ${p.add(teamId)}`);
  return clauses;
}

function scopedSalesExtra(p: Params, regionId?: string, teamId?: string): string {
  const clauses: string[] = [];
  if (regionId) clauses.push(`s.region_id=${p.add(regionId)}`);
  if (teamId) clauses.push(`s.team_id=${p.add(teamId)}`);
  return appendAnd(clauses);
}

function assertFilterAllowed(context: AuthorizationContext, regionId?: string, teamId?: string): void {
  const companyWide = context.roles.includes('CEO') || (context.roles.includes('ADMIN') && context.permissions.includes('reports.view'));
  if (regionId && !companyWide && !context.regionIds.includes(regionId)) throw new Error('Requested report region is outside your authorized scope.');
  if (teamId && !companyWide && !context.teamIds.includes(teamId)) throw new Error('Requested report team is outside your authorized scope.');
}

function fallbackName(name: string | null): string { return name?.trim() || 'Unassigned'; }

async function schemaCapabilities(tx: DatabaseTransaction) {
  const rows = await tx.query<{ table_name: string; column_name: string }>(
    `select table_name,column_name from information_schema.columns where table_schema='public'
     and table_name in ('sales','customers','sale_items','aging_policies','aging_asset_states','customer_assignments','read_model_sales_daily','read_model_product_daily','read_model_commission_daily')`,
    [],
  );
  const has = (table: string, column: string) => rows.some((row) => row.table_name === table && row.column_name === column);
  return {
    saleDateColumn: has('sales', 'sale_datetime') ? 'sale_datetime' : has('sales', 'completed_at') ? 'completed_at' : 'created_at',
    customerOwnerColumn: has('customers', 'owner_user_id') ? 'owner_user_id' : 'created_by',
    customerRegionColumn: has('customers', 'region_id'),
    customerTeamColumn: has('customers', 'team_id'),
    customerShopColumn: has('customers', 'shop_id'),
    customerSubregionColumn: has('customers', 'subregion_id'),
    customerAssignments: has('customer_assignments', 'customer_id'),
    finalPriceColumn: has('sale_items', 'final_price') ? 'final_price' : 'unit_price',
    bandConfigColumn: has('aging_policies', 'band_config'),
    agingAssetStates: has('aging_asset_states', 'imei_id'),
    salesDailyModel: has('read_model_sales_daily', 'transaction_count'),
    productDailyModel: has('read_model_product_daily', 'product_variant_id'),
    commissionDailyModel: has('read_model_commission_daily', 'beneficiary_user_id'),
  } as const;
}

type Capabilities = Awaited<ReturnType<typeof schemaCapabilities>>;

function saleDateExpr(caps: Capabilities, alias = 's'): string {
  return `${alias}.${caps.saleDateColumn}`;
}

async function currentOrganizationId(tx: DatabaseTransaction, actorUserId: string): Promise<string> {
  const row = await one<{ organization_id: string }>(tx, `select organization_id from public.profiles where user_id=$1`, [actorUserId]);
  return row.organization_id;
}

async function loadAgingPolicy(tx: DatabaseTransaction, caps: Capabilities, organizationId: string) {
  const bandProjection = caps.bandConfigColumn ? ',band_config' : ',null::jsonb as band_config';
  const rows = await tx.query<{
    id: string;
    maximum_days: number;
    warning_days: number;
    critical_overdue_days: number;
    band_config: Partial<AgeBands> | null;
    auto_recovery_enabled: boolean | null;
  }>(
    `select id,maximum_days,warning_days,critical_overdue_days${bandProjection},
       ${caps.bandConfigColumn ? 'auto_recovery_enabled' : 'null::boolean as auto_recovery_enabled'}
     from public.aging_policies where organization_id=$1 and status='ACTIVE' and effective_from <= now()
       and (effective_to is null or effective_to > now()) order by effective_from desc limit 1`,
    [organizationId],
  );
  const row = rows[0] ?? {
    id: 'DEFAULT-NOT-STORED',
    maximum_days: 18,
    warning_days: 8,
    critical_overdue_days: 4,
    band_config: null,
    auto_recovery_enabled: null,
  };
  const bands = resolveAgeBands({
    warningDays: Number(row.warning_days),
    maximumDays: Number(row.maximum_days),
    criticalOverdueDays: Number(row.critical_overdue_days),
    configured: row.band_config,
  });
  const source = rows[0] ? (caps.bandConfigColumn ? 'stored band_config' : 'policy thresholds/default Amaal bands') : 'approved Amaal defaults (no active stored policy)';
  return { row, bands, source, stored: Boolean(rows[0]) };
}

export type OperationalInsight = {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  code: string;
  title: string;
  detail: string;
};

function buildOperationalInsights(input: {
  sales: { transactions: number; units: number; revenue: number; revenueChangePct: number | null };
  inventory: { totalUnits: number; sellableUnits: number; avgFieldAgeDays: number | null };
  aging: { overdue: number; critical: number; dueSoon: number };
  recovery: { openCases: number; overdue: number; throughputRatePct: number | null };
  concentration: { topTeamSharePct: number; topHolderSharePct: number };
  customers: { visibleCount: number };
  warnings: string[];
}): OperationalInsight[] {
  const insights: OperationalInsight[] = [];
  if (input.aging.critical > 0) insights.push({ severity: 'CRITICAL', code: 'AGING_CRITICAL', title: 'Critical aging exposure', detail: `${input.aging.critical} device(s) are beyond the policy critical threshold.` });
  else if (input.aging.overdue > 0) insights.push({ severity: 'WARNING', code: 'AGING_OVERDUE', title: 'Overdue stock exposure', detail: `${input.aging.overdue} device(s) are beyond the configured maximum age.` });
  if (input.recovery.overdue > 0) insights.push({ severity: 'WARNING', code: 'RECOVERY_OVERDUE', title: 'Recovery queue needs attention', detail: `${input.recovery.overdue} open recovery case(s) are past due.` });
  if (input.sales.revenueChangePct !== null && input.sales.revenueChangePct < 0) insights.push({ severity: 'WARNING', code: 'SALES_DECLINE', title: 'Revenue is below the prior window', detail: `Revenue is down ${Math.abs(input.sales.revenueChangePct).toFixed(1)}% versus the previous equivalent period.` });
  if (input.concentration.topHolderSharePct >= 50) insights.push({ severity: 'WARNING', code: 'HOLDER_CONCENTRATION', title: 'Inventory is concentrated', detail: `The top current holder controls ${input.concentration.topHolderSharePct.toFixed(1)}% of scoped sellable inventory.` });
  if (input.inventory.avgFieldAgeDays !== null && input.inventory.avgFieldAgeDays >= 14) insights.push({ severity: 'WARNING', code: 'HIGH_FIELD_AGE', title: 'Average field age is elevated', detail: `Average field age is ${input.inventory.avgFieldAgeDays.toFixed(1)} days across current scoped inventory.` });
  if (input.customers.visibleCount === 0 && input.sales.transactions > 0) insights.push({ severity: 'WARNING', code: 'CUSTOMER_DATA_GAP', title: 'Sales exist without visible customers', detail: 'The selected scope has sales activity but the report cannot see any customer records.' });
  if (!insights.length) insights.push({ severity: 'INFO', code: 'NO_EXCEPTIONS', title: 'No material exceptions detected', detail: 'The selected scope has no rule-based exceptions at the current reporting thresholds.' });
  if (input.warnings.length) insights.push({ severity: 'INFO', code: 'DATA_QUALITY', title: 'Report data-quality notes exist', detail: `${input.warnings.length} report integrity note(s) are listed below.` });
  return insights.slice(0, 8);
}

async function buildSalesHeadline(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, window: PeriodWindow, organizationId: string, regionId?: string, teamId?: string) {
  const build = async (from: string, to: string) => {
    const p = params();
    const scope = salesScope(context, 's', p);
    const extra = filterClause('s', p, regionId, teamId);
    const org = p.add(organizationId);
    const fromP = p.add(from);
    const toP = p.add(to);
    const date = saleDateExpr(caps);
    const sales = await one<{ transactions: string; revenue: string; reversed_transactions: string; reversed_revenue: string }>(tx,
      `select
         count(*) filter(where s.status='COMPLETED')::bigint::text as transactions,
         coalesce(sum(s.total_amount) filter(where s.status='COMPLETED'),0)::numeric::text as revenue,
         count(*) filter(where s.status='REVERSED')::bigint::text as reversed_transactions,
         coalesce(sum(s.total_amount) filter(where s.status='REVERSED'),0)::numeric::text as reversed_revenue
       from public.sales s
       where s.organization_id=${org}
         and s.status in ('COMPLETED','REVERSED')
         and ${date} >= ${fromP} and ${date} < ${toP}
         and ${scope}${appendAnd(extra)}`, p.values);

    const up = params();
    const uscope = salesScope(context, 's', up);
    const uextra = filterClause('s', up, regionId, teamId);
    const uorg = up.add(organizationId);
    const ufrom = up.add(from);
    const uto = up.add(to);
    const units = await one<{ units: string }>(tx,
      `select count(si.id)::bigint::text as units
       from public.sale_items si join public.sales s on s.id=si.sale_id
       where s.organization_id=${uorg} and s.status='COMPLETED' and si.is_active=true
         and ${date} >= ${ufrom} and ${date} < ${uto} and ${uscope}${appendAnd(uextra)}`, up.values);
    return {
      transactions: Number(sales.transactions),
      units: Number(units.units),
      revenue: Number(sales.revenue),
      reversedTransactions: Number(sales.reversed_transactions),
      reversedRevenue: Number(sales.reversed_revenue),
    };
  };
  return { current: await build(window.from, window.to), previous: await build(window.previousFrom, window.previousTo) };
}

async function buildPaymentMix(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, window: PeriodWindow, organizationId: string, regionId?: string, teamId?: string) {
  const build = async (from: string, to: string) => {
    const p = params();
    const org = p.add(organizationId);
    const fromP = p.add(from);
    const toP = p.add(to);
    const scope = salesScope(context, 's', p);
    const extra = filterClause('s', p, regionId, teamId);
    const date = saleDateExpr(caps);
    const rows = await tx.query<{ payment_type: string; transactions: string; units: string; revenue: string }>(
      `select
         upper(s.payment_type::text) as payment_type,
         count(distinct s.id)::bigint::text as transactions,
         coalesce(sum((select count(si.id) from public.sale_items si where si.sale_id=s.id and si.is_active=true)),0)::bigint::text as units,
         coalesce(sum(s.total_amount),0)::numeric::text as revenue
       from public.sales s
       where s.organization_id=${org} and s.status='COMPLETED'
         and ${date} >= ${fromP} and ${date} < ${toP}
         and ${scope}${appendAnd(extra)}
       group by upper(s.payment_type::text)
       order by upper(s.payment_type::text)`, p.values);
    const byType = Object.fromEntries(rows.map((row) => [row.payment_type, {
      transactions: Number(row.transactions),
      units: Number(row.units),
      revenue: Number(row.revenue),
    }]));
    return {
      cash: byType.CASH ?? { transactions: 0, units: 0, revenue: 0 },
      loan: byType.LOAN ?? { transactions: 0, units: 0, revenue: 0 },
      other: Object.entries(byType).filter(([key]) => !['CASH','LOAN'].includes(key)).map(([paymentType, value]) => ({ paymentType, ...(value as {transactions:number;units:number;revenue:number}) })),
    };
  };
  const current = await build(window.from, window.to);
  const previous = await build(window.previousFrom, window.previousTo);
  const revenueBase = current.cash.revenue + current.loan.revenue + current.other.reduce((sum, row) => sum + row.revenue, 0);
  return {
    current,
    previous,
    cashRevenueSharePct: revenueBase === 0 ? null : (current.cash.revenue / revenueBase) * 100,
    loanRevenueSharePct: revenueBase === 0 ? null : (current.loan.revenue / revenueBase) * 100,
  };
}

async function buildCommissionHeadline(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, window: PeriodWindow, organizationId: string, regionId?: string, teamId?: string) {
  const build = async (from: string, to: string) => {
    const p = params();
    const org = p.add(organizationId);
    const fromP = p.add(from);
    const toP = p.add(to);
    const scope = salesScope(context, 's', p);
    const extra = filterClause('s', p, regionId, teamId);
    const date = saleDateExpr(caps);
    return one<{ gross: string; adjustments: string; net: string }>(tx,
      `select
        coalesce(sum(c.amount),0)::numeric::text as gross,
        coalesce(sum(coalesce(adj.total_adjustment,0)),0)::numeric::text as adjustments,
        coalesce(sum(c.amount-coalesce(adj.total_adjustment,0)),0)::numeric::text as net
       from public.commissions c join public.sales s on s.id=c.sale_id
       left join lateral(select sum(a.amount) as total_adjustment from public.commission_adjustments a where a.commission_id=c.id) adj on true
       where c.status='ACTIVE' and s.organization_id=${org} and s.status='COMPLETED'
         and ${date} >= ${fromP} and ${date} < ${toP} and ${scope}${appendAnd(extra)}`, p.values);
  };
  return { current: await build(window.from, window.to), previous: await build(window.previousFrom, window.previousTo) };
}

async function buildInventoryHeadline(tx: DatabaseTransaction, context: AuthorizationContext, organizationId: string, regionId?: string, teamId?: string) {
  const p = params();
  const scope = inventoryScope(context, 'i', p);
  const extra = inventoryFilterClause('i', p, regionId, teamId);
  const rows = await one<{ total_units: string; sellable_units: string; stock_value: string; avg_field_age: string | null; avg_holder_age: string | null }>(tx,
    `select
       count(*) filter (where i.state not in ('SOLD','RETURNED'))::bigint::text as total_units,
       count(*) filter (where i.state in ('RECEIVED','MASTER_WAREHOUSE','REGIONAL_WAREHOUSE','ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP','RECOVERY_PENDING','RECOVERED'))::bigint::text as sellable_units,
       coalesce(sum(case when i.state in ('RECEIVED','MASTER_WAREHOUSE','REGIONAL_WAREHOUSE','ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP','RECOVERY_PENDING','RECOVERED') then coalesce(pp.selling_price,0) else 0 end),0)::numeric::text as stock_value,
       avg(extract(epoch from (now()-i.field_age_started_at))/86400.0) filter (where i.field_age_started_at is not null and i.state not in ('SOLD','RETURNED'))::numeric::text as avg_field_age,
       avg(extract(epoch from (now()-i.current_holder_started_at))/86400.0) filter (where i.current_holder_started_at is not null and i.state not in ('SOLD','RETURNED'))::numeric::text as avg_holder_age
     from public.imei_units i
     join public.product_variants pv_i on pv_i.id=i.product_variant_id
     join public.products prod_i on prod_i.id=pv_i.product_id
     join public.brands brand_i on brand_i.id=prod_i.brand_id
     left join lateral(select p.selling_price from public.price_policies p where p.product_variant_id=i.product_variant_id and p.status='ACTIVE' and p.effective_from <= now() and (p.effective_to is null or p.effective_to > now()) order by p.effective_from desc limit 1) pp on true
     where brand_i.organization_id=${p.add(organizationId)} and ${scope}${appendAnd(extra)}`, p.values);
  return {
    totalUnits: Number(rows.total_units),
    sellableUnits: Number(rows.sellable_units),
    stockValueEstimate: Number(rows.stock_value),
    avgFieldAgeDays: rows.avg_field_age === null ? null : Number(rows.avg_field_age),
    avgHolderAgeDays: rows.avg_holder_age === null ? null : Number(rows.avg_holder_age),
  };
}

async function buildAging(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, organizationId: string, regionId?: string, teamId?: string) {
  const policy = await loadAgingPolicy(tx, caps, organizationId);
  const p = params();
  const scope = inventoryScope(context, 'i', p);
  const extra = inventoryFilterClause('i', p, regionId, teamId);
  const rows = await tx.query<{ age_days: string; units: string }>(
    `select greatest(0,floor(extract(epoch from (now()-i.field_age_started_at))/86400))::int as age_days,count(*)::bigint::text as units
     from public.imei_units i
     join public.product_variants pv_i on pv_i.id=i.product_variant_id
     join public.products prod_i on prod_i.id=pv_i.product_id
     join public.brands brand_i on brand_i.id=prod_i.brand_id
     where brand_i.organization_id=${p.add(organizationId)} and i.field_age_started_at is not null
       and i.state not in ('SOLD','RETURNED','DAMAGED','LOST') and ${scope}${appendAnd(extra)}
     group by 1 order by 1`, p.values,
  );
  const bands: Record<'GREEN'|'ORANGE'|'RED'|'PURPLE'|'UNAGED', number> = { GREEN: 0, ORANGE: 0, RED: 0, PURPLE: 0, UNAGED: 0 };
  let dueSoon = 0;
  let overdue = 0;
  let critical = 0;
  for (const row of rows) {
    const days = Number(row.age_days);
    const units = Number(row.units);
    bands[ageBand(days, policy.bands)] += units;
    if (days >= Number(policy.row.warning_days) && days < Number(policy.row.maximum_days)) dueSoon += units;
    if (days >= Number(policy.row.maximum_days)) overdue += units;
    if (days >= Number(policy.row.maximum_days) + Number(policy.row.critical_overdue_days)) critical += units;
  }
  return {
    bands,
    dueSoon,
    overdue,
    critical,
    policy: {
      id: policy.row.id,
      maximumDays: Number(policy.row.maximum_days),
      warningDays: Number(policy.row.warning_days),
      criticalOverdueDays: Number(policy.row.critical_overdue_days),
      bands: policy.bands,
      bandSource: policy.source,
    },
  };
}

async function buildRecovery(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, organizationId: string, window: PeriodWindow, regionId?: string, teamId?: string) {
  const policy = await loadAgingPolicy(tx, caps, organizationId);

  const p = params();
  const scope = inventoryScope(context, 'i', p);
  const extra = inventoryFilterClause('i', p, regionId, teamId);
  const org = p.add(organizationId);
  const criticalAge = p.add(Number(policy.row.maximum_days) + Number(policy.row.critical_overdue_days));
  const open = await one<{ open_cases: string; due_soon: string; overdue: string; critical: string }>(tx,
    `select
       count(*) filter(where rc.status not in ('CLOSED','CANCELLED'))::bigint::text as open_cases,
       count(*) filter(where rc.status not in ('CLOSED','CANCELLED') and rc.due_at is not null and rc.due_at >= now() and rc.due_at < now()+interval '3 days')::bigint::text as due_soon,
       count(*) filter(where rc.status not in ('CLOSED','CANCELLED') and rc.due_at is not null and rc.due_at < now())::bigint::text as overdue,
       count(*) filter(where rc.status not in ('CLOSED','CANCELLED') and greatest(0,floor(extract(epoch from (now()-coalesce(i.field_age_started_at,i.received_at)))/86400)) >= ${criticalAge})::bigint::text as critical
     from public.recovery_cases rc
     join public.imei_units i on i.id=rc.imei_id
     join public.product_variants pv_i on pv_i.id=i.product_variant_id
     join public.products prod_i on prod_i.id=pv_i.product_id
     join public.brands brand_i on brand_i.id=prod_i.brand_id
     where brand_i.organization_id=${org} and ${scope}${appendAnd(extra)}`,
    p.values,
  );

  const openedP = params();
  const scope2 = inventoryScope(context, 'i', openedP);
  const extra2 = inventoryFilterClause('i', openedP, regionId, teamId);
  const org2 = openedP.add(organizationId);
  const openFrom = openedP.add(window.from);
  const openTo = openedP.add(window.to);
  const opened = await one<{ opened: string; closed: string; recovered: string; avg_days: string | null }>(tx,
    `select
       count(*) filter(where rc.opened_at >= ${openFrom} and rc.opened_at < ${openTo})::bigint::text as opened,
       count(*) filter(where rc.closed_at >= ${openFrom} and rc.closed_at < ${openTo})::bigint::text as closed,
       count(*) filter(where exists(select 1 from public.recovery_activities rx where rx.recovery_case_id=rc.id and rx.activity_type='RECOVERED' and rx.occurred_at >= ${openFrom} and rx.occurred_at < ${openTo}))::bigint::text as recovered,
       avg(extract(epoch from (coalesce(recovered.occurred_at,rc.closed_at)-rc.opened_at))/86400.0) filter(where coalesce(recovered.occurred_at,rc.closed_at) >= ${openFrom} and coalesce(recovered.occurred_at,rc.closed_at) < ${openTo})::numeric::text as avg_days
     from public.recovery_cases rc
     join public.imei_units i on i.id=rc.imei_id
     join public.product_variants pv_i on pv_i.id=i.product_variant_id
     join public.products prod_i on prod_i.id=pv_i.product_id
     join public.brands brand_i on brand_i.id=prod_i.brand_id
     left join lateral(select a.occurred_at from public.recovery_activities a where a.recovery_case_id=rc.id and a.activity_type='RECOVERED' order by a.occurred_at asc limit 1) recovered on true
     where brand_i.organization_id=${org2} and ${scope2}${appendAnd(extra2)}`,
    openedP.values,
  );

  const officerP = params();
  const officerScope = inventoryScope(context, 'i', officerP);
  const officerExtra = inventoryFilterClause('i', officerP, regionId, teamId);
  const org3 = officerP.add(organizationId);
  const fromP = officerP.add(window.from);
  const toP = officerP.add(window.to);
  const officers = await tx.query<{ user_id: string; display_name: string; opened_count: string; recovered_count: string; closed_count: string; avg_days: string | null }>(
    `select rc.assigned_officer_user_id as user_id,p.display_name,
       count(*) filter(where rc.opened_at >= ${fromP} and rc.opened_at < ${toP})::bigint::text as opened_count,
       count(*) filter(where exists(select 1 from public.recovery_activities rx where rx.recovery_case_id=rc.id and rx.activity_type='RECOVERED' and rx.occurred_at >= ${fromP} and rx.occurred_at < ${toP}))::bigint::text as recovered_count,
       count(*) filter(where rc.closed_at >= ${fromP} and rc.closed_at < ${toP})::bigint::text as closed_count,
       avg(extract(epoch from (coalesce(rec.occurred_at,rc.closed_at)-rc.opened_at))/86400.0) filter(where coalesce(rec.occurred_at,rc.closed_at) >= ${fromP} and coalesce(rec.occurred_at,rc.closed_at) < ${toP})::numeric::text as avg_days
     from public.recovery_cases rc
     join public.imei_units i on i.id=rc.imei_id
     join public.product_variants pv_i on pv_i.id=i.product_variant_id
     join public.products prod_i on prod_i.id=pv_i.product_id
     join public.brands brand_i on brand_i.id=prod_i.brand_id
     join public.profiles p on p.user_id=rc.assigned_officer_user_id
     left join lateral(select a.occurred_at from public.recovery_activities a where a.recovery_case_id=rc.id and a.activity_type='RECOVERED' order by a.occurred_at asc limit 1) rec on true
     where brand_i.organization_id=${org3} and rc.assigned_officer_user_id is not null and ${officerScope}${appendAnd(officerExtra)}
       and ((rc.opened_at >= ${fromP} and rc.opened_at < ${toP}) or (rc.closed_at >= ${fromP} and rc.closed_at < ${toP}) or exists(select 1 from public.recovery_activities rx where rx.recovery_case_id=rc.id and rx.occurred_at >= ${fromP} and rx.occurred_at < ${toP}))
     group by rc.assigned_officer_user_id,p.display_name order by recovered_count desc,closed_count desc,opened_count desc`, officerP.values);

  const openedCount = Number(opened.opened);
  return {
    openCases: Number(open.open_cases),
    dueSoon: Number(open.due_soon),
    overdue: Number(open.overdue),
    critical: Number(open.critical),
    opened: openedCount,
    closed: Number(opened.closed),
    recovered: Number(opened.recovered),
    throughputRatePct: openedCount === 0 ? null : (Number(opened.recovered) / openedCount) * 100,
    avgRecoveryDays: opened.avg_days === null ? null : Number(opened.avg_days),
    officers: officers.map((row) => ({ userId: row.user_id, displayName: fallbackName(row.display_name), opened: Number(row.opened_count), recovered: Number(row.recovered_count), closed: Number(row.closed_count), avgRecoveryDays: row.avg_days === null ? null : Number(row.avg_days) })),
  };
}
async function buildTrend(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, organizationId: string, window: PeriodWindow, regionId?: string, teamId?: string) {
  const p = params();
  const org = p.add(organizationId);
  const from = p.add(window.from);
  const to = p.add(window.to);
  const scope = salesScope(context, 'r', p);
  const extras: string[] = [];
  if (regionId) extras.push(`r.region_id=${p.add(regionId)}`);
  if (teamId) extras.push(`r.team_id=${p.add(teamId)}`);
  const source = caps.salesDailyModel ? `
    select r.sale_date as bucket,
      coalesce(sum(r.transaction_count-r.reversed_transaction_count),0)::bigint::text as transactions,
      coalesce(sum(r.revenue-r.reversed_revenue),0)::numeric::text as revenue,
      coalesce(sum(r.units-r.reversed_units),0)::bigint::text as units,
      coalesce(sum(cr.net_amount),0)::numeric::text as commission
    from public.read_model_sales_daily r
    left join (
      select organization_id,sale_date,region_id,team_id,beneficiary_user_id,sum(net_amount) as net_amount
      from public.read_model_commission_daily
      group by organization_id,sale_date,region_id,team_id,beneficiary_user_id
    ) cr on cr.organization_id=r.organization_id and cr.sale_date=r.sale_date
        and cr.region_id=r.region_id and cr.team_id=r.team_id and cr.beneficiary_user_id=r.seller_user_id
    where r.organization_id=${org} and r.sale_date >= ${from}::timestamptz::date and r.sale_date < ${to}::timestamptz::date
      and ${scope}${appendAnd(extras)}
    group by r.sale_date
    order by r.sale_date` : `
    select date_trunc('day',s.completed_at)::date as bucket,
      count(distinct s.id)::bigint::text as transactions,
      coalesce(sum(s.total_amount),0)::numeric::text as revenue,
      coalesce(sum((select count(si.id) from public.sale_items si where si.sale_id=s.id and si.is_active=true)),0)::bigint::text as units,
      coalesce(sum((select coalesce(sum(c0.amount-coalesce((select sum(a.amount) from public.commission_adjustments a where a.commission_id=c0.id),0)),0) from public.commissions c0 where c0.sale_id=s.id and c0.status='ACTIVE')),0)::numeric::text as commission
    from public.sales s
    where s.organization_id=${org} and s.status='COMPLETED' and s.completed_at >= ${from} and s.completed_at < ${to}
      and ${salesScope(context,'s',p)}${scopedSalesExtra(p, regionId, teamId)}
    group by 1 order by 1`;
  const rows = await tx.query<{ bucket: string; units: string; transactions: string; revenue: string; commission: string }>(source, p.values);
  const result = rows.map((row) => ({ bucket: row.bucket, units: Number(row.units), transactions: Number(row.transactions), revenue: Number(row.revenue), commission: Number(row.commission) }));
  const bucketStart = new Date(window.from);
  const bucketEnd = new Date(window.to);
  const filled = new Map(result.map((row) => [String(row.bucket).slice(0,10), row]));
  const output: typeof result = [];
  for (let cursor = new Date(bucketStart); cursor < bucketEnd; cursor = new Date(cursor.getTime() + (window.bucket === 'DAY' ? 86400000 : 0))) {
    const key = cursor.toISOString().slice(0,10);
    const existing = filled.get(key);
    if (existing) output.push(existing);
    else output.push({ bucket:key, units:0, transactions:0, revenue:0, commission:0 });
    if (window.bucket === 'MONTH') cursor.setUTCMonth(cursor.getUTCMonth()+1);
  }
  return output;
}
async function buildComparison(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, organizationId: string, type: ComparisonType, window: PeriodWindow, agedThresholdDays: number, regionId?: string, teamId?: string) {
  const baseP = params();
  const org = baseP.add(organizationId);
  const entityScope = (field: string) => {
    if (isCompanyWide(context, 'reports.view')) return 'TRUE';
    if (type === 'REGION') return context.regionIds.length ? `${field} = ANY(${baseP.add(context.regionIds)}::uuid[])` : 'FALSE';
    if (type === 'TEAM') return context.teamIds.length ? `${field} = ANY(${baseP.add(context.teamIds)}::uuid[])` : 'FALSE';
    if (type === 'MANAGER' && context.roles.includes('REGIONAL_MANAGER')) return context.regionIds.length ? `${field} = ANY(${baseP.add(context.regionIds)}::uuid[])` : 'FALSE';
    return 'TRUE';
  };

  type BaseRow = { id: string; name: string | null; secondary: string | null };
  let baseSql: string;
  if (type === 'AGENT') {
    baseSql = `select distinct ra.user_id as id,p.display_name as name,max(t.team_name) over(partition by ra.user_id) as secondary
      from public.role_assignments ra join public.profiles p on p.user_id=ra.user_id
      left join public.teams t on t.id=ra.team_id where ra.role='AGENT' and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now()) and p.status='ACTIVE' and p.organization_id=${org}`;
    if (context.roles.includes('REGIONAL_MANAGER')) baseSql += ` and ra.region_id = ANY(${baseP.add(context.regionIds)}::uuid[])`;
    else if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) baseSql += ` and ra.team_id = ANY(${baseP.add(context.teamIds)}::uuid[])`;
    else baseSql += ` and ra.user_id = ${baseP.add(context.userId)}`;
  } else if (type === 'TEAM') {
    baseSql = `select t.id,t.team_name as name,max(r.region_name) as secondary from public.teams t join public.regions r on r.id=t.region_id where t.status='ACTIVE' and ${entityScope('t.id')} group by t.id,t.team_name`;
  } else if (type === 'MANAGER') {
    baseSql = `select m.user_id as id,max(p.display_name) as name,max(r.region_name) as secondary from public.managers m join public.profiles p on p.user_id=m.user_id join public.regions r on r.id=m.region_id where m.status='ACTIVE' and p.status='ACTIVE' and ${entityScope('m.region_id')} group by m.user_id`;
    if (context.roles.includes('MANAGER')) baseSql += ` having m.user_id = ${baseP.add(context.userId)}`;
    if (context.roles.includes('TEAM_LEADER')) baseSql += ` having exists(select 1 from public.teams tx where tx.manager_user_id=m.user_id and tx.id=ANY(${baseP.add(context.teamIds)}::uuid[]))`;
  } else {
    baseSql = `select r.id,r.region_name as name,r.region_code as secondary from public.regions r where r.status='ACTIVE' and ${entityScope('r.id')} and r.organization_id=${org}`;
  }
  if (regionId) {
    if (type === 'REGION' && regionId) baseSql += ` and id=${baseP.add(regionId)}`;
  }
  if (teamId && type === 'TEAM') {
    baseSql = baseSql.replace(/\s+group by t\.id,t\.team_name$/, ` and t.id=${baseP.add(teamId)} group by t.id,t.team_name`);
  }
  const baseRows = await tx.query<BaseRow>(baseSql, baseP.values);

  const entityExpr = type === 'AGENT' ? 's.seller_user_id' : type === 'TEAM' ? 's.team_id' : type === 'MANAGER' ? 'coalesce(s.manager_user_id,t.manager_user_id)' : 's.region_id';
  const stockExpr = type === 'AGENT' ? 'i.current_holder_user_id' : type === 'TEAM' ? 'i.current_team_id' : type === 'MANAGER' ? 'coalesce(mt.manager_user_id,mh.user_id)' : 'i.current_region_id';
  const salesP = params();
  const scope = salesScope(context, 's', salesP);
  const salesExtra = filterClause('s', salesP, regionId, teamId);
  const date = saleDateExpr(caps);
  const salesAgg = await tx.query<{ id:string; units:string; transactions:string; revenue:string; commission:string }>(
    `select ${entityExpr}::text as id,
       count(distinct s.id)::bigint::text as transactions,
       coalesce(sum(s.total_amount),0)::numeric::text as revenue,
       coalesce(sum((select count(*) from public.sale_items si where si.sale_id=s.id and si.is_active=true)),0)::bigint::text as units,
       coalesce(sum((select coalesce(sum(c.amount-coalesce((select sum(a.amount) from public.commission_adjustments a where a.commission_id=c.id),0)),0) from public.commissions c where c.sale_id=s.id and c.status='ACTIVE')),0)::numeric::text as commission
     from public.sales s left join public.teams t on t.id=s.team_id
     where s.organization_id=${salesP.add(organizationId)} and s.status='COMPLETED' and ${date} >= ${salesP.add(window.from)} and ${date} < ${salesP.add(window.to)} and ${scope}${appendAnd(salesExtra)}
     group by ${entityExpr}`, salesP.values,
  );

  const stockP = params();
  const invScope = inventoryScope(context, 'i', stockP);
  const invExtra = inventoryFilterClause('i', stockP, regionId, teamId);
  const stockAgg = await tx.query<{ id:string; current:string; aged:string }>(
    `select ${stockExpr}::text as id,
       count(*) filter(where i.state in ('RECEIVED','MASTER_WAREHOUSE','REGIONAL_WAREHOUSE','ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP','RECOVERY_PENDING','RECOVERED'))::bigint::text as current,
       count(*) filter(where i.field_age_started_at is not null and greatest(0,floor(extract(epoch from (now()-i.field_age_started_at))/86400)) >= ${stockP.add(agedThresholdDays)} and i.state not in ('SOLD','RETURNED','DAMAGED','LOST'))::bigint::text as aged
     from public.imei_units i
     left join public.teams mt on mt.id=i.current_team_id
     left join public.managers mh on mh.user_id=i.current_holder_user_id
     where ${invScope}${appendAnd(invExtra)} and ${stockExpr} is not null
     group by ${stockExpr}`, stockP.values,
  );
  const salesMap = new Map(salesAgg.map((row) => [row.id, row]));
  const stockMap = new Map(stockAgg.map((row) => [row.id, row]));
  return baseRows.map((base) => {
    const sale = salesMap.get(base.id);
    const stock = stockMap.get(base.id);
    const units = Number(sale?.units ?? 0);
    const current = Number(stock?.current ?? 0);
    return {
      id: base.id,
      name: fallbackName(base.name),
      secondary: base.secondary ?? null,
      units,
      transactions: Number(sale?.transactions ?? 0),
      revenue: Number(sale?.revenue ?? 0),
      commission: Number(sale?.commission ?? 0),
      currentStockUnits: current,
      agedStockUnits: Number(stock?.aged ?? 0),
      sellThroughProxyPct: units + current === 0 ? null : (units / (units + current)) * 100,
    };
  }).sort((a, b) => b.revenue - a.revenue || b.units - a.units).slice(0, 100);
}

async function buildProductPerformance(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, organizationId: string, window: PeriodWindow, regionId?: string, teamId?: string) {
  const p = params();
  const date = saleDateExpr(caps);
  const finalPrice = caps.finalPriceColumn === 'final_price' ? 'si.final_price' : 'si.unit_price';
  const scope = salesScope(context, 's', p);
  const extra = filterClause('s', p, regionId, teamId);
  const rows = await tx.query<{ variant_id:string; brand_name:string; model_name:string; sku:string; units:string; revenue:string; avg_price:string }>(
    `select pv.id as variant_id,b.brand_name,p.model_name,pv.sku,
       count(si.id)::bigint::text as units,
       coalesce(sum(si.line_total),0)::numeric::text as revenue,
       coalesce(avg(${finalPrice}),0)::numeric::text as avg_price
     from public.sale_items si join public.sales s on s.id=si.sale_id join public.product_variants pv on pv.id=si.product_variant_id
     join public.products p on p.id=pv.product_id join public.brands b on b.id=p.brand_id
     where s.organization_id=${p.add(organizationId)} and s.status='COMPLETED' and si.is_active=true and ${date} >= ${p.add(window.from)} and ${date} < ${p.add(window.to)}
       and ${scope}${appendAnd(extra)}
     group by pv.id,b.brand_name,p.model_name,pv.sku order by units desc,revenue desc limit 100`, p.values,
  );

  const stockP = params();
  const invScope = inventoryScope(context, 'i', stockP);
  const invExtra = inventoryFilterClause('i', stockP, regionId, teamId);
  const stock = await tx.query<{ variant_id:string; current_stock:string }>(
    `select i.product_variant_id as variant_id,count(*)::bigint::text as current_stock from public.imei_units i
     join public.product_variants pv_i on pv_i.id=i.product_variant_id
     join public.products prod_i on prod_i.id=pv_i.product_id
     join public.brands brand_i on brand_i.id=prod_i.brand_id
     where brand_i.organization_id=${stockP.add(organizationId)} and i.state not in ('SOLD','RETURNED') and ${invScope}${appendAnd(invExtra)}
     group by i.product_variant_id`, stockP.values,
  );
  const stockMap = new Map(stock.map((row) => [row.variant_id, Number(row.current_stock)]));
  return rows.map((row) => ({
    variantId: row.variant_id,
    brandName: row.brand_name,
    modelName: row.model_name,
    sku: row.sku,
    units: Number(row.units),
    revenue: Number(row.revenue),
    avgPrice: Number(row.avg_price),
    currentStockUnits: stockMap.get(row.variant_id) ?? 0,
    sellThroughProxyPct: Number(row.units) + (stockMap.get(row.variant_id) ?? 0) === 0 ? null : (Number(row.units) / (Number(row.units) + (stockMap.get(row.variant_id) ?? 0))) * 100,
  }));
}

async function buildInventoryBreakdown(tx: DatabaseTransaction, context: AuthorizationContext, organizationId: string, regionId?: string, teamId?: string) {
  const p = params();
  const org = p.add(organizationId);
  const scope = inventoryScope(context, 'i', p);
  const extra = inventoryFilterClause('i', p, regionId, teamId);
  const joins = `join public.product_variants pv_i on pv_i.id=i.product_variant_id join public.products prod_i on prod_i.id=pv_i.product_id join public.brands brand_i on brand_i.id=prod_i.brand_id`;
  const where = `brand_i.organization_id=${org} and ${scope}${appendAnd(extra)}`;
  const states = await tx.query<{ state:string; units:string }>(`select i.state::text as state,count(*)::bigint::text as units from public.imei_units i ${joins} where ${where} group by i.state order by units desc`, p.values);
  const sellable = `(i.state in ('RECEIVED','MASTER_WAREHOUSE','REGIONAL_WAREHOUSE','ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP','RECOVERED'))`;
  const regions = await tx.query<{ id:string; name:string; units:string }>(`select r.id,r.region_name as name,count(*)::bigint::text as units from public.imei_units i ${joins} join public.regions r on r.id=i.current_region_id where ${where} and ${sellable} group by r.id,r.region_name order by units desc`, p.values);
  const teams = await tx.query<{ id:string; name:string; units:string }>(`select t.id,t.team_name as name,count(*)::bigint::text as units from public.imei_units i ${joins} join public.teams t on t.id=i.current_team_id where ${where} and ${sellable} group by t.id,t.team_name order by units desc`, p.values);
  const holders = await tx.query<{ id:string; name:string; units:string }>(`select i.current_holder_user_id as id,coalesce(pf.display_name,'Unassigned') as name,count(*)::bigint::text as units from public.imei_units i ${joins} left join public.profiles pf on pf.user_id=i.current_holder_user_id where ${where} and ${sellable} group by i.current_holder_user_id,pf.display_name order by units desc`, p.values);
  const teamConcentration = concentration(teams.map((row) => Number(row.units)));
  const holderConcentration = concentration(holders.map((row) => Number(row.units)));
  const unallocated = states.filter((row) => ['MASTER_WAREHOUSE','REGIONAL_WAREHOUSE'].includes(row.state)).reduce((sum, row) => sum + Number(row.units), 0);
  return {
    states: states.map((row) => ({ state: row.state, units: Number(row.units) })),
    regions: regions.map((row) => ({ id: row.id, name: row.name, units: Number(row.units) })),
    teams: teams.map((row) => ({ id: row.id, name: row.name, units: Number(row.units) })),
    holders: holders.map((row) => ({ id: row.id, name: row.name, units: Number(row.units) })),
    concentration: {
      totalUnits: teamConcentration.totalUnits,
      topTeamSharePct: teamConcentration.topSharePct,
      topHolderSharePct: holderConcentration.topSharePct,
      teamHhi: teamConcentration.hhi,
      holderHhi: holderConcentration.hhi,
      unallocatedUnits: unallocated,
    },
  };
}
async function buildCustomerCount(tx: DatabaseTransaction, context: AuthorizationContext, caps: Capabilities, organizationId: string, regionId?: string, teamId?: string) {
  const p = params();
  const org = p.add(organizationId);
  if (isCompanyWide(context, 'customers.view')) {
    return one<{ total: string }>(tx, `select count(*)::bigint::text as total from public.customers c where c.organization_id=${org}`, p.values);
  }
  const owner = caps.customerOwnerColumn === 'owner_user_id' ? 'c.owner_user_id' : 'c.created_by';
  if (caps.customerRegionColumn || caps.customerTeamColumn || caps.customerAssignments) {
    const conditions: string[] = [`c.organization_id=${org}`];
    if (context.roles.includes('REGIONAL_MANAGER') && caps.customerRegionColumn) conditions.push(`c.region_id = ANY(${p.add(context.regionIds)}::uuid[])`);
    else if ((context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) && caps.customerTeamColumn) conditions.push(`c.team_id = ANY(${p.add(context.teamIds)}::uuid[])`);
    else conditions.push(`${owner}=${p.add(context.userId)}`);
    if (regionId && caps.customerRegionColumn) conditions.push(`c.region_id=${p.add(regionId)}`);
    if (teamId && caps.customerTeamColumn) conditions.push(`c.team_id=${p.add(teamId)}`);
    return one<{ total: string }>(tx, `select count(*)::bigint::text as total from public.customers c where ${conditions.join(' and ')}`, p.values);
  }

  const salesP = params();
  const scope = salesScope(context, 's', salesP);
  const extra = filterClause('s', salesP, regionId, teamId);
  return one<{ total: string }>(tx,
    `select count(*)::bigint::text as total from public.customers c
     where c.organization_id=${salesP.add(organizationId)}
       and (${owner}=${salesP.add(context.userId)} or exists(
         select 1 from public.sales s where s.customer_id=c.id and ${scope}${appendAnd(extra)}
       ))`, salesP.values);
}

async function buildSystemAudit(tx: DatabaseTransaction, caps: Capabilities) {
  const row = await one<{
    outbox_pending:string; realtime_events:string; latest_sequence:string|null;
    read_model_sales_rows:string; read_model_sales_updated:string|null;
    read_model_product_rows:string; read_model_product_updated:string|null;
    read_model_commission_rows:string; read_model_commission_updated:string|null;
    incomplete_sales_scope:string;
  }>(tx,
    `select
      (select count(*) from public.outbox_events where published_at is null)::bigint::text as outbox_pending,
      (select count(*) from public.realtime_events)::bigint::text as realtime_events,
      (select max(sequence_number) from public.realtime_events)::text as latest_sequence,
      (select count(*) from public.read_model_sales_daily)::bigint::text as read_model_sales_rows,
      (select max(updated_at) from public.read_model_sales_daily)::text as read_model_sales_updated,
      (select count(*) from public.read_model_product_daily)::bigint::text as read_model_product_rows,
      (select max(updated_at) from public.read_model_product_daily)::text as read_model_product_updated,
      (select count(*) from public.read_model_commission_daily)::bigint::text as read_model_commission_rows,
      (select max(updated_at) from public.read_model_commission_daily)::text as read_model_commission_updated,
      (select count(*) from public.sales where status in ('COMPLETED','REVERSED') and (region_id is null or team_id is null))::bigint::text as incomplete_sales_scope`, []);
  return {
    outboxPending: Number(row.outbox_pending),
    realtimeEvents: Number(row.realtime_events),
    latestSequence: row.latest_sequence ? Number(row.latest_sequence) : 0,
    readModelSalesRows: Number(row.read_model_sales_rows),
    readModelSalesUpdatedAt: row.read_model_sales_updated,
    readModelProductRows: Number(row.read_model_product_rows),
    readModelProductUpdatedAt: row.read_model_product_updated,
    readModelCommissionRows: Number(row.read_model_commission_rows),
    readModelCommissionUpdatedAt: row.read_model_commission_updated,
    incompleteSalesScope: Number(row.incomplete_sales_scope),
    readModels: { salesDailyHasTransactionCount: caps.salesDailyModel, productDaily: caps.productDailyModel, commissionDaily: caps.commissionDailyModel },
  };
}

export async function getOperationalReport(services: ApiServices, requestId: string, actorUserId: string, input: OperationalReportRequest): Promise<unknown> {
  return services.transactions.withTransaction({ requestId, actorUserId }, async (tx) => {
    await tx.query(`set local transaction_read_only = on`);
    await tx.query(`set local statement_timeout = '8s'`);
    const context = await loadAuthorizationContext(tx, actorUserId);
    if (!canView(context, 'reports.view')) throw new Error('Report access is not authorized for this account.');
    assertFilterAllowed(context, input.regionId, input.teamId);
    const caps = await schemaCapabilities(tx);
    const organizationId = await currentOrganizationId(tx, actorUserId);
    const window = periodWindow(input.period);

    const salesVisible = canView(context, 'sales.view');
    const inventoryVisible = canView(context, 'inventory.view');
    const recoveryVisible = canView(context, 'recovery.view');
    const commissionVisible = canView(context, 'commissions.view');
    const customerVisible = canView(context, 'customers.view');

    const sales = salesVisible ? await buildSalesHeadline(tx, context, caps, window, organizationId, input.regionId, input.teamId) : { current:{transactions:0,units:0,revenue:0,reversedTransactions:0,reversedRevenue:0}, previous:{transactions:0,units:0,revenue:0,reversedTransactions:0,reversedRevenue:0} };
    const paymentMix = salesVisible ? await buildPaymentMix(tx, context, caps, window, organizationId, input.regionId, input.teamId) : { current:{cash:{transactions:0,units:0,revenue:0},loan:{transactions:0,units:0,revenue:0},other:[]},previous:{cash:{transactions:0,units:0,revenue:0},loan:{transactions:0,units:0,revenue:0},other:[]},cashRevenueSharePct:null,loanRevenueSharePct:null };
    const commission = commissionVisible ? await buildCommissionHeadline(tx, context, caps, window, organizationId, input.regionId, input.teamId) : { current:{gross:'0',adjustments:'0',net:'0'}, previous:{gross:'0',adjustments:'0',net:'0'} };
    const inventory = inventoryVisible ? await buildInventoryHeadline(tx, context, organizationId, input.regionId, input.teamId) : { totalUnits:0,sellableUnits:0,stockValueEstimate:0,avgFieldAgeDays:null,avgHolderAgeDays:null };
    const aging = recoveryVisible ? await buildAging(tx, context, caps, organizationId, input.regionId, input.teamId) : { bands:{GREEN:0,ORANGE:0,RED:0,PURPLE:0,UNAGED:0},dueSoon:0,overdue:0,critical:0,policy:null };
    const recovery = recoveryVisible ? await buildRecovery(tx, context, caps, organizationId, window, input.regionId, input.teamId) : { openCases:0,dueSoon:0,overdue:0,critical:0,opened:0,closed:0,recovered:0,throughputRatePct:null,avgRecoveryDays:null,officers:[] };
    const trend = salesVisible ? await buildTrend(tx, context, caps, organizationId, window, input.regionId, input.teamId) : [];
    const comparison = await buildComparison(tx, context, caps, organizationId, input.comparison, window, Number(aging.policy?.warningDays ?? 8), input.regionId, input.teamId);
    const products = salesVisible ? await buildProductPerformance(tx, context, caps, organizationId, window, input.regionId, input.teamId) : [];
    const inventoryBreakdown = inventoryVisible ? await buildInventoryBreakdown(tx, context, organizationId, input.regionId, input.teamId) : { states:[],regions:[],teams:[],holders:[],concentration:{totalUnits:0,topTeamSharePct:0,topHolderSharePct:0,teamHhi:0,holderHhi:0,unallocatedUnits:0} };
    const customers = customerVisible ? await buildCustomerCount(tx, context, caps, organizationId, input.regionId, input.teamId) : { total:'0' };
    const system = (context.roles.includes('CEO') || context.permissions.includes('audit.view')) ? await buildSystemAudit(tx, caps) : { outboxPending:0,realtimeEvents:0,latestSequence:0,readModelSalesRows:0,readModelSalesUpdatedAt:null,readModelProductRows:0,readModelProductUpdatedAt:null,readModelCommissionRows:0,readModelCommissionUpdatedAt:null,incompleteSalesScope:0,readModels:{salesDailyHasTransactionCount:caps.salesDailyModel,productDaily:caps.productDailyModel,commissionDaily:caps.commissionDailyModel} };

    const soldUnits = sales.current.units;
    const sellableUnits = inventory.sellableUnits;
    const sellThrough = soldUnits + sellableUnits === 0 ? null : (soldUnits / (soldUnits + sellableUnits)) * 100;
    const warnings: string[] = [];
    if (!caps.salesDailyModel || !caps.productDailyModel || !caps.commissionDailyModel) warnings.push('Some detailed daily summaries are not available yet, so this report is using the latest recorded business activity.');
    if (!caps.customerAssignments) warnings.push('Customer totals are based on current customer ownership because older reassignment history is not available.');
    if (!caps.bandConfigColumn) warnings.push('Aging is using the approved Amaal defaults because custom age bands are not available yet.');
    if (system.outboxPending > 0) warnings.push(`${system.outboxPending} recent updates are waiting to appear in all report views.`);
    if (system.incompleteSalesScope > 0) warnings.push(`${system.incompleteSalesScope} sale(s) are missing location details, so some comparisons may be incomplete.`);
    if (!aging.policy?.bandSource?.includes('stored') && recoveryVisible) warnings.push('This view is using the approved Amaal aging defaults.');
    if (system.readModelSalesRows > 0 && system.readModelSalesUpdatedAt) {
      const ageMinutes = (Date.now() - new Date(system.readModelSalesUpdatedAt).getTime()) / 60000;
      if (Number.isFinite(ageMinutes) && ageMinutes > 15) warnings.push(`Sales trend information is about ${ageMinutes.toFixed(0)} minutes old.`);
    }
    if (system.readModelProductRows > 0 && system.readModelProductUpdatedAt) {
      const ageMinutes = (Date.now() - new Date(system.readModelProductUpdatedAt).getTime()) / 60000;
      if (Number.isFinite(ageMinutes) && ageMinutes > 15) warnings.push(`Product information is about ${ageMinutes.toFixed(0)} minutes old.`);
    }
    if (system.readModelCommissionRows > 0 && system.readModelCommissionUpdatedAt) {
      const ageMinutes = (Date.now() - new Date(system.readModelCommissionUpdatedAt).getTime()) / 60000;
      if (Number.isFinite(ageMinutes) && ageMinutes > 15) warnings.push(`Commission information is about ${ageMinutes.toFixed(0)} minutes old.`);
    }
    const insights = buildOperationalInsights({
      sales: { ...sales.current, revenueChangePct: percentChange(sales.current.revenue, sales.previous.revenue) },
      inventory,
      aging: { overdue: aging.overdue, critical: aging.critical, dueSoon: aging.dueSoon },
      recovery,
      concentration: inventoryBreakdown.concentration,
      customers: { visibleCount: Number(customers.total) },
      warnings,
    });

    return {
      generatedAt: new Date().toISOString(),
      reportVersion: '7.3',
      period: { key:window.period,label:window.label,from:window.from,to:window.to,previousFrom:window.previousFrom,previousTo:window.previousTo,bucket:window.bucket,timezone:'UTC',comparisonBasis:'previous equivalent window' },
      role: context.roles[0] ?? 'UNKNOWN',
      visibility:{sales:salesVisible,inventory:inventoryVisible,recovery:recoveryVisible,commission:commissionVisible,customers:customerVisible,reports:true},
      headline:{
        sales:{...sales.current,priorUnits:sales.previous.units,priorTransactions:sales.previous.transactions,priorRevenue:sales.previous.revenue,priorReversedTransactions:sales.previous.reversedTransactions,priorReversedRevenue:sales.previous.reversedRevenue,unitsChangePct:percentChange(sales.current.units,sales.previous.units),transactionsChangePct:percentChange(sales.current.transactions,sales.previous.transactions),revenueChangePct:percentChange(sales.current.revenue,sales.previous.revenue)},
        paymentMix,
        commission:{gross:Number(commission.current.gross),adjustments:Number(commission.current.adjustments),net:Number(commission.current.net),priorNet:Number(commission.previous.net),changePct:percentChange(Number(commission.current.net),Number(commission.previous.net))},
        inventory:{...inventory,sellThroughProxyPct:sellThrough},
        aging:{...aging},
        recovery:{openCases:recovery.openCases,dueSoon:recovery.dueSoon,overdue:recovery.overdue,critical:recovery.critical,opened:recovery.opened,closed:recovery.closed,recovered:recovery.recovered,ratePct:recovery.throughputRatePct,avgRecoveryDays:recovery.avgRecoveryDays},
        customers:{visibleCount:Number(customers.total)},
        stockConcentration:inventoryBreakdown.concentration,
      },
      trend:trend.map((row)=>({bucket:row.bucket,units:Number(row.units),transactions:Number(row.transactions),revenue:Number(row.revenue),commission:Number(row.commission)})),
      comparison:{type:input.comparison,rows:comparison},
      products,
      aging:{bands:aging.bands,policy:aging.policy},
      recovery,
      inventory:inventoryBreakdown,
      system:{...system,warnings},
      insights,
      methodology:{
        facts:['Sales totals come from recorded Amaal sales available in your area.','Cash and loan sales are summarized from completed sales for the selected period.','Unit totals count each device sold.','Net commission reflects commissions after recorded adjustments.','Current stock comes from the latest device records and their locations.','Recovery totals use recorded recovery cases and completed recovery activity.'],
        estimates:['Stock value is an estimate based on the latest selling prices.','A historical recovery value is not shown when the required price history is unavailable.'],
        proxies:['Sales rate compares units sold with the units currently available.','Stock distribution shows how current devices are spread across teams and holders.','Recovery completion rate compares recovered cases with cases opened in the selected period.'],
        aging:'Device age is based on when each device entered field use. The approved Amaal aging rules are used when a custom rule is not available.',
        comparison:'Comparisons include the active people and teams available in your area, including those with no activity during the selected period.',
        caching:'This report is personalized to the person viewing it. It is not shared with another person by mistake.',
        execution:'The report is designed to return promptly without changing business records.',
        schemaCapabilities:caps,
      },
    };
  });
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[\",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function getOperationalReportCsv(services: ApiServices, requestId: string, actorUserId: string, input: OperationalReportRequest): Promise<{ filename: string; csv: string }> {
  return services.transactions.withTransaction({ requestId, actorUserId }, async (tx) => {
    await tx.query(`set local transaction_read_only = on`);
    await tx.query(`set local statement_timeout = '8s'`);
    const context = await loadAuthorizationContext(tx, actorUserId);
    if (!context.roles.includes('CEO') && !context.permissions.includes('reports.export')) {
      throw new Error('Report export is not authorized for this account.');
    }
    if (!canView(context, 'reports.view')) throw new Error('Report access is not authorized for this account.');
    assertFilterAllowed(context, input.regionId, input.teamId);

    const report = await getOperationalReport(services, requestId, actorUserId, input) as {
      generatedAt: string;
      reportVersion: string;
      period: { label: string; from: string; to: string };
      role: string;
      headline: { sales: Record<string, unknown>; paymentMix: Record<string, unknown>; commission: Record<string, unknown>; inventory: Record<string, unknown>; aging: Record<string, unknown>; recovery: Record<string, unknown>; customers: Record<string, unknown>; stockConcentration: Record<string, unknown> };
      comparison: { type: string; rows: Array<Record<string, unknown>> };
      trend: Array<Record<string, unknown>>;
      products: Array<Record<string, unknown>>;
      recovery: { officers: Array<Record<string, unknown>> };
      insights: Array<Record<string, unknown>>;
    };

    const lines: string[] = ['section,name,value,secondary,tertiary'];
    const push = (section: string, name: string, value: unknown, secondary = '', tertiary = '') => lines.push([section,name,value,secondary,tertiary].map(csvEscape).join(','));
    push('meta','report_version',report.reportVersion);
    push('meta','generated_at',report.generatedAt);
    push('period','label',report.period.label);
    push('period','from',report.period.from);
    push('period','to',report.period.to);
    for (const [name,value] of Object.entries(report.headline.sales)) push('sales',name,value);
    for (const [name,value] of Object.entries(report.headline.commission)) push('commission',name,value);
    for (const [name,value] of Object.entries(report.headline.inventory)) push('inventory',name,value);
    for (const [name,value] of Object.entries(report.headline.aging)) push('aging',name,typeof value === 'object' ? JSON.stringify(value) : value);
    for (const [name,value] of Object.entries(report.headline.recovery)) if (typeof value !== 'object') push('recovery',name,value);
    const mix = report.headline.paymentMix as { current?: Record<string, unknown>; cashRevenueSharePct?: number | null; loanRevenueSharePct?: number | null };
    if (mix?.current) {
      for (const [type,value] of Object.entries(mix.current)) {
        if (type === 'other') continue;
        const item = value as Record<string, unknown>;
        push('payment_mix',type,item.revenue,item.transactions ?? '',item.units ?? '');
      }
      push('payment_mix','cash_revenue_share_pct',mix.cashRevenueSharePct);
      push('payment_mix','loan_revenue_share_pct',mix.loanRevenueSharePct);
    }
    for (const row of report.comparison.rows) push('comparison',row.name,row.revenue,row.units,row.sellThroughProxyPct);
    for (const row of report.trend) push('trend',row.bucket,row.revenue,row.units,row.transactions);
    for (const row of report.products) push('product',row.sku,row.revenue,row.units,row.sellThroughProxyPct);
    for (const row of report.recovery.officers) push('recovery_officer',row.displayName,row.recovered,row.closed,row.avgRecoveryDays);
    for (const row of report.insights) push('insight',row.code,row.detail,row.severity,row.title);
    return { filename: `amaal-operational-report-${input.period.toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`, csv: lines.join('\n') + '\n' };
  });
}

export function parseReportPeriod(value: string | null): ReportPeriod {
  switch ((value ?? 'MONTH').toUpperCase()) {
    case 'TODAY': return 'TODAY';
    case 'WEEK': return 'WEEK';
    case 'MONTH': return 'MONTH';
    case '3M': return '3M';
    case '6M': return '6M';
    case '12M':
    case 'YEAR': return '12M';
    default: throw new Error('Unsupported report period. Use TODAY, WEEK, MONTH, 3M, 6M or 12M.');
  }
}

export function parseComparison(value: string | null): ComparisonType {
  switch ((value ?? 'TEAM').toUpperCase()) {
    case 'AGENT': return 'AGENT';
    case 'TEAM': return 'TEAM';
    case 'MANAGER': return 'MANAGER';
    case 'REGION': return 'REGION';
    default: throw new Error('Unsupported comparison type.');
  }
}

export { ageBand, clampLimit, concentration, percentChange, periodWindow, resolveAgeBands } from './reporting-math.ts';

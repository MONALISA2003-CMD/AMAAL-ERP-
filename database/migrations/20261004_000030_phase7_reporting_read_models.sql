-- Amaal ERP — Phase 7 reporting / operational-intelligence read models.
-- Derived only; never authoritative. No business-truth rows are deleted.

alter table public.read_model_sales_daily
  add column if not exists transaction_count bigint not null default 0,
  add column if not exists reversed_transaction_count bigint not null default 0;

-- Rebuild the derived daily sales projection from authoritative Phase 4 data.
-- One row is reduced to one sale before revenue is rolled up so multi-IMEI
-- transactions never multiply the sale total.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sales
    WHERE status IN ('COMPLETED','REVERSED')
      AND (region_id IS NULL OR team_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Phase 7 reporting model requires completed/reversed sales to have region_id and team_id.';
  END IF;
END $$;

DELETE FROM public.read_model_sales_daily;
WITH sale_level AS (
  SELECT
    s.id AS sale_id,
    s.organization_id,
    coalesce(s.completed_at,s.created_at)::date AS sale_date,
    s.region_id,
    s.team_id,
    s.seller_user_id,
    s.status,
    s.total_amount,
    count(si.id) FILTER (WHERE s.status='COMPLETED' AND si.is_active=true) AS completed_units,
    count(si.id) FILTER (WHERE s.status='REVERSED') AS reversed_units
  FROM public.sales s
  LEFT JOIN public.sale_items si ON si.sale_id=s.id
  WHERE s.status IN ('COMPLETED','REVERSED')
  GROUP BY s.id,s.organization_id,coalesce(s.completed_at,s.created_at)::date,s.region_id,s.team_id,s.seller_user_id,s.status,s.total_amount
)
INSERT INTO public.read_model_sales_daily(
  organization_id,sale_date,region_id,team_id,seller_user_id,
  units,revenue,reversed_units,reversed_revenue,transaction_count,reversed_transaction_count,updated_at
)
SELECT
  organization_id,sale_date,region_id,team_id,seller_user_id,
  sum(completed_units),
  coalesce(sum(total_amount) FILTER (WHERE status='COMPLETED'),0),
  sum(reversed_units),
  coalesce(sum(total_amount) FILTER (WHERE status='REVERSED'),0),
  count(*) FILTER (WHERE status='COMPLETED'),
  count(*) FILTER (WHERE status='REVERSED'),
  now()
FROM sale_level
GROUP BY organization_id,sale_date,region_id,team_id,seller_user_id;

create index if not exists read_model_sales_daily_org_date_idx
  on public.read_model_sales_daily(organization_id,sale_date desc);

create table if not exists public.read_model_product_daily (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_date date not null,
  region_id uuid not null references public.regions(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  seller_user_id uuid not null references public.profiles(user_id) on delete restrict,
  product_variant_id uuid not null references public.product_variants(id) on delete restrict,
  units bigint not null default 0,
  revenue numeric(14,2) not null default 0,
  reversed_units bigint not null default 0,
  reversed_revenue numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id,sale_date,region_id,team_id,seller_user_id,product_variant_id)
);

create index if not exists read_model_product_daily_variant_idx
  on public.read_model_product_daily(product_variant_id,sale_date desc);
create index if not exists read_model_product_daily_region_idx
  on public.read_model_product_daily(region_id,sale_date desc);
create index if not exists read_model_product_daily_team_idx
  on public.read_model_product_daily(team_id,sale_date desc);
create index if not exists read_model_product_daily_seller_idx
  on public.read_model_product_daily(seller_user_id,sale_date desc);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.sales
    WHERE status IN ('COMPLETED','REVERSED')
      AND (region_id IS NULL OR team_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Phase 7 product/commission projections require completed/reversed sales to have region_id and team_id.';
  END IF;
END $$;

alter table public.read_model_product_daily enable row level security;
revoke all on public.read_model_product_daily from anon;
grant select on public.read_model_product_daily to authenticated;
drop policy if exists read_model_product_daily_read_scope on public.read_model_product_daily;
create policy read_model_product_daily_read_scope on public.read_model_product_daily
  for select to authenticated using (
    (select private.user_has_role('CEO'))
    or (region_id is not null and (select private.user_can_access_region(region_id)))
    or (team_id is not null and (select private.user_can_access_team(team_id)))
    or seller_user_id=(select auth.uid())
  );

insert into public.read_model_product_daily(
  organization_id,sale_date,region_id,team_id,seller_user_id,product_variant_id,
  units,revenue,reversed_units,reversed_revenue,updated_at
)
select
  s.organization_id,
  coalesce(s.completed_at,s.created_at)::date,
  s.region_id,
  s.team_id,
  s.seller_user_id,
  si.product_variant_id,
  count(*) filter(where s.status='COMPLETED' and si.is_active=true),
  coalesce(sum(si.line_total) filter(where s.status='COMPLETED' and si.is_active=true),0),
  count(*) filter(where s.status='REVERSED'),
  coalesce(sum(si.line_total) filter(where s.status='REVERSED'),0),
  now()
from public.sales s
join public.sale_items si on si.sale_id=s.id
where s.status in ('COMPLETED','REVERSED')
group by s.organization_id,coalesce(s.completed_at,s.created_at)::date,s.region_id,s.team_id,s.seller_user_id,si.product_variant_id;

create table if not exists public.read_model_commission_daily (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_date date not null,
  region_id uuid not null references public.regions(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  beneficiary_user_id uuid not null references public.profiles(user_id) on delete restrict,
  beneficiary_role text not null default 'UNKNOWN',
  gross_amount numeric(14,2) not null default 0,
  adjustment_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id,sale_date,region_id,team_id,beneficiary_user_id,beneficiary_role)
);

create index if not exists read_model_commission_daily_user_idx
  on public.read_model_commission_daily(beneficiary_user_id,sale_date desc);
create index if not exists read_model_commission_daily_region_idx
  on public.read_model_commission_daily(region_id,sale_date desc);
create index if not exists read_model_commission_daily_team_idx
  on public.read_model_commission_daily(team_id,sale_date desc);

alter table public.read_model_commission_daily enable row level security;
revoke all on public.read_model_commission_daily from anon;
grant select on public.read_model_commission_daily to authenticated;
drop policy if exists read_model_commission_daily_read_scope on public.read_model_commission_daily;
create policy read_model_commission_daily_read_scope on public.read_model_commission_daily
  for select to authenticated using (
    (select private.user_has_role('CEO'))
    or beneficiary_user_id=(select auth.uid())
    or (region_id is not null and (select private.user_can_access_region(region_id)))
    or (team_id is not null and (select private.user_can_access_team(team_id)))
  );

insert into public.read_model_commission_daily(
  organization_id,sale_date,region_id,team_id,beneficiary_user_id,beneficiary_role,
  gross_amount,adjustment_amount,net_amount,updated_at
)
select
  s.organization_id,
  coalesce(s.completed_at,s.created_at)::date,
  s.region_id,
  s.team_id,
  c.beneficiary_user_id,
  coalesce(c.beneficiary_role::text,'UNKNOWN'),
  sum(c.amount),
  coalesce(sum(adj.adjustment_amount),0),
  sum(c.amount)-coalesce(sum(adj.adjustment_amount),0),
  now()
from public.commissions c
join public.sales s on s.id=c.sale_id
left join lateral (
  select sum(a.amount) as adjustment_amount from public.commission_adjustments a where a.commission_id=c.id
) adj on true
where c.status='ACTIVE'
group by s.organization_id,coalesce(s.completed_at,s.created_at)::date,s.region_id,s.team_id,c.beneficiary_user_id,coalesce(c.beneficiary_role::text,'UNKNOWN');

create or replace view public.read_model_reporting_freshness as
select
  (select max(updated_at) from public.read_model_sales_daily) as sales_daily_updated_at,
  (select max(updated_at) from public.read_model_product_daily) as product_daily_updated_at,
  (select max(updated_at) from public.read_model_commission_daily) as commission_daily_updated_at,
  (select max(sequence_number) from public.realtime_events) as latest_realtime_sequence;

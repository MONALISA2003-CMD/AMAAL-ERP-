-- Non-sensitive bootstrap for the single-company Amaal ERP.
-- No employee/customer/business transaction data is created here.

insert into public.organizations (name)
values ('Amaal')
on conflict (name) do nothing;

insert into public.company_settings (organization_id)
select id
from public.organizations
where name = 'Amaal'
on conflict (organization_id) do nothing;

insert into public.warehouses (organization_id, warehouse_code, warehouse_name, warehouse_type)
select id, 'MASTER-01', 'Master Warehouse', 'MASTER'
from public.organizations
where name = 'Amaal'
on conflict (organization_id, warehouse_code) do nothing;

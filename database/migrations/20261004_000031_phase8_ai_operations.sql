-- Amaal Stage 8 — Governed AI Operations
-- Additive only. AI never becomes transactional truth and never receives raw SQL access.

alter type public.approval_type add value if not exists 'AI_ACTION';

insert into public.permissions(key,description) values
  ('ai.use','Use Amaal AI read-only intelligence and governed assistance'),
  ('ai.execute','Prepare governed Amaal AI operational actions for review'),
  ('ai.approve','Privileged AI workflow control; never exposed as a model tool'),
  ('ai.knowledge.view','Retrieve approved internal Amaal knowledge within current authorization scope')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role,permission_key)
select r.key,p.key
from public.roles r
join public.permissions p on p.key in ('ai.use','ai.execute')
where r.key in ('CEO','ADMIN','REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER')
on conflict do nothing;

insert into public.role_permissions(role,permission_key)
select r.key,p.key
from public.roles r
join public.permissions p on p.key in ('ai.approve')
where r.key in ('CEO','ADMIN')
on conflict do nothing;

insert into public.role_permissions(role,permission_key)
select r.key,p.key
from public.roles r
join public.permissions p on p.key in ('ai.knowledge.view')
where r.key in ('CEO','ADMIN','REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER')
on conflict do nothing;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  title text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED','CLOSED')),
  provider text,
  model text,
  autonomy_level integer not null default 1 check (autonomy_level between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations(user_id,updated_at desc);
create index if not exists ai_conversations_org_idx on public.ai_conversations(organization_id,updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('USER','ASSISTANT','TOOL','SYSTEM')),
  content text,
  structured_payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conversation_idx on public.ai_messages(conversation_id,created_at);

create table if not exists public.ai_tool_invocations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  requesting_user_id uuid not null references public.profiles(user_id) on delete restrict,
  agent text not null,
  model text,
  tool_name text not null,
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  autonomy_level integer not null check (autonomy_level between 0 and 5),
  arguments_hash text,
  authorization_result text not null,
  result_classification text,
  action_state text,
  approval_id uuid references public.approval_requests(id) on delete set null,
  duration_ms integer,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists ai_tool_invocations_user_idx on public.ai_tool_invocations(requesting_user_id,created_at desc);
create index if not exists ai_tool_invocations_conversation_idx on public.ai_tool_invocations(conversation_id,created_at desc);
create index if not exists ai_tool_invocations_tool_idx on public.ai_tool_invocations(tool_name,created_at desc);

create table if not exists public.ai_action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  tool_name text not null,
  risk_level text not null check (risk_level in ('HIGH','CRITICAL')),
  autonomy_level integer not null check (autonomy_level between 0 and 5),
  summary text not null,
  arguments jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','EXECUTED','EXPIRED','CANCELLED')),
  approval_id uuid references public.approval_requests(id) on delete set null,
  executed_target_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_action_plans_creator_idx on public.ai_action_plans(created_by,status,updated_at desc);
create index if not exists ai_action_plans_approval_idx on public.ai_action_plans(approval_id) where approval_id is not null;

create table if not exists public.ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_key text not null,
  title text not null,
  source_type text not null,
  source_uri text,
  classification text not null default 'INTERNAL', check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  content text not null,
  required_permissions text[] not null default '{}'::text[],
  allowed_roles text[] not null default '{}'::text[],
  allowed_region_ids uuid[] not null default '{}'::uuid[],
  allowed_team_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,document_key,version)
);
create index if not exists ai_knowledge_documents_org_idx on public.ai_knowledge_documents(organization_id,status,updated_at desc);
create index if not exists ai_knowledge_documents_permissions_idx on public.ai_knowledge_documents using gin(required_permissions);
create index if not exists ai_knowledge_documents_roles_idx on public.ai_knowledge_documents using gin(allowed_roles);
create index if not exists ai_knowledge_documents_regions_idx on public.ai_knowledge_documents using gin(allowed_region_ids);
create index if not exists ai_knowledge_documents_teams_idx on public.ai_knowledge_documents using gin(allowed_team_ids);
create index if not exists ai_knowledge_documents_fts_idx on public.ai_knowledge_documents using gin(to_tsvector('simple', title || ' ' || content));

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_tool_invocations enable row level security;
alter table public.ai_action_plans enable row level security;
alter table public.ai_knowledge_documents enable row level security;

create policy ai_conversation_owner_read on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()) or (select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')));
create policy ai_message_owner_read on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id=conversation_id and (c.user_id=(select auth.uid()) or (select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')))));
create policy ai_tool_invocation_owner_read on public.ai_tool_invocations for select to authenticated
  using (requesting_user_id = (select auth.uid()) or (select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')));
create policy ai_action_plan_owner_read on public.ai_action_plans for select to authenticated
  using (created_by = (select auth.uid()) or (select private.user_has_role('CEO')) or (select private.user_has_role('ADMIN')));
create policy ai_knowledge_document_authorized_read on public.ai_knowledge_documents for select to authenticated
  using (
    status='ACTIVE'
    and (select private.user_has_permission('ai.knowledge.view'))
    and (
      cardinality(required_permissions)=0
      or required_permissions <@ (
        select coalesce(array_agg(distinct rp.permission_key),'{}'::text[])
        from public.role_assignments ra
        join public.role_permissions rp on rp.role=ra.role
        where ra.user_id=(select auth.uid()) and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now())
      )
    )
    and (
      cardinality(allowed_roles)=0
      or exists (
        select 1 from public.role_assignments ra
        where ra.user_id=(select auth.uid()) and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now()) and ra.role = any(allowed_roles)
      )
    )
    and (
      cardinality(allowed_region_ids)=0
      or exists (
        select 1 from unnest(allowed_region_ids) as rid(region_id)
        where (select private.user_can_access_region(rid.region_id))
      )
    )
    and (
      cardinality(allowed_team_ids)=0
      or exists (
        select 1 from unnest(allowed_team_ids) as tid(team_id)
        where (select private.user_can_access_team(tid.team_id))
      )
    )
  );

comment on table public.ai_conversations is 'Governed Amaal AI conversation state; business truth stays in ERP tables.';
comment on table public.ai_tool_invocations is 'Minimal, auditable record of every Amaal AI tool invocation.';
comment on table public.ai_action_plans is 'Human-reviewable AI operational drafts; no ERP mutation occurs until a domain service executes an approved plan.';
comment on table public.ai_knowledge_documents is 'Permission-aware internal knowledge registry for Amaal AI retrieval.';

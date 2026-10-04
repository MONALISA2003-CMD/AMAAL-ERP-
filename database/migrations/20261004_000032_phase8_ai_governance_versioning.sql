-- Amaal Stage 8.2 — governance versioning + action-plan expiry.
-- Additive only. No business truth is deleted or rewritten.

alter table public.ai_conversations
  add column if not exists governance_version text not null default '8.2';

alter table public.ai_tool_invocations
  add column if not exists governance_version text not null default '8.2';

alter table public.ai_action_plans
  add column if not exists governance_version text not null default '8.2',
  add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');

create index if not exists ai_action_plans_expiry_idx
  on public.ai_action_plans(status,expires_at);

comment on column public.ai_conversations.governance_version is 'Version of the Amaal AI governance contract used for the conversation.';
comment on column public.ai_tool_invocations.governance_version is 'Version of the Amaal AI governance/tool contract used for this invocation.';
comment on column public.ai_action_plans.governance_version is 'Governance version under which this action plan was prepared.';
comment on column public.ai_action_plans.expires_at is 'Hard expiry for stale AI action drafts/approvals; execution after expiry is blocked.';

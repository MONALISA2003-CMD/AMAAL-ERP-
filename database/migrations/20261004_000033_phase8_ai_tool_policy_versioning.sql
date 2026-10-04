-- Amaal Stage 8.3 — tool-policy version pinning.
-- Additive only. No business truth is deleted or rewritten.

alter table public.ai_conversations
  add column if not exists tool_policy_version text not null default '2026-10-04.2';

alter table public.ai_tool_invocations
  add column if not exists tool_policy_version text not null default '2026-10-04.2';

alter table public.ai_action_plans
  add column if not exists tool_policy_version text not null default '2026-10-04.2';

comment on column public.ai_conversations.tool_policy_version is 'Tool contract version pinned when the conversation was created.';
comment on column public.ai_tool_invocations.tool_policy_version is 'Tool-policy version used for this invocation.';
comment on column public.ai_action_plans.tool_policy_version is 'Tool-policy version under which this action plan was prepared.';

-- Release evidence ledger for controlled phase gates.
create table if not exists public.release_gate_evidence (
  id uuid primary key default gen_random_uuid(),
  phase_key text not null,
  gate_key text not null,
  status text not null check (status in ('PASS','FAIL','DEFERRED')),
  evidence jsonb not null default '{}'::jsonb,
  verified_by uuid references public.profiles(user_id) on delete restrict,
  verified_at timestamptz not null default now(),
  unique (phase_key,gate_key)
);
create index if not exists release_gate_evidence_phase_idx on public.release_gate_evidence(phase_key,status);

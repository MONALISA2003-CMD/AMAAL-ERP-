-- Amaal Phase 2: CEO/Admin TOTP MFA metadata.
-- Identity remains owned by Neon Auth; this table stores only Amaal-specific MFA state.

create table if not exists public.mfa_factors (
  user_id uuid primary key references neon_auth."user"(id) on delete restrict,
  factor_type text not null default 'TOTP',
  status text not null default 'PENDING',
  secret_ciphertext text not null,
  secret_iv text not null,
  secret_tag text not null,
  confirmed_at timestamptz,
  last_verified_at timestamptz,
  last_used_step bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mfa_factors_factor_type_check check (factor_type = 'TOTP'),
  constraint mfa_factors_status_check check (status in ('PENDING', 'VERIFIED', 'DISABLED'))
);

create index if not exists mfa_factors_status_idx
  on public.mfa_factors(status);

alter table public.mfa_factors enable row level security;

-- The browser never writes this table directly. RLS is enabled and no permissive browser
-- policies are created; the API service remains authoritative.

# Amaal RLS Approval Gate

## Live security state

The core PostgreSQL schema is applied to the connected Supabase project, but Row Level Security is not yet enabled on the public tables.

Supabase's security advisor currently flags this as a **critical** issue because the public tables are exposed to the `anon` and `authenticated` roles without RLS.

## Why RLS is not auto-applied here

RLS must be enabled together with the intended policy set. Enabling it without policies would block application access; applying an incorrect policy set could grant or deny access incorrectly.

The policy file prepared in:

`database/policies/20260928_rls_foundation.sql`

is the candidate policy set for explicit approval.

## After approval

The intended sequence is:

1. Enable RLS and create the approved policies.
2. Re-run Supabase security advisors.
3. Run the negative authorization matrix.
4. Verify Agent / Shop Owner / Team Leader / Manager / Regional Manager scope boundaries.
5. Verify privileged CEO/Admin paths.
6. Verify that sensitive mutations remain domain-service controlled.

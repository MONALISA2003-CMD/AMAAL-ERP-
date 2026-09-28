# Database migrations

The repository tracks the live Supabase migration sequence.

1. `20260928_000001_core_foundation.sql`
2. `20260928_000002_harden_trigger_function.sql`
3. `20260928_000003_rls_foundation.sql`
4. `20260928_000004_grants_hardening.sql`
5. `20260928_000005_performance_hardening.sql`
6. `20260928_000006_seed_amaal_foundation.sql`

The connected project currently has the corresponding live migration history plus the non-sensitive Amaal bootstrap.

Do not edit production schema manually. Future changes belong in new migrations and should be verified with Supabase security/performance advisors before release.

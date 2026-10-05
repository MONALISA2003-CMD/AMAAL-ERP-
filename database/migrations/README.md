# Amaal ERP migrations

Migrations are ordered by timestamp and are intended to run once, in order.

Phase 0–2B: `20260928_*` through `20261002_*`

Phase 3: `20261003_000024`, `20261003_000025`

Phase 4: `20261004_000026`, `20261004_000027`, `20261004_000028`

The Phase 4 migrations are packaged as a release candidate. They are intentionally not applied to production during the build-only workflow.

Bootstrap compatibility repair: `20261005_000036_production_bootstrap_schema_repair.sql` is a narrow idempotent repair for the access-suspension table observed missing in production. The complete Phase 5 migration remains authoritative.

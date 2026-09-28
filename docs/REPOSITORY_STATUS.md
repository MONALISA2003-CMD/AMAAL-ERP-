# Repository Status

## Current state

- Greenfield Amaal ERP repository skeleton created.
- ZIP-to-GitHub synchronization workflow is operational.
- Workflow accepts any ZIP filename, extracts a complete project package, replaces the previous extracted project and removes the ZIP after successful extraction.
- The sync workflow itself is preserved and incoming ZIPs cannot replace it with additional GitHub workflow files.
- Phase 1 architecture, infrastructure mapping and repository blueprint checked against the approved Amaal specifications.
- Domain model, state machines, authorization matrix and event catalog created.
- PostgreSQL core foundation migration created.
- RLS/authorization foundation created.
- RLS negative-test checklist created.
- Connected Supabase project verified healthy and currently empty: no public tables and no migrations.
- No production database tables have been created or modified yet.
- No Render services or Valkey instances have been provisioned.
- No production secrets are stored in the repository.

## Current engineering gate

The architecture and database foundation are now ready for controlled first-migration testing. The next change should validate and apply the core schema and RLS in the empty Supabase project, then build the deterministic domain transaction functions/services before UI work.

## Repository source-of-truth order

1. Approved Amaal Markdown specifications.
2. `docs/AMAAL_DOMAIN_MODEL.md`.
3. `docs/AMAAL_STATE_MACHINES.md`.
4. `docs/AMAAL_AUTHORIZATION_MATRIX.md`.
5. `docs/AMAAL_EVENT_CATALOG.md`.
6. Database migrations and policies derived from those artifacts.
7. Application/UI implementation.

The prototype ZIP remains reference-only and does not constrain production architecture.

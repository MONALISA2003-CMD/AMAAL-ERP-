# Amaal ERP Repository Documentation Manifest

This manifest exists to make documentation loss visible during ZIP synchronization.

## Approved source specifications

Preserved under `docs/source-specifications/`:

- `AMAAL_MASTER_SYSTEM_SPECIFICATION-1.md`
- `AMAAL_DATABASE_AND_AUTHORIZATION_BLUEPRINT-1.md`
- `AMAAL_LLM_HANDOFF_MASTER.md`

These files are preserved as source contracts and should not be silently rewritten.

## Current engineering documentation

- `AMAAL_DOMAIN_FOUNDATION.md`
- `AMAAL_DOMAIN_MODEL.md`
- `AMAAL_STATE_MACHINES.md`
- `AMAAL_AUTHORIZATION_MATRIX.md`
- `AMAAL_EVENT_CATALOG.md`
- `AMAAL_DATABASE_SCHEMA.md`
- `AMAAL_RLS_AND_AUTHORIZATION.md`
- `AMAAL_DATABASE_IMPLEMENTATION_STATUS.md`
- `AMAAL_INFRASTRUCTURE_MAPPING.md`
- `AMAAL_PHASE1_ARCHITECTURE.md`
- `AMAAL_REPOSITORY_BLUEPRINT.md`
- `AMAAL_DOCUMENTATION_PRESERVATION.md`
- `REPOSITORY_STATUS.md`

## Rule

Do not remove or replace documentation merely because it is absent from an incoming ZIP. The synchronization workflow preserves missing documentation until the final documentation cleanup/release stage.

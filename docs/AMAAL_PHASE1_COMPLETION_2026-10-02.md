# Amaal Phase 1 — Deep Completion Record

Date: 2 October 2026

## Scope completed

Phase 1 is the Amaal first-run organization foundation. The implementation now enforces the foundation at both browser and server boundaries.

### Required organization foundation

- Single Amaal organization root.
- One active Master Warehouse, preserved rather than duplicated.
- Four main operating regions: NORTH, WEST, CENTRAL, EAST.
- Four standard regional warehouses:
  - NUWH → NORTH
  - WUWH → WEST
  - CUWH → CENTRAL
  - EUWH → EAST
- Pending CEO definition: display name, work email, optional employee number.
- Policy-readiness markers for pricing, commission, bonus, aging, recovery and approvals, without inventing policy values.

### Transactional safety

The final setup mutation is one PostgreSQL transaction and uses a PostgreSQL advisory lock. A second setup attempt after `ORGANIZATION_READY` or `ACTIVATED` is rejected.

Completion writes:

- immutable audit record
- transactional outbox event

### Readiness visibility

`GET /v1/setup/status` exposes explicit readiness checks for:

- organization
- Master Warehouse
- main regions
- regional warehouses
- pending CEO
- policy-readiness markers
- setup lock state

### Frontend

The `/setup` experience now defaults to the four main regions and four standard regional warehouses, provides review/readiness information, and retains the Amaal logo as the UI authority.

### Live production reconciliation

The production organization had already reached `ACTIVATED`, so Phase 1 was reconciled without resetting identity or reopening setup. The live Neon organization now contains all four main regions and all four standard regional warehouses, with the existing Central regional warehouse aligned to `CUWH`.

The reconciliation wrote:

- `AMAAL_PHASE1_FOUNDATION_RECONCILED` audit event
- `ORGANIZATION_FOUNDATION_RECONCILED` outbox event
- Phase 1 foundation IDs/readiness metadata in `company_settings.settings.setup.foundation`

## Exit condition

Phase 1 source validation passes 12 checks, and the dedicated setup unit tests pass 6/6.

Repository, Phase 0 and Phase 2B structural validators also pass.

A full workspace test run still has three pre-existing clean-extraction failures caused by missing installed workspace package links (`@amaal/auth` / `@amaal/business-rules`); those are dependency-install/test-environment issues rather than Phase 1 assertion failures.

A production source deployment of the enhanced Phase 1 package remains gated by the GitHub MFA authorization issue. The live database foundation reconciliation is already applied, and the Phase 0–2B release evidence now records this deployment gate explicitly.

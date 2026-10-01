# Amaal Architecture Decisions — Phase 0

## AD-0001 — One transactional source of truth

**Decision:** Neon PostgreSQL is the sole authoritative transactional database.

**Reason:** The active repository and production migration state already use Neon as the authoritative business database. Keeping a second transactional database would violate the single-source-of-truth principle.

## AD-0002 — Supabase becomes transitional, not architectural

**Decision:** Supabase PostgreSQL is historical. Supabase Auth is transitional only and must be removed during the identity migration phase.

**Reason:** The desired end state is Neon-centered and the former Supabase project currently contains no users or stored objects requiring bulk migration.

## AD-0003 — Render owns the application boundary

**Decision:** Vercel serves the user interface. Render owns API, domain services, auth boundary, workers and asynchronous processing.

**Reason:** Sensitive business authorization and transaction logic must not live in the browser.

## AD-0004 — The ERP is user-facing; infrastructure is not

**Decision:** Production UI copy describes business tasks and outcomes, not deployment architecture or engineering implementation.

**Reason:** Amaal is a finished internal ERP, not a developer console.

## AD-0005 — Setup is a first-run business workflow

**Decision:** `/setup` is a real Amaal bootstrap/configuration experience, not a redirect to login and not a generic multi-tenant SaaS registration flow.

**Reason:** Amaal is a single-company closed system and the original specification requires controlled organization and policy initialization.

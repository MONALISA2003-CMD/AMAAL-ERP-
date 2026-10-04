# Amaal ERP — Current Engineering Status (2026-10-02)

## Current source-of-truth order

1. Live Neon/PostgreSQL production state and applied migrations.
2. Current Phase 0–2B repository package and versioned migrations.
3. Current Amaal release-gate evidence in `public.release_gate_evidence`.
4. Current implementation documents.
5. Historical handoffs, snapshots and archived source specifications.

Historical documents are preserved. Where a historical document names Supabase Auth or Jarvis as the current provider/assistant, this document takes precedence for the active implementation.

## Active technology boundary

```text
Vercel / Next.js
        ↓
Render / Node.js API + workers
        ↓
Neon PostgreSQL + Neon Auth / Better Auth
        ↓
Postgres transactional outbox
        ↓
Render worker
        ↓
Valkey / Redis for transient coordination
```

**Amaal AI** is the active product name for the AI operations layer. Historical references to “Jarvis” are retained only for archival/source-history continuity.

## Phase closure state

### Phase 0 — Foundation & Architecture Freeze

Implemented: provider boundaries, transactional source-of-truth rules, outbox/event boundary, realtime boundary, security boundary, current CI gate.

Remaining release gate: exact source synchronization to GitHub `main` is blocked by the GitHub MFA authorization issue.

### Phase 1 — Amaal Setup

Implemented and live:

- one-company foundation;
- Master Warehouse;
- four main regions: NORTH, WEST, CENTRAL, EAST;
- standard regional warehouses: NUWH, WUWH, CUWH, EUWH;
- CEO bootstrap definition;
- setup locking/idempotency;
- setup audit/outbox events;
- CEO activation transition;
- default aging/suspension policy recording.

### Phase 2A — Neon Auth

Implemented and E2E verified:

```text
Neon Auth
→ session
→ Neon JWT
→ Render verification
→ Amaal /v1/me
```

Issuer, audience, expiry and banned-account checks are enforced server-side.

Development MFA remains disabled.

### Phase 2B — Identity & Organization Control Plane

Implemented in source and schema:

- sub-regions;
- explicit Regional Manager → Manager relationship;
- region-scoped Recovery Officer;
- explicit Admin permission profiles;
- controlled recruitment invitations;
- transactional invitation acceptance;
- Amaal Auth identity → Amaal organizational identity binding;
- access-pending state for authenticated identities without Amaal role scope;
- stronger team/shop/sub-region authorization;
- organization directory and recruitment/operator UI.

## Important deferred items before Phase 3

- GitHub MFA authorization and exact-source deployment synchronization.
- Full CI run after dependency installation on the repository's main branch.
- CEO/Admin TOTP schema and logic are prepared; enrollment/verification is not yet completed and enforcement remains intentionally disabled during development.
- Provider-level Neon Auth public sign-up disablement remains deferred until invitation onboarding is the controlled account-creation path.
- Production source deployment is still gated by GitHub MFA; a disposable Neon release-test branch has already validated cross-region, cross-team, Recovery Officer, Manager→RM and Admin-profile authorization behavior.

Phase 3 must not begin until these release-gate items are explicitly reconciled.


## 2026-10-03 Phase 3 status
Phase 3 is active. Production Neon migrations 024 and 025 are applied. Phase 3 includes IMEI custody hardening, allocation lifecycle, physical-vs-system reconciliation, audited catalog edit/archive lifecycle, and immutable IMEI movement trace. The login authority boundary is exact: CEO creates Admins; Admins create Regional Managers, Managers, Team Leaders, Agents and Shop Owners; Recovery Officers are not directly recruited by Admins.

---

## Current continuation — Phase 4 started (2026-10-04)

Phase 4 Sales + Finance source implementation is now the active development checkpoint. The Phase 4 release candidate includes customer ownership, cash/loan sales, receipts, payments, loan providers, CEO-controlled commercial policies, commission/bonus ledgers, financial correction controls, and deeper immutability/correction-chain hardening.

The user elected to **build now and deploy/debug later**. Accordingly, the Phase 4 migrations are packaged but have not been applied to production, and Vercel/Render deployment is deferred.


## Phase 5 update — 2026-10-04

Phase 5 aging, recovery and suspension source is now implemented as a deployment-later release candidate. It includes CEO-controlled aging policy versions, automated aging evaluation, immutable aging transitions, recovery automation, Recovery Officer load balancing, due-date escalation, durable suspension records, CEO/Admin reinstatement, recovery governance APIs and the Recovery workspace. Production Vercel/Render deployment remains intentionally deferred.

The organizational login authority remains unchanged: CEO creates/invites Admins only; Admins create/invite Regional Managers, Managers, Team Leaders, Agents and Shop Owners; Regional Managers may create/invite Managers and Recovery Officers inside their regions; Managers create/invite Team Leaders inside their teams; Team Leaders create/invite Agents and Shop Owners inside their teams.

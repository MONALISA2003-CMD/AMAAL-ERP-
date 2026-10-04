# Amaal ERP — Phase 5 Deep Hardening — 2026-10-04

## Completed

- Exact Amaal aging bands and configurable suspension thresholds.
- Versioned CEO-controlled aging policies.
- Effective-window overlap protection.
- Current IMEI aging read model and immutable transition events.
- Warning/overdue/critical alert model.
- Automated recovery case creation.
- Region-matched Recovery Officer load balancing.
- Recovery assignment history with one active assignment per case.
- Automatic escalation when no Recovery Officer exists.
- Due-date escalation to the Regional Manager.
- Verified IMEI recovery and warehouse acceptance.
- Recovery alert resolution after verified recovery.
- Durable business-access suspension ledger.
- CEO/Admin-only reinstatement with mandatory reason.
- API resource-scope protection for individual recovery case retrieval/reassignment.
- CEO-only aging policy creation.
- Recovery governance UI for policy history and active suspensions.
- CI validator/test registration.

## Security invariants

- CEO may create/invite Admins only.
- Admins may recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners.
- Admins cannot recruit Recovery Officers directly.
- Regional Managers can recruit Managers and Recovery Officers inside their regions.
- Managers can recruit Team Leaders inside their teams.
- Team Leaders can recruit Agents and Shop Owners inside their teams.

## Deployment posture

Phase 5 source is deployment-later in this package. Production Vercel/Render deployment is intentionally not performed by this phase build step.

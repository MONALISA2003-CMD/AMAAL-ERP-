# Amaal Phase 0 — Completion Record

**Date:** 2 October 2026  
**Source package:** `AMAAL_ERP_COMPLETE_PROJECT_2026-10-01_V3.zip`

## Completed

- Neon PostgreSQL confirmed as the sole authoritative transactional source.
- Neon Auth / Better Auth confirmed on the production branch.
- Vercel confirmed as the frontend boundary.
- Render confirmed as API/worker boundary.
- Render `amaal-valkey` confirmed available in Frankfurt as the transient Redis-compatible layer.
- PostgreSQL transactional outbox/read-model/realtime foundation confirmed present.
- Active AI implementation terminology changed from the former assistant name to **Amaal AI**.
- Active AI package renamed to `apps/amaal-ai` / `@amaal/ai`.
- Phase roadmap rewritten around the frozen Neon + Render + Valkey + Vercel architecture.
- Phase 0 validation added to the repository and ZIP-sync workflow.
- No production data was changed by the Phase 0 implementation work.

## Live baseline verification

- Neon project: `icy-lake-57952361`
- Neon production branch: `br-restless-king-b1zq6rf0`
- PostgreSQL: 18
- Neon Auth: Better Auth
- Vercel production: `https://amaal-erp.vercel.app`
- Render API: `https://amaal-api.onrender.com`
- Render worker: `amaal-worker`
- Render Valkey: `amaal-valkey`

The current production data baseline is intentionally close to empty: no Amaal profiles, roles, products, IMEI units, customers or sales exist yet. One region and two warehouses (one master and one regional) are present, and one audit/outbox/realtime record exists from setup/verification activity.

## Open gate

GitHub source synchronization is **not claimed complete** because the connected GitHub authorization requires MFA and did not complete in this session. The modified Phase 0 source package is therefore prepared locally but has not been represented as a successful `main`-branch push here.

The next required gate remains the current Phase 2 authentication verification: login → Neon session → JWT → Render `/v1/me`.

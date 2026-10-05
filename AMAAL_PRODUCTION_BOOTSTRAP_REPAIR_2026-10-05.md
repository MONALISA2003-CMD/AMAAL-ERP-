# Amaal Production Bootstrap Repair — 2026-10-05

Baseline: GitHub `main` commit `48f56292ae0953b8db4945fde82ca28d6fb7ee5a`.

## Confirmed production failure

The live dashboard shell rendered, but authenticated bootstrap failed because the production API queried `public.business_access_suspensions` and the table was absent from the live Neon schema. That caused `/v1/me` to return HTTP 500, leaving dashboard information stuck on loading/Not available.

## Implemented repair

- Added a protected `/v1/bootstrap` response so the dashboard loads identity, authorization, security state, workspace information and navigation as one business-facing contract.
- Added a CEO authorization fast path so company-wide CEO access does not depend on regional/team/shop joins.
- Added an idempotent Phase 5 runtime schema reconciliation guard with advisory-lock protection. It repairs the missing aging/recovery/suspension tables before authenticated business requests are evaluated.
- Kept a narrow compatibility migration for the missing access-suspension table.
- Corrected the Phase 5 CEO permission seed to valid PostgreSQL syntax.
- Protected the workspace summary with the same access and MFA checks as the rest of the authenticated application.
- Replaced the dashboard's hard-coded nine-link navigation and seven-module truncation with a complete permission-filtered module registry, including Planning Insights.
- Added a short token retry for the browser session bootstrap to reduce transient “secure session required” states.
- Added deterministic regression tests for the CEO path, module completeness and schema repair.

## Validation

- Repository validation: PASS
- Phase 0–2B: PASS
- Phase 3: PASS (31 checks)
- Phase 4: PASS
- Phase 5: PASS
- Stage 6: PASS
- Stage 7: PASS
- Stage 8: PASS (43 checks)
- Stage 9: PASS
- Release hardening: PASS
- Deployment architecture: PASS
- Repair validation: PASS
- TypeScript/TSX syntax: PASS (97 files)
- Web declarations/imports: PASS
- User-facing language checks: PASS
- Full deterministic master test gate: PASS (75 tests + Python 13/13 + Stage 8 evaluation 18/18)
- Whole-project audit: 0 hard failures; 10 documented future Phase-4 schema references remain expected until migrations 000026+ are live.

## Deployment boundary

The connected GitHub integration still rejects repository writes with HTTP 403, so this package has been built locally and cannot be pushed to `main` from this session. Upload the ZIP as the complete repository package using the existing repository upload process. Vercel and Render can then build/deploy the same commit.

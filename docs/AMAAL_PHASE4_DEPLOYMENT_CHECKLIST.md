# Amaal ERP — Phase 4 Deployment Checklist

When the user elects to deploy Phase 4:

1. Synchronize this source package exactly to GitHub `main`.
2. Install the workspace with the repository package-manager lock/version.
3. Run repository, Phase 0–2B, Phase 3 and Phase 4 validators.
4. Run the full workspace typecheck/test/build.
5. Apply migrations `20261004_000026`, `000027`, and `000028` to a disposable Neon branch first.
6. Verify cash and loan sale transactions, payment correction, receipt issuance, commission snapshot, bonus qualification and sale reversal on the branch.
7. Apply the tested migration sequence to the production Neon branch.
8. Deploy Render API/worker.
9. Deploy Vercel frontend.
10. Verify `/health`, `/ready`, `/api/auth/get-session`, `/login`, `/customers`, `/sales`, `/finance`.
11. Run end-to-end authenticated sale and financial correction tests.
12. Only then mark Phase 4 production-ready.

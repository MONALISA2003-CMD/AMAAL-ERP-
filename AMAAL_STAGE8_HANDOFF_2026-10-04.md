# Amaal Stage 8 Handoff — 2026-10-04

## Delivery

Stage 8 — Amaal AI / Governed AI Operations is implemented locally on top of Stage 7.

No GitHub push and no production deployment were performed. This preserves the project rule that production launch occurs only after Stage 10 hardening.

## Implemented

```text
Amaal AI
├── deterministic intent router
├── governed tool registry
├── permission-filtered model tool exposure
├── scoped server-side tool gateway
├── internal knowledge retrieval with RLS scope
├── conversation persistence + bounded history
├── OpenAI Responses orchestration
├── tool-call loop with six-round cap
├── bounded provider/tool payloads
├── AI tool invocation audit
├── action plans
├── normal Amaal AI_ACTION approvals
├── approved recovery execution through RecoveryService
├── governance/tool-policy version pinning
├── 24-hour high-risk action-plan expiry
├── deterministic output guardrails
├── rejected-call governance audit events
└── model-independent Evaluation Center + red-team tests
```

## Key safety decisions

1. The ERP remains the source of truth.
2. AI receives no raw SQL or unrestricted database handle.
3. The router does not expose write/prepare tools for ordinary read questions.
4. Critical/privileged requests are read-only/recommendation-only in Stage 8.
5. High-risk actions become human-reviewable plans.
6. AI cannot approve its own plan.
7. Execution uses the normal Amaal domain service.
8. Current authorization is reloaded on every request.
9. Conversation history never grants permission.
10. Knowledge documents are filtered by organization, permission, role, region and team.

## Validation completed

- Stage 8 policy tests: PASS — 10/10
- Stage 8 red-team tests: PASS — 5/5
- Stage 8 output-guardrail tests: PASS — 4/4
- Stage 8 Evaluation Center: PASS — 18/18
- Stage 8 repository validator: PASS — 43 checks
- Earlier Stage 3–7 validators remain part of the full repository validation chain.

## Environment additions

```text
AMAAL_AI_ENABLED=false
AMAAL_AI_MODEL=
AMAAL_AI_PROVIDER_TIMEOUT_MS=20000
OPENAI_API_KEY=
```

The live model is not selected implicitly.

## Database migration

`database/migrations/20261004_000031_phase8_ai_operations.sql`
`database/migrations/20261004_000032_phase8_ai_governance_versioning.sql`
`database/migrations/20261004_000033_phase8_ai_tool_policy_versioning.sql`

Adds AI conversation/audit/action-plan/knowledge tables, AI permissions and the additive `AI_ACTION` approval type.

No production migration was applied during Stage 8 implementation.

## Research basis

OWASP's current LLM guidance emphasizes excessive functionality, permissions and autonomy as agentic risks and recommends downstream authorization, tool minimization and logging. NIST's Generative AI Profile highlights confabulation risk in consequential contexts. OpenAI's current API reference documents structured function calls and function-call outputs for Responses orchestration. These principles are reflected in the Stage 8 architecture. 

See:

- `docs/AMAAL_PHASE8_IMPLEMENTATION.md`
- `docs/AMAAL_AI_GOVERNANCE.md`
- `docs/AMAAL_AI_TOOL_CONTRACT.md`

## Remaining Stage 10 gates

The package is not being declared production-ready. The remaining gate includes the full Node 24 dependency install/build/typecheck suite, provider integration tests, end-to-end authorization negatives, rate limiting, AI red-team testing, observability, backup/restore, load/concurrency testing, disaster recovery, MFA and final launch review.

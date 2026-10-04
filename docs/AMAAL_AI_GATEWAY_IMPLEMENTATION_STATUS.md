# Amaal AI Gateway Implementation Status

## Implemented

The Amaal AI package now contains a real server-side tool gateway over the approved tool contract.

Each invocation:

```text
authenticated actor
↓
load current authorization context
↓
require ai.use
↓
apply tool-specific scope rules
↓
query only authorized business records
```

Action/prepare tools additionally require the appropriate AI execution/approval permissions and remain preparation-only in this phase; they do not receive unrestricted write or SQL capabilities.

## Implemented read-tool scope behavior

- `get_my_stock`: actor-owned stock
- `get_team_stock`: caller team scope
- `get_region_stock`: caller regional scope
- `find_imei`: scope checked before returning the IMEI, with unauthorized existence hidden
- `get_imei_history`: current custody scope with sold-asset fallback through authorized sale visibility
- `get_sales`: CEO/Admin company scope, RM regional, Manager/TL team, field seller own, Recovery Officer case-linked
- `get_commission`: actor/team/region/company scope according to current role
- `get_aging`: same scope discipline as inventory visibility
- `get_recovery_queue`: company, region, team, assigned-officer or holder scope as applicable
- `get_customer`: customer ownership/scope authorization before details are returned
- `compare_performance`: authorized sales population only
- `generate_report`: each report queries through the same scope boundary rather than returning company-wide data by default

## Explicit prohibition

Amaal AI does not expose:

- raw SQL
- unrestricted database handles
- service-role credentials
- arbitrary authorization scopes supplied by the model
- direct bypasses around approval or business services

## Stage 8 orchestration status

The LLM orchestration gate is now implemented locally. The runtime uses a deterministic router, only exposes tools authorized for the current request and user, persists bounded conversation history, calls the provider through the server, executes functions through the scoped gateway, records invocation audit data, and converts high-risk calls into approval-backed action plans.

The supported provider integration is intentionally disabled by default. Core ERP operations remain independent of Amaal AI availability. The control plane now includes deterministic output guardrails, governance/tool-policy version pinning, 24-hour action-plan expiry and rejected-call audit events. The deterministic Stage 8 Evaluation Center and red-team suite are part of the local gate. Production provider testing, negative E2E authorization tests, rate limiting, observability and launch hardening remain Stage 10 gates.

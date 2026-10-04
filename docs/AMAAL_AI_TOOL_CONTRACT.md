# Amaal AI Tool Contract

Status: Engineering contract — Stage 8 governed gateway/orchestration plus governance, output-guardrail and evaluation hardening implemented locally; production deployment deferred until Stage 10

## 1. Purpose

Amaal AI is an intelligence and orchestration layer over authorized Amaal truth. It is not a direct database administrator.

Required boundary:

```text
USER
↓
AUTHENTICATION
↓
AUTHORIZATION
↓
AMAAL AI
↓
LLM ORCHESTRATION
↓
AI ROUTER
↓
TOOL GATEWAY
↓
AUTHORIZATION AGAIN
↓
BUSINESS SERVICE
↓
DATABASE / EVENTS
```

## 2. Tool rules

Every tool call receives the authenticated user context from the server. The model cannot choose or override that identity.

Every tool must evaluate:

- user identity
- role
- organizational scope
- resource ownership
- requested action
- current record state
- approval requirements
- AI risk level

No tool accepts an arbitrary authorization scope from the model.

## 3. Risk levels

```text
LOW
read-only information

MEDIUM
analysis / recommendation

HIGH
operational action / task creation

CRITICAL
financial, security or destructive action
```

Critical actions require human approval.

## 4. Read tools

### `get_my_stock`

Returns inventory the caller is authorized to see as their own current stock.

Risk: LOW

### `get_team_stock`

Returns team inventory within the caller's team scope.

Risk: LOW

### `get_region_stock`

Returns regional inventory only for roles with regional scope.

Risk: LOW

### `find_imei`

Searches an IMEI using authorized scope.

Risk: LOW

### `get_imei_history`

Returns authorized custody and movement history for an IMEI.

Risk: LOW

### `get_sales`

Returns sales within the caller's permitted scope.

Risk: LOW

### `get_commission`

Returns authorized commission history and summaries.

Risk: LOW

### `get_aging`

Returns authorized aging inventory, including field age and current-holder age where permitted.

Risk: LOW

### `get_recovery_queue`

Returns recovery cases inside the caller's authorized scope.

Risk: LOW

### `get_customer`

Returns customer information only when the caller is authorized to view that customer.

Risk: LOW

### `compare_performance`

Compares users, teams or regions only when the caller is permitted to access the requested population.

Risk: MEDIUM

### `generate_report`

Generates a governed report from authorized data and approved read models.

Risk: MEDIUM

## 5. Action/prepare tools

### `create_task`

Creates an operational task through the task/business service.

Risk: HIGH

Execution must remain within the caller's authority.

### `create_recovery_case`

Prepares or creates a recovery case according to recovery policy and authorization.

Risk: HIGH

### `prepare_transfer_request`

Prepares an inventory transfer request. It does not silently move stock.

Risk: HIGH

### `prepare_adjustment_request`

Prepares an inventory adjustment request for the approval workflow.

Risk: HIGH

### `prepare_approval_request`

Prepares an approval request for a business action.

Risk: HIGH

## 6. Gateway implementation status

The server-side gateway is implemented for all specified read tools and governed action/prepare tools. Read queries apply explicit organization scope because the backend DB connection is privileged and therefore cannot rely on browser RLS alone.

Unauthorized IMEI existence is hidden, sold-device history falls back through authorized sale visibility, and reports are scoped before aggregation.

## 7. Approval boundary

Amaal AI may:

```text
observe
explain
recommend
prepare
```

It may execute only where explicit Amaal automation policy permits the action.

For critical financial/security/destructive actions:

```text
Amaal AI recommendation
↓
approval request
↓
human approval
↓
domain service
↓
transaction
```

## 8. Tool result rules

Tool responses must be structured and should distinguish:

- authoritative facts
- derived calculations
- ML predictions
- LLM explanations
- recommended actions

Amaal AI must not present a prediction or recommendation as if it were an authoritative transactional fact.

## 9. Audit

Every tool invocation should be auditable with:

```text
conversation_id
requesting_user_id
agent
model
tool
arguments classification
authorization result
result classification
action
approval_id if applicable
timestamp
```

Sensitive payloads should be minimized.

## 10. RAG boundary

RAG retrieval is permission-aware. A document is eligible only when both semantic relevance and current authorization permit access.

## 11. Memory boundary

Amaal AI memory may store conversation/task context, but remembered information never grants permission. Current authorization is always re-evaluated.

## 12. No raw SQL tool

There is deliberately no `run_sql()` or unrestricted database tool in the Amaal AI contract.

If a new tool needs data, the tool must be implemented as a narrowly scoped business capability with explicit authorization.

## 13. Governance versioning and expiry

Current runtime contract versions:

```text
Governance: 8.2
Tool policy: 2026-10-04.2
```

High-risk action plans expire after 24 hours and must pass expiry checks at submission, approval and execution.

## 14. Output guardrail

Final model narratives pass through a deterministic guard for protected secrets, raw SQL/database commands and explicit privilege-bypass language. Blocked output is replaced rather than partially redacted and is audit-visible without recording the protected value.

## 15. Evaluation Center

18 deterministic control-plane cases cover routing, prompt injection, authorization, critical-operation refusal, output leakage and schema/capability integrity. See `apps/amaal-ai/evals/stage8-eval-cases.json`.

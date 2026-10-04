# Amaal AI Governance Standard — Stage 8

## Scope

This document defines how Amaal AI is permitted to reason, retrieve information, prepare actions and interact with the ERP. It is an engineering governance artifact, not a prompt-only rule.

## 1. Authority hierarchy

```text
Neon transactional truth
        >
Amaal business-service policy
        >
Amaal authorization context
        >
approved knowledge
        >
AI analysis / recommendation
```

The model cannot outrank the ERP.

## 2. Complete mediation

Every model-selected tool is re-authorized at execution time.

The model cannot provide:

```text
user_id
organization_id
region scope
team scope
role override
permission override
service credential
SQL statement
```

as an authority claim. Those values come from the authenticated server context and domain services.

## 3. Tool minimization

The router exposes the smallest contract practical for the detected request class. Explicit operational language is required before high-risk preparation tools enter the candidate set.

Examples:

```text
“Which devices are aging?”
→ read tools only

“Prepare a transfer request…”
→ inventory read tools + transfer/adjustment preparation tools

“Disable this user.”
→ critical route; no mutation tool
```

This control directly addresses the excessive-functionality and excessive-autonomy risks identified by OWASP. citeturn137406search0

## 4. Action safety

Stage 8 supports only a narrow execution bridge:

```text
create_recovery_case
```

A recovery plan must satisfy all of the following before execution:

1. It is a Stage 8 supported tool.
2. The plan is still in its approval-backed pending state.
3. The linked normal Amaal approval request is `APPROVED`.
4. The executor is the plan creator or CEO/Admin.
5. Current `ai.execute` authorization is present.
6. The normal recovery domain service accepts the target and arguments.

Execution therefore remains a normal Amaal transaction, not a model-side mutation.

## 5. Critical operations

Financial correction, destructive deletion, security-setting changes, role/permission changes and user-disable operations are treated as critical language and routed to read-only/recommendation behavior in Stage 8.

They are not “hidden” tool calls. They simply do not exist as executable AI capabilities.

## 6. Knowledge governance

Approved knowledge documents include explicit metadata for:

```text
organization
classification
required permissions
allowed roles
allowed regions
allowed teams
status
version
```

Retrieval checks those fields in the application. PostgreSQL RLS provides a second authorization boundary for role/region/team constraints.

Stage 8 does not automatically ingest arbitrary external webpages into the knowledge corpus.

## 7. Memory governance

Conversation history may help the model understand continuity, but memory is never authorization.

Every request re-loads current Amaal authorization. An old conversation cannot grant access to a user, customer, team, region or stock item that is no longer inside the current scope.

## 8. Data minimization

AI tool invocation audit rows record a cryptographic arguments hash instead of duplicating raw arguments in the invocation table. Action plans retain the minimum operational payload needed to support the specific human-reviewed action.

Tool results are bounded before they are returned to the model to control prompt growth and reduce accidental re-exposure of large datasets.

## 9. Provider controls

The provider layer is disabled by default.

Required live controls:

```text
AMAAL_AI_ENABLED=true
AMAAL_AI_MODEL=<explicit approved model>
OPENAI_API_KEY=<server-side secret>
AMAAL_AI_PROVIDER_TIMEOUT_MS=<bounded value>
```

The provider request uses `store: false` in the implementation. OpenAI's platform documentation describes separate application-state retention behavior for Responses requests, so the Amaal service explicitly chooses not to request provider-side response storage. citeturn460897search4

## 10. Evaluation contract

Stage 8 includes deterministic policy tests, but production launch still requires a broader evaluation set.

Minimum launch evaluation categories:

```text
correct scoped answer
unauthorized data refusal
critical-operation refusal
prompt injection resistance
knowledge access filtering
tool argument rejection
approval workflow integrity
conversation continuity
uncertainty labeling
provider failure handling
```

The evaluation target is not merely “the model answered.” It is:

```text
Did Amaal AI stay inside the Amaal boundary while answering?
```

## 11. Human factors

The interface must keep human reviewers aware of the distinction between:

```text
what Amaal knows
what Amaal inferred
what Amaal recommends
what Amaal prepared
what a human approved
what Amaal actually executed
```

This is consistent with the need to control confabulation and overreliance in consequential use cases. citeturn137406search28turn137406search4

## 12. Incident posture

If an AI provider fails, Amaal remains an ERP.

If Amaal AI is disabled:

```text
sales still work
inventory still works
recovery still works
finance still works
reports still work
```

AI availability is therefore non-authoritative and non-critical to the transactional system.

## 13. Governance decision

Stage 8 deliberately stops before general autonomous execution. The correct next step is not to “give the AI more power”; it is to collect safe operational evidence and harden evaluation, observability and approval flows before Stage 9 predictive intelligence and Stage 10 production hardening.

## 14. Stage 8.2/8.3 control-plane hardening

### Governance pinning

Amaal AI persists both the governance version and tool-policy version on conversations, tool invocations and action plans. This allows retrospective evaluation to distinguish changes in model configuration from changes in the authorization/tool contract.

### Expiry as a hard authorization boundary

A high-risk AI action plan is not a durable authorization grant. Plans expire after 24 hours and are checked again at every transition:

```text
DRAFT
 ↓
submission check
 ↓
PENDING_APPROVAL
 ↓
approval check
 ↓
APPROVED
 ↓
execution check
```

Expiry wins over stale workflow state.

### Output defense-in-depth

A deterministic post-generation guard blocks protected implementation content including detected raw SQL, secret/credential patterns and explicit privilege-bypass instructions. The guard is intentionally conservative and replaces the complete unsafe model narrative instead of attempting partial redaction that could leave a dangerous fragment intact.

A `AI_OUTPUT_GUARDRAIL_BLOCKED` audit event is written with the detected category set. No secret value is written to that event.

### Attempt observability

Rejected model tool calls are recorded as `AI_TOOL_REJECTED` governance events. This means the security record includes both successful use and attempted misuse of the tool boundary.

### Evaluation Center

The deterministic Stage 8 Evaluation Center contains 18 model-independent cases covering routing, action escalation, authorization filtering, prompt injection, critical-operation refusal, output leakage, schema strictness and forbidden-capability checks. The suite is a pre-provider control-plane test, not evidence that a particular foundation model is safe in every possible conversation.

# Amaal RLS Integration Test Report

## Test provenance

The baseline negative/positive authorization matrix documented below was executed against the former live Supabase PostgreSQL provider using temporary identities and rollback fixtures. That report remains valid as historical evidence of the RLS/authorization design, but it should not be read as a claim that those exact live tests were rerun on Neon.

The current Neon production branch has the same 47-table / 47-policy authorization foundation, with permission mappings and authorization functions migrated and verified. A fresh full negative integration sweep against Neon remains a required gate before production readiness.

## Passing historical cases

| Case | Result |
|---|---|
| Agent cannot see another Agent's stock | PASS |
| Agent cannot see another Team's customer | PASS |
| Team Leader cannot see another Team's stock | PASS |
| Manager cannot see another Manager's Team | PASS |
| Regional Manager cannot see another Region's warehouse | PASS |
| Authenticated client cannot DELETE inventory history | PASS |
| Recovery Officer cannot UPDATE sales directly | PASS |

## Positive historical cases

| Case | Result |
|---|---|
| Agent can see own stock | PASS |
| Team Leader can see own team stock | PASS |
| Manager can see managed team | PASS |
| Regional Manager can see regional warehouse | PASS |
| Admin can see company warehouse | PASS |

## Current enforcement layers

The required security model remains:

```text
Authentication
↓
Server authorization
↓
Business rules / record state
↓
Neon PostgreSQL grants + RLS
↓
Audit + outbox
```

## Current Neon security baseline

- 47 public tables
- 47 RLS policies
- permission matrix copied/verified
- 159 role-permission mappings copied/verified
- authenticated browser writes remain server-authoritative
- production test fixture data cleaned up

## Next authorization test layers

Run these against Neon with controlled identities/scopes:

- CEO company-wide positive reads
- scoped Admin profiles
- Regional Manager regional positives
- Manager multi-team positives
- Team Leader team positives
- Agent/Shop Owner own-stock positives
- Recovery Officer assigned-case positives
- Jarvis read-tool authorization for every documented boundary
- realtime event scope filtering

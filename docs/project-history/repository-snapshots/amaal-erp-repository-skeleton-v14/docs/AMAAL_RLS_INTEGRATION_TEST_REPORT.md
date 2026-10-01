# Amaal RLS Integration Test Report

## Test approach

The negative authorization matrix was executed against the live Supabase PostgreSQL project using temporary test identities and organization records inside a transaction that was rolled back after the assertions.

No permanent employee, customer, product, IMEI or sale data was created.

## Passing cases

| Case | Result |
|---|---|
| Agent cannot see another Agent's stock | PASS |
| Agent cannot see another Team's customer | PASS |
| Team Leader cannot see another Team's stock | PASS |
| Manager cannot see another Manager's Team | PASS |
| Regional Manager cannot see another Region's warehouse | PASS |
| Authenticated client cannot DELETE inventory history | PASS |
| Recovery Officer cannot UPDATE sales directly | PASS |

## Positive cases

| Case | Result |
|---|---|
| Agent can see own stock | PASS |
| Team Leader can see own team stock | PASS |
| Manager can see managed team | PASS |
| Regional Manager can see regional warehouse | PASS |
| Admin can see company warehouse | PASS |

## Enforcement layers

These tests complement the server-side authorization engine. They do not replace it.

Amaal's required security model remains:

```text
Authentication
↓
Server authorization
↓
Business rules / record state
↓
Database grants + RLS
↓
Audit + outbox
```

## Current live security state

- 47 public tables
- 47/47 public tables with RLS enabled
- Supabase security advisor: 0 findings
- Authenticated direct table writes remain revoked for the browser-facing database role
- Backend-only tables and state have explicit policies/grants

## Next authorization test layers

The live negative matrix is complete for the baseline hierarchy. The next integration suite should add:

- CEO company-wide positive reads
- scoped Admin profiles
- Regional Manager regional positives
- Manager multi-team positives
- Team Leader team positives
- Agent/Shop Owner own-stock positives
- Recovery Officer assigned-case positives
- Jarvis read-tool authorization for every documented boundary
- realtime event scope filtering

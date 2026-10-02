# API service

The API is the server-side boundary between authenticated users and Amaal domain services.

## Current implementation stage

The service now has:

- request/command/result contracts
- transaction-runner abstraction
- no fake business data
- no direct browser writes to authoritative tables

The next implementation step is the concrete PostgreSQL/Kysely transaction adapter and the first fully transactional commands for inventory and sales.

## Authoritative transaction shape

```text
authenticate
→ authorize
→ validate command
→ begin transaction
→ lock authoritative rows
→ apply business rules
→ write state
→ write audit
→ write outbox
→ commit
```

Amaal AI is not on the authoritative transaction path.

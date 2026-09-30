# Amaal Transaction Service Contract

Status: implementation foundation

## Transaction boundary

```text
Authenticate
→ authorize
→ validate command
→ begin DB transaction
→ lock authoritative record(s)
→ apply deterministic business rules
→ write transactional state
→ write immutable history / audit
→ write outbox event
→ commit
```

A failed transaction rolls back all business effects.

## Rules

- No service may trust client-provided current state.
- IMEI sale operations must lock the IMEI row before eligibility is evaluated.
- Payment creation must be idempotent where a client/worker retry can occur.
- Completed history is corrected by reversal/adjustment/void/cancellation mechanisms, never silent destructive overwrite.
- Outbox events are written in the same transaction as the business change.
- Realtime publication occurs after commit through the outbox/worker path.
- AI/Jarvis is never on the authoritative sale transaction path.

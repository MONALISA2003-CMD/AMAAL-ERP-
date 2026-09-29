# Amaal RLS and Authorization Foundation

**Status:** Draft security foundation. Final policies depend on approval of the full authorization matrix.

## Model

Authorization combines:

```text
identity
+ role
+ organizational scope
+ resource ownership
+ action
+ record state
+ approval policy
```

RLS is defense in depth; business services remain responsible for enforcing domain transitions and transaction rules.

## Supabase-specific security rules

- All exposed public-schema tables have RLS enabled.
- Authorization is not based on editable `raw_user_meta_data`.
- The frontend never receives a service-role/secret key.
- Direct client writes to protected financial/inventory tables are not granted by default.
- Sensitive state changes go through authenticated domain services.
- Authorization helper functions are kept in a non-exposed `private` schema.

## Initial policy strategy

Read policies establish scope for core records. Write policies for protected state transitions are intentionally withheld until the domain services exist, because a permissive `UPDATE` policy could allow clients to bypass state transitions, audit, approvals or the inventory ledger.

## Negative tests required

- Agent cannot read another Agent's stock.
- Agent cannot read another Team's customer.
- Team Leader cannot read another Team's stock.
- Manager cannot read another Manager's Team.
- Regional Manager cannot read another Region's warehouse.
- Admin cannot delete Master Warehouse history.
- Recovery Officer cannot modify a sale.
- Jarvis cannot retrieve unauthorized records.

These tests should be automated alongside positive authorization tests.

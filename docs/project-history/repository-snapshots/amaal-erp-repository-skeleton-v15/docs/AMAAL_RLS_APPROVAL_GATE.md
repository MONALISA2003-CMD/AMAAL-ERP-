# Amaal RLS Approval Gate

## Live security state

The RLS foundation is now active on the connected Supabase project.

Current verified state:

- 47 public tables
- 47/47 have RLS enabled
- Supabase security advisor: 0 findings
- Anonymous table privileges: 0
- Browser-facing authenticated direct table writes: 0

## Verified negative authorization matrix

The live transactional test harness passed:

1. Agent cannot see another Agent's stock.
2. Agent cannot see another Team's customer.
3. Team Leader cannot see another Team's stock.
4. Manager cannot see another Manager's Team.
5. Regional Manager cannot see another Region's warehouse.
6. Authenticated client cannot DELETE inventory history.
7. Recovery Officer cannot UPDATE sales directly.

The harness uses temporary identities/data and rolls the test transaction back.

## Security rule

RLS is not the only authorization layer. Amaal continues to enforce authorization in business services, background workers, reports, exports, realtime reads and Jarvis tools.

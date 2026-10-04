# @amaal/finance

Phase 4 finance boundary for:

- commissions
- bonuses
- payments and approved financial corrections
- receipts
- loan providers
- immutable commercial policy snapshots

## Governance

CEO-controlled commercial policies: pricing, commission and bonus policy creation/activation.

Financial corrections require an approved `FINANCIAL_CORRECTION` approval from a different actor and are recorded append-only in `payment_adjustments`.

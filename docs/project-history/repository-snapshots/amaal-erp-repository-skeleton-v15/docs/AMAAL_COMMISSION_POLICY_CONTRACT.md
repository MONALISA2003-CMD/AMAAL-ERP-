# Amaal Commission Policy Contract

## Status

Technical execution contract implemented. Amaal's actual commission rates and business conditions are intentionally **not** invented here.

The approved specification makes commission policy configurable by Amaal leadership. This contract defines only how an already-approved policy is executed.

## Policy selection

The engine selects an active, effective policy using this precedence:

1. product variant + beneficiary role
2. product variant + no role restriction
3. no product restriction + beneficiary role
4. general policy

Within the same specificity, the newest effective policy is selected.

Historical transactions store the selected policy identity and a snapshot of its rule definition.

## Supported calculation types

```text
FIXED_AMOUNT
PERCENT_OF_SALE
```

The technical engine validates the rule definition and refuses unsupported or malformed calculation types.

## Important policy boundary

The platform does **not** seed default rates, hidden percentages, minimum commissions, bonus thresholds or promotional rules.

When no applicable policy exists, no commission is silently fabricated. The transaction can complete according to the finalized Amaal sales policy, while commission creation remains absent until a valid active policy is configured.

## Correction semantics

Commission history is append-only.

A sale reversal does not overwrite the original commission. Instead, a `commission_adjustments` reversal record is created against the original commission ledger entry.

This preserves:

- original commission fact;
- reversal amount;
- reason;
- correcting actor;
- approval context when applicable;
- audit/outbox history.

## Future policy extensions

Additional calculation rules may be added only after the corresponding Amaal business policy is explicitly defined and approved.

# Amaal Database Schema Foundation

**Status:** Draft implementation schema derived from the approved specifications.

The schema is designed around the specification principle that the transactional database is authoritative, inventory is IMEI-centric, protected history is preserved, and downstream systems consume committed events rather than becoming a second source of truth.

## Current PostgreSQL target

The approved architecture originally described PostgreSQL 18/Aurora. The connected Supabase project currently runs PostgreSQL 17.x. This schema therefore uses portable PostgreSQL features and does not depend on PostgreSQL-18-only behavior.

## Core groups

- Organization and identity: `organizations`, `profiles`, `regions`, `managers`, `teams`, `team_memberships`, `shops`, `role_assignments`, `warehouses`
- Product and pricing: `brands`, `products`, `product_variants`, `price_policies`
- Inventory: `imei_units`, `inventory_movements`, `stock_allocations`, `stock_allocation_items`, `aging_policies`
- Customers/sales: `customers`, `sales`, `sale_items`, `receivables`, `payments`, `receipts`
- Earnings: `commission_policies`, `commissions`, `bonus_policies`, `bonus_awards`
- Recovery: `recovery_cases`, `recovery_activities`
- Governance: `approval_requests`, `approval_decisions`, `audit_events`
- Events: `outbox_events`, `consumer_receipts`

## Transactional principle

Critical business operations must execute as domain transactions, not direct arbitrary table edits.

For example, completing a sale should validate authorization and business rules, lock the relevant IMEI, create the sale/payment/receipt records, transition the IMEI, calculate the applicable commission, append audit history and create an outbox event before commit.

## Historical pricing

`price_policies` are effective-dated. `sale_items.price_snapshot` records the policy/price that applied to that sale so later price changes do not rewrite history.

## Inventory truth

`imei_units` stores the current authoritative state/holder snapshot for fast access. `inventory_movements` is the immutable movement ledger. Current state must never be changed without the corresponding governed movement/history.

## Protected history

Completed sales, receipts, payments, movement history, recovery history, commissions, bonuses and audit events are corrected through explicit reversal/adjustment/cancellation/write-off/archive flows rather than silent deletion.

## Event bridge

`outbox_events` records committed domain facts for downstream workers. Consumers record `(consumer_name, event_id)` in `consumer_receipts` to support idempotency.

## Not yet frozen

The following remain policy decisions before production migration freeze:

- exact commission rule definitions
- bonus thresholds and qualification rules
- detailed loan provider and repayment rules
- exact approval thresholds by action/role
- full sale/reversal lifecycle states
- detailed recovery escalation rules
- retention durations
- exact admin profile permissions

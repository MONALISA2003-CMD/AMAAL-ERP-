# Amaal ERP — Phase 4: Sales + Finance

## Scope
Phase 4 implements the source roadmap domains:

- Customer
- Cash sale
- Loan sale
- Receipt
- Payment
- Commission
- Bonuses

The phase preserves the Phase 0–3 architecture: Neon/PostgreSQL is business truth, Render is the business/API boundary, Vercel is presentation, and transactional outbox events distribute committed truth.

## Sale transaction contract
A completed sale is atomic:

1. Authenticate and authorize the actor.
2. Verify the customer is in organizational scope.
3. Lock every IMEI in the sale.
4. Verify each IMEI is sellable and the seller is its accountable holder.
5. Resolve and validate the active versioned price policy.
6. Validate line pricing, discount and minimum price.
7. Validate CASH or LOAN finance terms.
8. Create the sale header and immutable commercial snapshots.
9. Create sale items with pre-sale custody provenance.
10. Create payment/receivable facts.
11. Create the system receipt.
12. Move the IMEI to SOLD.
13. Create direct seller commission and bonus ledger facts.
14. Write audit and outbox records.
15. Commit once.

Any failure rolls back the critical transaction.

## Customer ownership
Customers carry current ownership and scope:

- owner user
- region
- subregion
- team
- shop

Ownership changes are recorded in `customer_assignments` so historical ownership is not lost.

## Payment integrity
Completed payment facts are immutable. Corrections require:

- an approved `FINANCIAL_CORRECTION` approval;
- a reason;
- a separate adjustment/replacement record;
- no correction chains;
- no cash overpayment or underpayment state.

## Receipt integrity
Receipt number, sale linkage, customer and issuing identity are immutable after issuance. Voiding is a state change, not a rewrite.

## Commercial policy governance
Product pricing, commission policies and bonus policies are CEO-controlled. Historical policy facts are snapshotted into the sale/commission/bonus records used at execution time.

Active policy windows cannot overlap within the same commercial scope, and effective end dates must be later than effective start dates.

## Commission conditions
Supported condition dimensions are intentionally explicit:

- `minSaleAmount`
- `maxSaleAmount`
- `paymentTypes` (`CASH`, `LOAN`)

The evaluator considers up to the highest-priority eligible policy candidates before applying these conditions, preventing an ineligible specific policy from incorrectly blocking a valid fallback policy.

## Bonus calculation
Bonus qualification supports:

- `SALES_COUNT`
- `SALES_VALUE`
- `WEEKLY`
- `MONTHLY`
- `QUARTERLY`
- the same explicit sale amount/payment type conditions above

Qualification is written to `bonus_ledger` with a qualification snapshot.

## Login authority invariant
Phase 4 does not change identity authority:

**CEO → Admin only**

**Admin → Regional Manager, Manager, Team Leader, Agent, Shop Owner**

**Regional Manager → Manager, Recovery Officer**

**Manager → Team Leader**

**Team Leader → Agent, Shop Owner**

Recovery Officer recruitment remains outside direct Admin recruitment.

## Production gate
This Phase 4 code package is a build/release candidate. The Phase 4 migrations are intentionally not applied to production unless explicitly requested. Deployment and live debugging are deferred until the user elects to deploy.

## Current build status

Phase 4 source work is implemented as a release candidate. Local structural validators and dependency-light finance rule tests pass. Deployment is intentionally deferred.

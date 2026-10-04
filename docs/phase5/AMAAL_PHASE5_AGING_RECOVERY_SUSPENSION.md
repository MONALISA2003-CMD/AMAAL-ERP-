# Amaal ERP — Phase 5: Aging, Recovery & Suspension

Phase 5 converts the Amaal aging policy into a durable operating engine.

## Aging policy
The default Amaal bands are immutable by convention and configurable by a CEO-controlled policy version:

- 1–7 days: GREEN
- 8–13 days: ORANGE
- 14–17 days: RED
- 18+ days: PURPLE

Field aging is measured from `field_age_started_at`. Inventory transfers do **not** reset total field age. Current-holder aging remains separately tracked from `current_holder_started_at`.

## Automated engine
The scheduled engine:

1. selects the current effective policy for each organization;
2. evaluates field-held IMEI units;
3. writes the current aging read model;
4. records immutable band/threshold transitions;
5. raises notifications and aging alerts;
6. opens an automated recovery case at overdue age when auto recovery is enabled;
7. changes the affected IMEI to `RECOVERY_PENDING` without physically deleting history;
8. auto-assigns a region-matched Recovery Officer using current active-case load;
9. escalates to the Regional Manager when no Recovery Officer is available;
10. escalates due recovery cases when promised/active recovery passes its due date;
11. evaluates configurable suspension thresholds for Agents, Shop Owners, Team Leaders and Managers.

## Recovery controls
Physical recovery is scan-driven. Warehouse acceptance requires the scanned IMEI to match the case asset and the receiving warehouse to be authorized for the case region. Recovery history remains append-only through activities, assignment history, escalation history, inventory movements, audit events and outbox events.

## Suspension controls
A suspension is a durable business-access state, not a destructive account operation. API access-state resolution treats an active business-access suspension as `SUSPENDED`. Reinstatement requires an explicit CEO or active Admin action with a reason and is fully audited.

## CEO policy control
Only the CEO can create/activate aging policy versions. Replacements are versioned by effective window; an existing current policy is closed at the replacement start boundary before the new policy becomes effective.

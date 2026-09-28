# Sales Service

Deterministic sales domain boundary.

A completed sale must atomically validate seller scope, IMEI eligibility, customer, pricing/payment policy, create sale/payment or receivable/receipt records, update IMEI state, create commission records where applicable, audit the action and enqueue the domain event.

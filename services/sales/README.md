# @amaal/sales

Phase 4 authoritative sale service.

A completed sale atomically verifies seller ownership of every IMEI, locks the IMEIs, validates commercial policy and payment terms, records the sale and receipt, transitions inventory to `SOLD`, creates commission/bonus facts, and emits audit/outbox records.

Multi-line sales are limited to 20 IMEIs and all lines must share one region/team/shop custody scope.

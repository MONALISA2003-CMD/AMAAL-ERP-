# Inventory Service

Deterministic inventory domain boundary.

Responsibilities:
- IMEI state transition validation
- inventory movement orchestration
- allocation/transfer orchestration
- custody and movement history

The service must execute mutations inside a database transaction and never treat UI/cache state as authoritative.

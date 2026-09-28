# Render infrastructure status

## Phase 1 mapping

Render is the application-compute layer for Amaal:

- API service
- background/outbox worker
- future AI/ML service
- Valkey-compatible cache/queue/coordination layer

## Live provisioned resource

- Name: `amaal-valkey`
- Resource ID: `red-data7s0jo6nc73esg63g`
- Region: Frankfurt
- Plan: Free
- Engine version: Valkey 8.1.10
- Eviction: `allkeys_lru`
- Persistence: off
- Status: available

Valkey is non-authoritative. PostgreSQL remains the source of truth for inventory, finance, authorization and audit.

## API/worker deployment gate

Render service creation requires the canonical Git repository URL because the current Render connector creates services from a Git source. The Amaal repository is maintained through the ZIP-sync workflow, but the exact repository URL is not assumed or invented here.

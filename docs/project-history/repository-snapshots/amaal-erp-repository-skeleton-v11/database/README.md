# Amaal Database

This directory contains the version-controlled PostgreSQL database definition.

## Rules

- Production schema changes are migrations.
- No manual dashboard-only production schema changes as the normal workflow.
- Use explicit constraints, indexes, foreign keys and state-transition protections.
- Enable RLS on exposed tables and test negative authorization paths.
- Keep transactional truth in PostgreSQL; do not move it into cache or AI memory.
- Use an outbox/domain-event model for asynchronous processing.

The first real migration should be written only after the entity/relationship design and authorization matrix are reconciled with the approved Amaal specifications.

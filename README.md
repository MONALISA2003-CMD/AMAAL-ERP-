# Amaal ERP

Amaal is a closed, single-company internal ERP and intelligent operations platform for smartphone sales, inventory custody, field distribution, receipts, payments, commissions, bonuses, recovery, reporting and governed AI operations.

## Architecture

- **Vercel** — Next.js/React frontend and PWA surface
- **Render** — API/application services and background workers
- **Render Valkey** — cache, queues, rate limits and short-lived coordination
- **Supabase PostgreSQL** — authoritative transactional data
- **Supabase Auth** — identity and sessions
- **Supabase Storage** — private documents and evidence
- **Supabase Realtime** — authorized realtime delivery
- **OpenAI** — Jarvis intelligence/orchestration
- **GitHub** — source control and CI/CD source

## Source of truth

See `docs/` before implementing features. The approved Amaal specifications define the product and domain requirements. The prototype ZIP is not the production codebase and is only a UX/reference artifact.

## Implementation rule

The system is database-first and authorization-first. Do not build fake dashboards, fake authentication, fake inventory or client-side-only business behavior.

## Current build status

- Domain model, state machines, authorization matrix and event catalog are defined.
- Core PostgreSQL and RLS foundations are prepared.
- Supabase `AMAAL ERP` is connected, healthy and currently empty; no production schema has been applied yet.
- GitHub ZIP synchronization is operational and removes the input ZIP after extraction.

See `docs/AMAAL_DATABASE_IMPLEMENTATION_STATUS.md` for the current database gate.

# Amaal ERP Handoff Package

The original 29 September hand-off is retained for historical traceability. The current continuation is `../../AMAAL_CONTINUATION_2026-09-30.md`.

Current production architecture is:

```text
Vercel / Next.js
  ↓
Supabase Auth
  ↓
Render API
  ↓
Neon PostgreSQL
  ↓
Render worker + Valkey
```

Historical hand-off statements that describe Supabase PostgreSQL as authoritative are no longer current. See `docs/AMAAL_NEON_LIVE_STATUS.md` and `docs/AMAAL_INFRASTRUCTURE_MAPPING.md`.

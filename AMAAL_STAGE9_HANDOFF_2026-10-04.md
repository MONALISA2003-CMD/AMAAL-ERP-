# Amaal Stage 9 Handoff — 2026-10-04

## Scope

Python + ML Intelligence, extending the Stage 8 governed AI architecture without replacing Amaal's transactional core.

## Implemented

```text
Stage 7 read models
      ↓
point-in-time feature snapshots
      ↓
Python intelligence service
      ├── demand forecasting
      ├── aging-risk candidate
      ├── anomaly detection
      ├── recovery prioritization
      └── inventory optimization
      ↓
model registry / training-run / prediction / evaluation storage
      ↓
authorized API
      ↓
ML Intelligence workspace + Jarvis read tools
```

## Guardrails

- Neon remains authoritative business truth.
- Python has no transactional write path.
- Browser never calls the Python model server directly.
- Internal model server requires a server-side token.
- Stage 9 predictions are advisory/shadow outputs.
- Insufficient data returns `INSUFFICIENT_HISTORY`; history is never fabricated.
- Time-dependent candidate training uses time-aware validation.
- Risk probability candidates require calibration evidence before production promotion.
- Model versions and feature schema versions are persisted.
- No automatic recovery, inventory transfer, financial correction or user-suspension execution was added.
- No products were deleted or altered by the Stage 9 migration.

## Current live-data posture

The connected Neon snapshot entering Stage 9 is still foundation-level, so there is not enough real historical data to activate useful production ML. That is expected. The value of Stage 9 is the production-grade data/model boundary and the discipline needed when history accumulates.

## Validation

- Stage 9 Python tests: PASS — 5/5
- Stage 9 route tests: PASS — 3/3
- Stage 9 repository validator: PASS
- Stage 8 validator/test suite remains required and was kept compatible.

## Production remains deferred

No GitHub push, Render/Vercel deployment, production Neon migration or model promotion was performed. Stage 10 is still the launch gate.

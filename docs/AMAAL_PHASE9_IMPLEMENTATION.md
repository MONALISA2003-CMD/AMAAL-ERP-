# Amaal Stage 9 — Python + ML Intelligence

## Delivery status

Stage 9 is implemented locally on top of Stage 8. The repository now contains the Python intelligence boundary, data-quality gates, model contracts, candidate training scaffolding, prediction read models, an authenticated internal inference service, and authorized ERP/Jarvis read access to derived predictions.

No GitHub push, Render deployment, production migration, or model activation was performed.

## Architecture

```text
Neon PostgreSQL
  │
  ├── authoritative ERP truth
  └── Stage 7 derived reporting models
          │
          ▼
   point-in-time feature snapshots
          │
          ▼
   Python / Stage 9 intelligence
          ├── demand forecasting
          ├── aging-risk prediction
          ├── recovery prioritization
          ├── anomaly detection
          ├── product velocity
          ├── regional forecasting
          └── inventory optimization
          │
          ▼
   time-aware validation + model registry
          │
          ▼
   SHADOW / advisory predictions
          │
          ├── authorized API
          ├── ML Intelligence workspace
          └── Amaal AI read tools / Jarvis
```

The Python service never owns a business transaction and never receives a browser token. Production should use a dedicated `AMAAL_INTELLIGENCE_DATABASE_URL` credential restricted to derived ML tables/read models.

## Feature and leakage controls

Temporal datasets are filled to explicit daily buckets so missing dates are represented as zero rather than silently shifting lag positions. Point-in-time snapshots carry an as-of date, feature schema version, source freshness and eventual label availability. Training gates require minimum observation counts and time coverage before a candidate can train.

Demand candidates use a scikit-learn pipeline with scaling and Ridge regression plus `TimeSeriesSplit`; scikit-learn documents pipelines as a way to chain preprocessing and estimators and notes that this helps prevent data leakage, while `TimeSeriesSplit` is designed for time-ordered validation rather than training on future rows. citeturn543670search4turn543670search5

Probability models are not treated as trustworthy merely because a `predict_proba` value exists. Calibration is a separate evaluation concern in scikit-learn, so the Stage 9 governance contract requires calibration evidence before production promotion of a risk model. citeturn543670search2

## Model lifecycle

Models carry:

- model key and semantic version
- prediction kind
- algorithm
- feature schema version
- training dataset hash
- time window
- training row count
- metrics
- limitations
- code version
- lifecycle status

The lifecycle uses `DRAFT → CANDIDATE → SHADOW → ACTIVE → RETIRED/BLOCKED`. Stage 9 keeps candidates in shadow/advisory mode; activation is a Stage 10 gate.

This is intentionally similar to a model-registry discipline: versioned artifacts, lineage, metadata, validation tags and explicit deployment aliases are current best practices in model lifecycle tooling such as MLflow. citeturn543670search1turn543670search9

## Intelligence semantics

`FACT` remains committed ERP truth.

`PREDICTION` is a model-derived estimate about a future or hidden outcome.

`RECOMMENDATION` is an operational suggestion built from facts and/or predictions.

`SHADOW` is a prediction recorded for validation but intentionally not allowed to become an autonomous business decision.

A prediction may inform Jarvis, but it cannot approve its own action and cannot change stock, sales, recovery, finance or authorization state.

## Data sufficiency

The current live Neon snapshot remains foundation-level. Stage 9 therefore has a deliberate **do-not-fake-history** policy. When history or labels are inadequate, the model returns `INSUFFICIENT_HISTORY` rather than manufacturing a forecast, a risk probability or a claim of model quality.

Baseline operational signals can still be returned as `SHADOW` when their inputs are present, clearly labelled as non-trained advisory baselines.

## Operational recommendations

The Stage 9 service is designed to run privately behind Render networking. Browser clients call the authenticated Amaal API; they do not call the Python model server. Amaal API/Jarvis reads durable `ml_predictions`, so temporary Python service failure cannot make ERP truth disappear.

NIST's AI RMF remains the governance reference for lifecycle risk management; NIST notes that the framework is being revised and released a Trustworthy AI in Critical Infrastructure concept note in April 2026. citeturn543670search0turn543670search10

## Non-goals

Stage 9 does not add Kafka, Kubernetes, a second transactional database, automatic recovery execution, automatic stock transfer, automatic financial changes, autonomous suspension, or a public model endpoint.

## Production gate

Stage 10 must still complete dependency installation on the Node 24 target, Python dependency lock/reproducibility, real Neon migration rehearsal, provider/service integration, model training on real history, calibration/evaluation, data drift monitoring, load/concurrency testing, backup/restore, secrets hardening, MFA, incident response and final red-team review.

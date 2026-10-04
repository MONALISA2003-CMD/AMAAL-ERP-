# Amaal Intelligence — Stage 9

Stage 9 establishes the Python + ML intelligence layer described by the Amaal development stages.

```text
Neon derived read models
        ↓
feature engineering / point-in-time datasets
        ↓
Python intelligence
        ↓
model candidate
        ↓
time-aware validation + model card
        ↓
SHADOW
        ↓
validated prediction read model
        ↓
API / reports / Jarvis
        ↓
human decision or Stage 10-approved action
```

## Models in scope

- sales forecasting / demand forecasting
- aging-risk prediction
- recovery prioritization
- agent performance anomaly detection
- regional forecasting
- product velocity
- inventory optimization

Stage 9 deliberately does **not** invent training history. The current production snapshot is foundation-level, so model activation is blocked until Amaal accumulates sufficient point-in-time observations and labels.

The serving process exposes only internal JSON endpoints and requires `AMAAL_INTELLIGENCE_INTERNAL_TOKEN`. It should run behind Render private networking; browsers and model providers never call it directly.

### Training discipline

Time-ordered data uses time-aware validation instead of random shuffling. Scikit-learn's `Pipeline` is used for preprocessing + estimator composition because it helps prevent preprocessing leakage, and `TimeSeriesSplit` is used where temporal order matters. Probability-producing risk candidates should be calibrated and evaluated separately before any production use. citeturn543670search4turn543670search5turn543670search2

Model lifecycle metadata follows a registry pattern: versioned model records, dataset lineage, metrics, validation status and aliases are captured in Neon. This mirrors the governance benefits described by the MLflow Model Registry while keeping Amaal's derived-model registry inside its own authoritative database. citeturn543670search1turn543670search9

NIST's AI RMF remains the risk-governance reference for trustworthy lifecycle practices; its GAI Profile was updated in April 2026. citeturn543670search0turn543670search10

## Stage 9.5 MLOps control plane

Candidate training produces an artifact plus integrity manifest. The manifest binds the model version to the feature schema, dataset hash, code version and dependency-lock hash. Artifacts must be verified before they can participate in a promotion decision.

Monitoring covers:

```text
feature drift
prediction drift
label drift
performance
calibration
slice metrics
data freshness
missingness
```

Rollout is intentionally:

```text
DRAFT → CANDIDATE → SHADOW → CANARY → ACTIVE
                       ↘ ROLLBACK
```

No state transition is automatic merely because a model scored well on one evaluation. A promotion gate requires artifact verification, feature validation, evaluation, calibration, monitoring and a successful canary.

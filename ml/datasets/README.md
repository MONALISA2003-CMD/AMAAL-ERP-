# Amaal ML datasets

Stage 9 datasets are point-in-time, scope-aware, and versioned.

No production dataset is copied into the repository. Training jobs consume governed Neon read models or approved offline snapshots.

Required metadata for an offline dataset:

- organization scope
- as-of date / temporal coverage
- feature schema version
- label definition and label cutoff
- source read-model versions
- dataset hash
- missing-value policy
- exclusion rules

Never mix future outcomes into a feature row that predates the outcome.

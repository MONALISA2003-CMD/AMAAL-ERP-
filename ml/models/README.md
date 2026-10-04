# Amaal ML models

Stage 9 model families:

| Model key | Purpose | Stage 9 mode |
|---|---|---|
| `demand.daily.ridge` | Daily demand forecasting | Candidate / shadow |
| `aging-risk.logistic` | Recovery-required risk | Candidate / shadow |
| `recovery-priority.baseline` | Human recovery queue ordering | Shadow |
| `inventory-optimization.baseline` | Replenishment / transfer review | Shadow |

Every model must have a model card, feature schema version, training dataset hash, validation metrics, creation code version, governance version and lifecycle status.

No model can mutate ERP truth. Predictions are advisory derived records.

# Amaal ML Governance Standard — Stage 9

1. **Source-of-truth rule** — predictions are derived records; ERP services remain authoritative.
2. **Point-in-time rule** — a feature row may only use information known by its as-of timestamp.
3. **No synthetic production history** — missing history blocks training instead of being invented.
4. **Temporal validation** — temporal models use ordered validation; random shuffling is not the default for time-dependent outcomes.
5. **Calibration** — probabilities used as operational risk should be evaluated for calibration before production promotion.
6. **Segment review** — production candidates must be checked for degradation across authorized regions/teams where sample sizes are meaningful.
7. **Shadow first** — new models begin in shadow/advisory mode.
8. **Model lineage** — model version, feature schema, dataset hash, code version, metrics and limitations are retained.
9. **Human accountability** — a model recommendation does not itself authorize a business action.
10. **Reproducibility** — training environments and Python dependencies must be locked before Stage 10 activation.
11. **Privacy** — the model layer consumes minimized derived data and never sends provider/browser credentials.
12. **Monitoring** — freshness, drift, error, calibration and outcome quality must be observable after activation.

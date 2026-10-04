# Amaal ML training

Training is opt-in and data-gated.

Minimum policy examples:

- demand forecast: 56+ equally spaced daily observations
- aging risk: 90+ time-ordered labeled observations with acceptable class balance
- anomaly baseline: 30+ observations
- product velocity / regional forecast: 28–56+ observations depending on method

Temporal problems use time-aware validation rather than randomly mixing future rows into training. The candidate is not promoted merely because it trains successfully; it must pass model-specific evaluation, calibration where probabilities are used, governance review and the Stage 10 deployment gate.

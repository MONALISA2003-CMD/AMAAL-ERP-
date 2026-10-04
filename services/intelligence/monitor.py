"""Batch monitoring CLI; records only derived MLOps observations."""
from __future__ import annotations
import argparse, json
from datetime import date
from amaal_intelligence.monitoring import monitor_probability_model

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='JSON file containing actual/probability arrays.')
    args = parser.parse_args()
    payload=json.loads(open(args.input, encoding='utf-8').read())
    result=monitor_probability_model(payload.get('actual',[]), payload.get('probabilities',[]), reference=payload.get('reference',[]), current=payload.get('current',[]), missingness=float(payload.get('missingness',0)))
    print(json.dumps({'observed_date':date.today().isoformat(), **result}, indent=2))
    return 0
if __name__=='__main__': raise SystemExit(main())

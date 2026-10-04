"""Create daily point-in-time feature snapshots from Stage 7 reporting read models."""
from __future__ import annotations

import json
import os
from datetime import date
from typing import Any

from amaal_intelligence.contracts import FEATURE_SCHEMA_VERSION
from amaal_intelligence.postgres import PostgresIntelligenceStore


def build_seller_snapshots(rows: list[dict[str, Any]], snapshot_date: str | None = None) -> list[dict[str, Any]]:
    as_of = snapshot_date or date.today().isoformat()
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        seller = str(row.get("seller_user_id") or "")
        if not seller:
            continue
        item = grouped.setdefault(seller, {
            "seller_user_id": seller,
            "region_id": row.get("region_id"),
            "team_id": row.get("team_id"),
            "units_7d": 0.0,
            "units_28d": 0.0,
            "units_56d": 0.0,
            "revenue_28d": 0.0,
        })
        days_old = max(0, (_to_date(as_of) - _to_date(str(row["date"])[:10])).days)
        units = float(row.get("units", 0) or 0)
        revenue = float(row.get("revenue", 0) or 0)
        if days_old < 7: item["units_7d"] += units
        if days_old < 28:
            item["units_28d"] += units
            item["revenue_28d"] += revenue
        if days_old < 56: item["units_56d"] += units
    return [
        {
            "snapshot_date": as_of,
            "entity_type": "SELLER",
            "entity_id": item["seller_user_id"],
            "region_id": item["region_id"],
            "team_id": item["team_id"],
            "features": {k: v for k, v in item.items() if k not in {"seller_user_id", "region_id", "team_id"}},
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
        }
        for item in grouped.values()
    ]


def _to_date(value: str) -> date:
    return date.fromisoformat(value[:10])


def run_snapshot(organization_id: str) -> int:
    store = PostgresIntelligenceStore()
    store.connect()
    rows = store.fetch_sales_daily(organization_id, 365)
    snapshots = build_seller_snapshots(rows)
    conn = store._conn
    if conn is None:
        return 0
    with conn.cursor() as cur:
        for item in snapshots:
            cur.execute(
                """
                insert into public.ml_feature_snapshots(
                    organization_id,snapshot_date,entity_type,entity_id,region_id,team_id,
                    feature_schema_version,features,source_freshness_at
                ) values (%s,%s,%s,%s,%s,%s,%s,%s::jsonb,now())
                on conflict (organization_id,snapshot_date,entity_type,entity_id,feature_schema_version)
                do update set region_id=excluded.region_id,team_id=excluded.team_id,features=excluded.features,source_freshness_at=now()
                """,
                (organization_id,item["snapshot_date"],item["entity_type"],item["entity_id"],item["region_id"],item["team_id"],item["feature_schema_version"],json.dumps(item["features"])),
            )
    conn.commit()
    return len(snapshots)


if __name__ == "__main__":
    organization_id = os.getenv("AMAAL_INTELLIGENCE_ORGANIZATION_ID", "").strip()
    if not organization_id:
        raise SystemExit("AMAAL_INTELLIGENCE_ORGANIZATION_ID is required.")
    print(run_snapshot(organization_id))

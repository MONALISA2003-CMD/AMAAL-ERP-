"""Optional Postgres adapter for Stage 9 batch jobs.

The intelligence service reads only derived reporting models and writes only ML-derived tables.
It must use a dedicated read/write credential for these schemas in production; it never receives
the application's unrestricted transactional connection string from the browser.
"""
from __future__ import annotations

import os
from typing import Any


class PostgresIntelligenceStore:
    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or os.getenv("AMAAL_INTELLIGENCE_DATABASE_URL", "")
        self._conn = None

    def connect(self) -> Any:
        if not self.dsn:
            raise RuntimeError("AMAAL_INTELLIGENCE_DATABASE_URL is required for database-backed Stage 9 jobs.")
        try:
            import psycopg
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("psycopg is required for database-backed Stage 9 jobs.") from exc
        self._conn = psycopg.connect(self.dsn, options="-c statement_timeout=8000 -c lock_timeout=3000")
        with self._conn.cursor() as cur:
            cur.execute("set transaction read write")
        return self._conn

    def fetch_sales_daily(self, organization_id: str, days: int = 365) -> list[dict[str, Any]]:
        if self._conn is None:
            self.connect()
        with self._conn.cursor() as cur:
            cur.execute(
                """
                select sale_date::text, seller_user_id::text, region_id::text, team_id::text,
                       units::float8 as units, revenue::float8 as revenue
                from public.read_model_sales_daily
                where organization_id=%s and sale_date >= current_date - (%s::int - 1)
                order by sale_date asc
                """,
                (organization_id, days),
            )
            return [
                {"date": row[0], "seller_user_id": row[1], "region_id": row[2], "team_id": row[3], "units": row[4], "revenue": row[5]}
                for row in cur.fetchall()
            ]

    def upsert_prediction(self, payload: dict[str, Any]) -> None:
        if self._conn is None:
            self.connect()
        with self._conn.cursor() as cur:
            cur.execute(
                """
                insert into public.ml_predictions(
                    organization_id, model_key, model_version, prediction_kind, entity_type, entity_id,
                    region_id, team_id, seller_user_id, product_variant_id, as_of_date,
                    status, value, confidence, explanation, feature_schema_version, governance_version
                ) values (%(organization_id)s,%(model_key)s,%(model_version)s,%(prediction_kind)s,%(entity_type)s,%(entity_id)s,
                          %(region_id)s,%(team_id)s,%(seller_user_id)s,%(product_variant_id)s,%(as_of_date)s,
                          %(status)s,%(value)s::jsonb,%(confidence)s,%(explanation)s::jsonb,%(feature_schema_version)s,%(governance_version)s)
                on conflict (organization_id, model_key, model_version, prediction_kind, entity_type, entity_id, as_of_date)
                do update set status=excluded.status, value=excluded.value, confidence=excluded.confidence,
                              explanation=excluded.explanation, feature_schema_version=excluded.feature_schema_version,
                              governance_version=excluded.governance_version, updated_at=now()
                """,
                payload,
            )
        self._conn.commit()

    def record_artifact(self, payload: dict[str, Any]) -> None:
        if self._conn is None:
            self.connect()
        with self._conn.cursor() as cur:
            cur.execute(
                """
                insert into public.ml_model_artifacts(
                    organization_id,model_registry_id,artifact_uri,artifact_sha256,manifest_sha256,
                    artifact_format,feature_schema_version,dataset_hash,code_version,dependency_lock_hash
                ) values (%(organization_id)s,%(model_registry_id)s,%(artifact_uri)s,%(artifact_sha256)s,%(manifest_sha256)s,
                          %(artifact_format)s,%(feature_schema_version)s,%(dataset_hash)s,%(code_version)s,%(dependency_lock_hash)s)
                on conflict (model_registry_id,artifact_sha256) do nothing
                """, payload,
            )
        self._conn.commit()

    def record_monitoring(self, payload: dict[str, Any]) -> None:
        if self._conn is None:
            self.connect()
        with self._conn.cursor() as cur:
            cur.execute(
                """
                insert into public.ml_prediction_monitoring(
                    organization_id,model_key,model_version,observed_date,sample_size,feature_drift,
                    prediction_drift,label_drift,performance_metrics,calibration_metrics,slice_metrics,
                    data_freshness_seconds,status
                ) values (%(organization_id)s,%(model_key)s,%(model_version)s,%(observed_date)s,%(sample_size)s,%(feature_drift)s::jsonb,
                          %(prediction_drift)s::jsonb,%(label_drift)s::jsonb,%(performance_metrics)s::jsonb,%(calibration_metrics)s::jsonb,
                          %(slice_metrics)s::jsonb,%(data_freshness_seconds)s,%(status)s)
                on conflict (organization_id,model_key,model_version,observed_date) do update set
                  sample_size=excluded.sample_size,feature_drift=excluded.feature_drift,prediction_drift=excluded.prediction_drift,
                  label_drift=excluded.label_drift,performance_metrics=excluded.performance_metrics,calibration_metrics=excluded.calibration_metrics,
                  slice_metrics=excluded.slice_metrics,data_freshness_seconds=excluded.data_freshness_seconds,status=excluded.status
                """, payload,
            )
        self._conn.commit()

"""Bounded internal HTTP service for governed Stage 9 inference."""
from __future__ import annotations

import hmac
import json
import os
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .pipeline import IntelligenceEngine

ENGINE = IntelligenceEngine()
INTERNAL_TOKEN = os.getenv("AMAAL_INTELLIGENCE_INTERNAL_TOKEN", "")
MAX_CONCURRENT = max(1, min(int(os.getenv("AMAAL_INTELLIGENCE_MAX_CONCURRENCY", "16")), 64))
INFERENCE_SLOTS = threading.BoundedSemaphore(MAX_CONCURRENT)


def _authorized(handler: BaseHTTPRequestHandler) -> bool:
    if not INTERNAL_TOKEN:
        return False
    presented = handler.headers.get("authorization", "")
    expected = f"Bearer {INTERNAL_TOKEN}"
    return hmac.compare_digest(presented.encode(), expected.encode())


def _json(handler: BaseHTTPRequestHandler, status: int, value: Any) -> None:
    payload = json.dumps(value, separators=(",", ":")).encode()
    request_id = handler.headers.get("x-request-id") or str(uuid.uuid4())
    handler.send_response(status)
    handler.send_header("content-type", "application/json")
    handler.send_header("cache-control", "no-store")
    handler.send_header("x-request-id", request_id)
    handler.send_header("content-length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class Handler(BaseHTTPRequestHandler):
    server_version = "AmaalIntelligence/9.2"

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            _json(self, 200, {"ok": True, "service": "amaal-intelligence", "featureSchemaVersion": "9.1"})
            return
        if self.path == "/ready":
            _json(self, 200, {"ok": True, "service": "amaal-intelligence", "mode": os.getenv("AMAAL_INTELLIGENCE_MODE", "SHADOW_ONLY")})
            return
        if self.path == "/v1/intelligence/status":
            if not _authorized(self):
                _json(self, 401, {"error": "UNAUTHORIZED"})
                return
            _json(self, 200, {"ok": True, "mode": os.getenv("AMAAL_INTELLIGENCE_MODE", "SHADOW_ONLY"), "featureSchemaVersion": "9.1", "message": "No model is activated automatically."})
            return
        _json(self, 404, {"error": "NOT_FOUND"})

    def do_POST(self) -> None:  # noqa: N802
        if not _authorized(self):
            _json(self, 401, {"error": "UNAUTHORIZED"})
            return
        if not INFERENCE_SLOTS.acquire(blocking=False):
            _json(self, 429, {"error": "INTELLIGENCE_BUSY"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > 1_000_000:
                _json(self, 413, {"error": "PAYLOAD_TOO_LARGE"})
                return
            payload = json.loads(self.rfile.read(length))
            path = self.path
            if path == "/v1/intelligence/forecast":
                _json(self, 200, ENGINE.forecast(payload.get("daily", []), int(payload.get("horizonDays", 7))))
                return
            if path == "/v1/intelligence/aging-risk":
                _json(self, 200, ENGINE.aging_risk_baseline(payload))
                return
            if path == "/v1/intelligence/anomalies":
                _json(self, 200, ENGINE.anomalies(payload.get("daily", [])))
                return
            if path == "/v1/intelligence/recovery-priority":
                from .pipeline import recovery_priority
                _json(self, 200, {"status": "SHADOW", "items": recovery_priority(payload.get("cases", []))})
                return
            if path == "/v1/intelligence/stock-optimization":
                from .pipeline import stock_optimization
                _json(self, 200, {"status": "SHADOW", "items": stock_optimization(payload.get("products", []), int(payload.get("horizonDays", 28)))})
                return
            _json(self, 404, {"error": "NOT_FOUND"})
        except (TypeError, ValueError, json.JSONDecodeError):
            _json(self, 400, {"error": "INVALID_REQUEST"})
        except Exception:
            _json(self, 500, {"error": "INTELLIGENCE_FAILURE"})
        finally:
            INFERENCE_SLOTS.release()

    def log_message(self, *_args: Any) -> None:
        return


def run() -> None:
    host = os.getenv("AMAAL_INTELLIGENCE_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8091"))
    server = ThreadingHTTPServer((host, port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    run()

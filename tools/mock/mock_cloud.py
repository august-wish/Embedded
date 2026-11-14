#!/usr/bin/env python3
"""Mock Cloud + read API (stdlib only) for testing Gateway upload and Dashboard readback.

The ROUTES BELOW ARE MOCK-ONLY. The real cloud platform and API are decision D-04 (open).
The JSON bodies follow Interface Contract v0.2 (cloud.telemetry in, dashboard.latest out),
so a dashboard built against this only needs its base URL/auth swapped later.

  POST /api/telemetry          body: cloud.telemetry | cloud.gateway_telemetry -> 201 stored / 200 duplicate / 400 error
  POST /api/events             body: system.event (dedup by event_id)
  GET  /api/health
  GET  /api/sources            latest envelope for every source (NODE_01, NODE_02, GW_01 ...)
  GET  /api/latest?source=NODE_01
  GET  /api/history?source=NODE_01&limit=50     newest first
  GET  /api/records/<record_id>
  GET  /api/events

Example:
  py tools/mock/mock_cloud.py --port 8080 --store mock_cloud_data.jsonl
"""

import argparse
import json
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import smartcane_codec as sc  # noqa: F401  (also puts the validator on sys.path)
import candidate_validator as cv


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class Store:
    def __init__(self, path: str = "", fresh_s: float = 10.0, stale_s: float = 60.0):
        self.lock = threading.Lock()
        self.records = {}   # record_id -> record (insertion ordered)
        self.events = {}    # event_id -> event
        self.latest = {}    # source_id -> (record, monotonic_ingest_time)
        self.fresh_s, self.stale_s = fresh_s, stale_s
        self.path = path
        if path:
            try:
                with open(path, encoding="utf-8") as f:
                    for line in f:
                        self._insert(json.loads(line), persist=False)
            except FileNotFoundError:
                pass

    def _insert(self, rec: dict, persist: bool = True) -> str:
        kind = rec["kind"]
        if kind == "system.event":
            if rec["event_id"] in self.events:
                return "duplicate"
            self.events[rec["event_id"]] = rec
        else:
            if rec["record_id"] in self.records:
                return "duplicate"
            self.records[rec["record_id"]] = rec
            self.latest[rec["source_id"]] = (rec, time.monotonic())
        if persist and self.path:
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
        return "stored"

    def add(self, rec: dict) -> str:
        cv.validate_logical(rec.get("kind", ""), rec)
        rec = dict(rec, cloud_ingested_at_utc=utc_now())  # server-generated, never the sample time
        with self.lock:
            return self._insert(rec)

    def envelope(self, source: str):
        with self.lock:
            item = self.latest.get(source)
        if not item:
            return None
        rec, t = item
        age = time.monotonic() - t
        fresh = "fresh" if age <= self.fresh_s else "stale" if age <= self.stale_s else "offline"
        if rec["kind"] == "cloud.telemetry":
            measurements = {k: v for k, v in rec["readings"].items()}
        else:
            measurements = rec["readings"]
        return {
            "schema_version": 1,
            "gateway_id": rec["gateway_id"],
            "source_id": rec["source_id"],
            "origin_kind": rec["origin_kind"],
            "latest_record_id": rec["record_id"],
            "source_boot_id": rec.get("source_boot_id") or "UNKNOWN",
            "source_seq": rec.get("source_seq"),
            "source_sample_uptime_ms": rec.get("source_sample_uptime_ms"),
            "gateway_received_at_utc": rec.get("gateway_received_at_utc"),
            "cloud_ingested_at_utc": rec["cloud_ingested_at_utc"],
            "measurements": measurements,
            "validity": rec.get("validity"),
            "freshness": fresh,          # mock thresholds from --fresh-s/--stale-s (TBD, decision D-03)
            "age_s": round(age, 1),
        }

    def history(self, source: str, limit: int):
        with self.lock:
            rows = [r for r in self.records.values() if r["source_id"] == source]
        return rows[::-1][:limit]


def make_handler(store: Store):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):  # quieter console
            pass

        def _send(self, code: int, body):
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")  # lets a browser dashboard call it
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()

        def do_POST(self):
            if self.path not in ("/api/telemetry", "/api/events"):
                return self._send(404, {"error": "not found"})
            try:
                n = int(self.headers.get("Content-Length", 0))
                rec = json.loads(self.rfile.read(n))
                status = store.add(rec)
            except (ValueError, cv.CandidateValidationError) as exc:
                return self._send(400, {"error": str(exc)})
            rid = rec.get("record_id") or rec.get("event_id")
            self._send(201 if status == "stored" else 200, {"status": status, "id": rid})

        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            q = urllib.parse.parse_qs(u.query)
            path = u.path.rstrip("/")
            if path == "/api/health":
                return self._send(200, {"status": "ok", "records": len(store.records), "events": len(store.events)})
            if path == "/api/sources":
                with store.lock:
                    names = list(store.latest)
                return self._send(200, [store.envelope(s) for s in names])
            if path == "/api/latest":
                env = store.envelope(q.get("source", [""])[0])
                return self._send(200, env) if env else self._send(404, {"error": "no data for source"})
            if path == "/api/history":
                limit = int(q.get("limit", ["50"])[0])
                return self._send(200, store.history(q.get("source", [""])[0], limit))
            if path.startswith("/api/records/"):
                rec = store.records.get(urllib.parse.unquote(path[len("/api/records/"):]))
                return self._send(200, rec) if rec else self._send(404, {"error": "unknown record_id"})
            if path == "/api/events":
                return self._send(200, list(store.events.values()))
            self._send(404, {"error": "not found"})

    return Handler


def serve(port: int, host: str = "127.0.0.1", store: Store = None) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer((host, port), make_handler(store or Store()))
    return server


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 so a real ESP32 on the same Wi-Fi can POST here")
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--store", default="", help="JSON-lines file to persist records between runs")
    p.add_argument("--fresh-s", type=float, default=10.0)
    p.add_argument("--stale-s", type=float, default=60.0)
    a = p.parse_args()
    server = serve(a.port, a.host, Store(a.store, a.fresh_s, a.stale_s))
    print(f"mock cloud on http://{a.host}:{a.port}  (MOCK API, not the approved cloud)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

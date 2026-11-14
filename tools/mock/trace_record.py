#!/usr/bin/env python3
"""Trace ONE message through the system: Node log -> Gateway log -> Cloud -> (Dashboard).

Evidence tool for test H08 (physical reading traced end to end). It checks the same
(source_id, seq) at every stage and prints PASS / FAIL / NOT CHECKED. The dashboard stage
is always NOT CHECKED: take a screenshot showing the same seq/record_id yourself.

Example:
  py tools/mock/trace_record.py --source NODE_01 --seq 12 --node-log node.jsonl --gateway-log gateway.jsonl
"""

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request


def read_jsonl(path: str):
    if not path:
        return None
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    except FileNotFoundError:
        return []
    return rows


def find_cloud(base: str, source: str, seq: int):
    url = f"{base.rstrip('/')}/api/history?source={urllib.parse.quote(source)}&limit=100000"
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            for rec in json.load(r):
                if rec.get("source_seq") == seq:
                    return rec
    except (urllib.error.URLError, OSError, ValueError):
        return "unreachable"
    return None


def trace(source: str, seq: int, node_rows, gw_rows, cloud_url: str) -> list:
    out = []
    if node_rows is None:
        out.append(("node log", "NOT CHECKED", "no --node-log given"))
    else:
        hit = [r for r in node_rows if r.get("source_id") == source and r.get("seq") == seq]
        sent = [r for r in hit if r["event"] == "sent"]
        acked = [r for r in hit if r["event"] == "acked"]
        out.append(("node log", "PASS" if sent else "FAIL",
                    f"sent {len(sent)}x" + (f", acked {acked[0]['status']}" if acked else ", no ACK logged")))
    if gw_rows is None:
        out.append(("gateway log", "NOT CHECKED", "no --gateway-log given"))
    else:
        hit = [r for r in gw_rows if r.get("source_id") == source and r.get("seq") == seq and r.get("event") == "rx"]
        acc = [r for r in hit if r.get("ack") == "accepted"]
        ups = [r for r in gw_rows if r.get("source_id") == source and r.get("seq") == seq and r.get("record_id")]
        rid = (acc[0].get("record_id") if acc else None) or (ups[0]["record_id"] if ups else "not logged")
        out.append(("gateway log", "PASS" if acc else "FAIL",
                    f"received {len(hit)}x, accepted {len(acc)}x" + (f", record_id {rid}" if acc else "")))
    rec = find_cloud(cloud_url, source, seq) if cloud_url else None
    if not cloud_url:
        out.append(("cloud record", "NOT CHECKED", "no --cloud given"))
    elif rec == "unreachable":
        out.append(("cloud record", "FAIL", "cloud unreachable"))
    elif rec is None:
        out.append(("cloud record", "FAIL", "no record with this seq"))
    else:
        out.append(("cloud record", "PASS",
                    f"{rec['record_id']} ingested {rec['cloud_ingested_at_utc']} distance_cm={rec['readings'].get('distance_cm')}"))
    out.append(("dashboard", "NOT CHECKED", "screenshot must show the same seq / record_id"))
    return out


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", required=True, help="e.g. NODE_01")
    p.add_argument("--seq", type=int, required=True)
    p.add_argument("--node-log", default="")
    p.add_argument("--gateway-log", default="")
    p.add_argument("--cloud", default="http://127.0.0.1:8080")
    a = p.parse_args()
    rows = trace(a.source, a.seq, read_jsonl(a.node_log), read_jsonl(a.gateway_log), a.cloud)
    print(f"trace {a.source} seq={a.seq}")
    for stage, status, note in rows:
        print(f"  {status:<11} {stage:<13} {note}")
    return 1 if any(s == "FAIL" for _, s, _ in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())

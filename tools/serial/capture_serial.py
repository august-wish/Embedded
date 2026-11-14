#!/usr/bin/env python3
"""Capture a board's Serial output as test evidence.

Reads lines like `TX node=1 seq=125 dist_cm=46.2 hex=...` (see docs/interface/SERIAL_LOG_FORMAT.md),
saves the raw text and a JSON-lines log that tools/mock/trace_record.py understands.
Read-only: it never writes to the board and never flashes anything.

  py tools/serial/capture_serial.py --list-ports
  py tools/serial/capture_serial.py --port COM5 --role node --out node.jsonl --raw node_raw.txt
  py tools/serial/capture_serial.py --from-file tools/serial/sample_node.txt --role node --out node.jsonl

Live capture needs pyserial:  py -m pip install pyserial   (replay from a file does not).
Close the Arduino/PlatformIO Serial Monitor first: only one program can hold the COM port.
"""

import argparse
import json
import pathlib
import re
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "mock"))
import smartcane_codec as sc  # noqa: E402

LINE = re.compile(r"^(TX|ACK|RX|UP)\b(.*)$")
ROLE_KINDS = {"node": {"TX", "ACK"}, "gateway": {"RX", "UP"}, "any": {"TX", "ACK", "RX", "UP"}}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _dist(value):
    if value is None:
        return None
    if value.lower() == "invalid":
        return None
    return float(value)


def check_hex(hex_text: str, node: int, seq: int) -> str:
    """Decode the printed frame with the validator and compare node/seq."""
    try:
        d = sc.decode_telemetry(bytes.fromhex(hex_text))
    except (ValueError, sc.CandidateValidationError) as exc:
        return f"invalid: {exc}"
    if d["node_id_numeric"] != node or d["seq"] != seq:
        return f"MISMATCH: hex says node={d['node_id_numeric']} seq={d['seq']}"
    return "match"


def parse_line(line: str):
    """Return (kind, entry) for a recognised line, or None. Never raises on bad input."""
    m = LINE.match(line.strip())
    if not m:
        return None
    kind, rest = m.groups()
    kv = {}
    for tok in rest.split():
        if "=" in tok:
            k, v = tok.split("=", 1)
            kv[k] = v
    try:
        node, seq = int(kv["node"]), int(kv["seq"])
    except (KeyError, ValueError):
        return None
    base = {"source_id": sc.node_name(node), "node_id": node, "seq": seq}
    if "boot" in kv:
        base["boot_id"] = kv["boot"]
    try:
        if kind == "TX":
            entry = {"event": "sent", **base, "attempt": int(kv.get("attempt", 0)),
                     "distance_cm": _dist(kv.get("dist_cm"))}
        elif kind == "ACK":
            entry = {"event": "acked", **base, "status": kv.get("status", "accepted")}
        elif kind == "RX":
            entry = {"event": "rx", **base, "ack": kv.get("ack", "accepted"),
                     "distance_cm": _dist(kv.get("dist_cm"))}
        else:  # UP
            entry = {"event": "upload", **base, "status": kv.get("status", "unknown")}
    except ValueError:
        return None
    if "record_id" in kv:
        entry["record_id"] = kv["record_id"]
    if "hex" in kv:
        entry["hex"] = kv["hex"]
        entry["hex_check"] = check_hex(kv["hex"], node, seq)
    return kind, entry


def process(lines, role: str, out_path: str = "", raw_path: str = "", echo: bool = True) -> dict:
    allowed = ROLE_KINDS[role]
    stats = {"lines": 0, "logged": 0, "ignored": 0, "hex_problems": 0}
    out = open(out_path, "a", encoding="utf-8") if out_path else None
    raw = open(raw_path, "a", encoding="utf-8") if raw_path else None
    try:
        for line in lines:
            line = line.rstrip("\r\n")
            if not line.strip():
                continue
            stats["lines"] += 1
            ts = now_iso()
            if raw:
                raw.write(f"{ts} {line}\n")
                raw.flush()
            parsed = parse_line(line)
            if not parsed or parsed[0] not in allowed:
                stats["ignored"] += 1
                continue
            entry = {"host_time_utc": ts, **parsed[1]}
            if entry.get("hex_check", "match") != "match":
                stats["hex_problems"] += 1
            stats["logged"] += 1
            if out:
                out.write(json.dumps(entry) + "\n")
                out.flush()
            if echo:
                flag = "" if entry.get("hex_check", "match") == "match" else f"  !! hex {entry['hex_check']}"
                print(f"{parsed[0]:<3} {entry['source_id']} seq={entry['seq']}{flag}")
    finally:
        if out:
            out.close()
        if raw:
            raw.close()
    return stats


def serial_lines(port: str, baud: int, duration: float):
    try:
        import serial  # pyserial
    except ImportError:
        raise SystemExit("pyserial missing. Install it with:  py -m pip install pyserial")
    try:
        ser = serial.Serial(port, baud, timeout=0.5)
    except serial.SerialException as exc:
        raise SystemExit(f"cannot open {port}: {exc}\n(Is another program, e.g. Serial Monitor, using it?)")
    end = time.monotonic() + duration if duration else None
    try:
        while end is None or time.monotonic() < end:
            raw = ser.readline()
            if raw:
                yield raw.decode("utf-8", errors="replace")
    finally:
        ser.close()


def list_ports() -> int:
    try:
        from serial.tools import list_ports as lp
    except ImportError:
        print("pyserial missing. Install it with:  py -m pip install pyserial")
        return 1
    ports = list(lp.comports())
    for p in ports:
        print(f"{p.device}  {p.description}")
    if not ports:
        print("no serial ports found (is the board plugged in with a data USB cable?)")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--list-ports", action="store_true")
    p.add_argument("--port", help="e.g. COM5")
    p.add_argument("--baud", type=int, default=115200)
    p.add_argument("--from-file", help="replay a saved text file instead of a live port")
    p.add_argument("--role", choices=sorted(ROLE_KINDS), default="any", help="which lines to keep")
    p.add_argument("--out", default="", help="JSON-lines log for trace_record.py")
    p.add_argument("--raw", default="", help="timestamped raw text copy (also good evidence)")
    p.add_argument("--duration", type=float, default=0, help="stop after N seconds (0 = until Ctrl+C)")
    a = p.parse_args()
    if a.list_ports:
        return list_ports()
    if not a.from_file and not a.port:
        p.error("give --port, --from-file or --list-ports")
    try:
        if a.from_file:
            with open(a.from_file, encoding="utf-8") as f:
                stats = process(f, a.role, a.out, a.raw)
        else:
            stats = process(serial_lines(a.port, a.baud, a.duration), a.role, a.out, a.raw)
    except KeyboardInterrupt:
        print("stopped")
        return 0
    print(f"lines={stats['lines']} logged={stats['logged']} ignored={stats['ignored']} "
          f"hex_problems={stats['hex_problems']}")
    return 1 if stats["hex_problems"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Mock Gateway: receives candidate telemetry frames (UDP stands in for ESP-NOW), replies
with an application ACK, de-duplicates, and uploads `cloud.telemetry` JSON to a cloud endpoint.

If the cloud is unreachable, records are kept in a bounded buffer and replayed in order
(store-and-forward, course item E4). Buffer size is a mock default (decision D-03 is open).

Example:
  py tools/mock/mock_gateway.py --listen 127.0.0.1:5001 --cloud http://127.0.0.1:8080
"""

import argparse
import collections
import json
import socket
import struct
import time
import urllib.error
import urllib.request

import smartcane_codec as sc


class Gateway:
    """Pure logic (no sockets) so it can be unit-tested."""

    def __init__(self, gateway_id: int = 1):
        self.gateway_id = gateway_id
        self.gw_name = sc.gateway_name(gateway_id)
        self.t0 = time.monotonic()
        self.seen = set()  # (node, boot, seq); mock keeps all, real firmware needs a bounded window
        self.counters = {"accepted": 0, "duplicate": 0, "rejected": 0, "dropped": 0}

    def uptime_ms(self) -> int:
        return int((time.monotonic() - self.t0) * 1000) & 0xFFFFFFFF

    def _ack(self, node, boot, seq, code) -> bytes:
        return sc.encode_ack(node, boot, seq, code, self.gateway_id, self.uptime_ms())

    def handle_frame(self, frame: bytes):
        """Return (ack_bytes_or_None, cloud_record_or_None, log_entry)."""
        rx_ms = self.uptime_ms()
        try:
            d = sc.decode_telemetry(frame)
        except sc.CandidateValidationError as exc:
            # Header parseable but payload not accepted -> ACK 'rejected'. Otherwise stay silent.
            if len(frame) >= 14:
                magic, _ver, typ, node, boot, seq = struct.unpack_from("<HBBHII", frame)
                if magic == sc.MAGIC and typ == 1:
                    self.counters["rejected"] += 1
                    return (self._ack(node, boot, seq, sc.ACK_REJECTED), None,
                            {"event": "rx", "ack": "rejected", "error": str(exc), "hex": sc.to_hex(frame)})
            self.counters["dropped"] += 1
            return None, None, {"event": "rx", "ack": None, "error": str(exc), "hex": sc.to_hex(frame)}

        node, boot, seq = d["node_id_numeric"], d["boot_nonce"], d["seq"]
        src, boot_id = sc.node_name(node), sc.boot_name(boot)
        base = {"event": "rx", "source_id": src, "boot_id": boot_id, "seq": seq, "hex": sc.to_hex(frame)}
        key = (node, boot, seq)
        if key in self.seen:
            self.counters["duplicate"] += 1
            return self._ack(node, boot, seq, sc.ACK_DUPLICATE), None, {**base, "ack": "duplicate"}
        self.seen.add(key)
        self.counters["accepted"] += 1
        record = {
            "schema_version": 1,
            "kind": "cloud.telemetry",
            "record_id": f"{self.gw_name}:{src}:{boot_id}:{seq}",
            "gateway_id": self.gw_name,
            "source_id": src,
            "origin_kind": d["origin_kind"],
            "source_boot_id": boot_id,
            "source_seq": seq,
            "source_sample_uptime_ms": d["sample_uptime_ms"],
            "gateway_received_at_utc": None,  # no trusted UTC on the Gateway yet (contract: never fabricate)
            "gateway_received_uptime_ms": rx_ms,
            "readings": {"distance_cm": d["distance_cm"], "accel_g": d["accel_g"], "gyro_dps": d["gyro_dps"]},
            "validity": {"distance": d["distance_valid"], "motion": d["motion_valid"]},
        }
        return (self._ack(node, boot, seq, sc.ACK_ACCEPTED), record,
                {**base, "ack": "accepted", "record_id": record["record_id"]})


class Uploader:
    """HTTP POST with a bounded replay buffer."""

    def __init__(self, base_url: str, capacity: int = 1000):
        self.url = base_url.rstrip("/") + "/api/telemetry"
        self.buffer = collections.deque()
        self.capacity = capacity
        self.overflow_dropped = 0

    def _post(self, record: dict) -> bool:
        req = urllib.request.Request(self.url, data=json.dumps(record).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=2) as r:
                return r.status in (200, 201)
        except urllib.error.HTTPError as exc:
            # 400 = permanently bad record: do not retry forever
            return exc.code == 400
        except (urllib.error.URLError, OSError):
            return False

    def submit(self, record: dict) -> str:
        self.buffer.append(record)
        if len(self.buffer) > self.capacity:
            self.buffer.popleft()
            self.overflow_dropped += 1
        return self.flush()

    def flush(self) -> str:
        sent = 0
        while self.buffer:
            if not self._post(self.buffer[0]):
                return f"cloud_down buffered={len(self.buffer)}"
            self.buffer.popleft()
            sent += 1
        return f"uploaded={sent}" if sent else "idle"


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--listen", default="127.0.0.1:5001")
    p.add_argument("--cloud", default="http://127.0.0.1:8080")
    p.add_argument("--gateway-id", type=int, default=1)
    p.add_argument("--buffer", type=int, default=1000)
    p.add_argument("--log", default="", help="write JSON-lines evidence log here")
    p.add_argument("--duration", type=float, default=0, help="stop after N seconds (0 = run until Ctrl+C)")
    a = p.parse_args()

    host, port = a.listen.rsplit(":", 1)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((host, int(port)))
    sock.settimeout(0.5)
    gw, up = Gateway(a.gateway_id), Uploader(a.cloud, a.buffer)
    logf = open(a.log, "a", encoding="utf-8") if a.log else None
    print(f"mock gateway {gw.gw_name} listening on {a.listen}, cloud={a.cloud}")
    end = time.monotonic() + a.duration if a.duration else None
    try:
        while end is None or time.monotonic() < end:
            try:
                frame, addr = sock.recvfrom(512)
            except socket.timeout:
                if up.buffer:
                    up.flush()  # keep trying to replay while idle
                continue
            ack, record, entry = gw.handle_frame(frame)
            if ack:
                sock.sendto(ack, addr)
            status = up.submit(record) if record else "-"
            entry.update(gateway_uptime_ms=gw.uptime_ms(), upload=status)
            print(f"{entry.get('source_id', '?')} seq={entry.get('seq', '?')} ack={entry['ack']} {status}")
            if logf:
                logf.write(json.dumps(entry) + "\n")
                logf.flush()
    except KeyboardInterrupt:
        pass
    print(f"counters={gw.counters} still_buffered={len(up.buffer)} overflow_dropped={up.overflow_dropped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

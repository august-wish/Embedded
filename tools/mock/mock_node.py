#!/usr/bin/env python3
"""Mock Sensor Node: sends candidate telemetry frames to a Gateway over UDP.

UDP on localhost stands in for ESP-NOW. Use it to test a Gateway/dashboard before real
boards work. Retry/ACK values below are mock defaults, NOT agreed numbers (decision D-03).

Example:
  py tools/mock/mock_node.py --gateway 127.0.0.1:5001 --count 20 --drop-rate 0.2
"""

import argparse
import json
import random
import socket
import time

import smartcane_codec as sc


def parse_addr(text: str):
    host, port = text.rsplit(":", 1)
    return host, int(port)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--gateway", default="127.0.0.1:5001", help="Gateway UDP address")
    p.add_argument("--node-id", type=int, default=1)
    p.add_argument("--origin", choices=("physical", "simulated"), default="simulated",
                   help="mock data is 'simulated' by default so it is never confused with real readings")
    p.add_argument("--boot-nonce", type=lambda s: int(s, 0), default=0x1A2B3C4D)
    p.add_argument("--count", type=int, default=20, help="number of messages (0 = forever)")
    p.add_argument("--interval", type=float, default=0.5, help="seconds between samples")
    p.add_argument("--start-seq", type=int, default=1)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--ack-timeout", type=float, default=0.3)
    p.add_argument("--max-retries", type=int, default=3)
    p.add_argument("--drop-rate", type=float, default=0.0, help="simulate radio loss (0..1) per transmission")
    p.add_argument("--invalid-every", type=int, default=0, help="every Nth sample has an INVALID distance")
    p.add_argument("--dup-every", type=int, default=0, help="every Nth frame is sent twice (duplicate test)")
    p.add_argument("--corrupt-every", type=int, default=0, help="every Nth frame has a bad magic (reject test)")
    p.add_argument("--log", default="", help="write JSON-lines evidence log here")
    p.add_argument("--print-hex", action="store_true", help="print each frame as hex (compare with real firmware)")
    a = p.parse_args()

    rng = random.Random(a.seed)
    origin = sc.ORIGIN_PHYSICAL if a.origin == "physical" else sc.ORIGIN_SIMULATED
    gw = parse_addr(a.gateway)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("127.0.0.1", 0))
    logf = open(a.log, "a", encoding="utf-8") if a.log else None
    t0 = time.monotonic()
    src = sc.node_name(a.node_id)

    def log(**kw):
        if logf:
            logf.write(json.dumps(kw) + "\n")
            logf.flush()

    distance = 80.0
    sent = acked = retries = failed = first_try = 0
    seq = a.start_seq
    n = 0
    while a.count == 0 or n < a.count:
        n += 1
        uptime = int((time.monotonic() - t0) * 1000)
        distance = min(150.0, max(5.0, distance + rng.uniform(-6, 6)))
        invalid = a.invalid_every and n % a.invalid_every == 0
        accel = {"x": round(rng.uniform(-0.05, 0.05), 3), "y": round(rng.uniform(0.1, 0.15), 3),
                 "z": round(rng.uniform(0.95, 1.0), 3)}
        gyro = {"x": round(rng.uniform(-2, 2), 1), "y": round(rng.uniform(-2, 2), 1),
                "z": round(rng.uniform(-2, 2), 1)}
        frame = sc.encode_telemetry(a.node_id, a.boot_nonce, seq, uptime,
                                    None if invalid else round(distance, 1), accel, gyro, origin)
        if a.corrupt_every and n % a.corrupt_every == 0:
            frame = b"\x00\x00" + frame[2:]  # break magic
        copies = 2 if (a.dup_every and n % a.dup_every == 0) else 1
        if a.print_hex:
            print(f"seq={seq:<5} {sc.to_hex(frame)}")
        got_ack = False
        sent += 1
        for attempt in range(a.max_retries + 1):
            for _ in range(copies if attempt == 0 else 1):
                if rng.random() >= a.drop_rate:
                    sock.sendto(frame, gw)
                log(event="sent", source_id=src, node_id=a.node_id, boot_id=sc.boot_name(a.boot_nonce),
                    seq=seq, attempt=attempt, uptime_ms=uptime, invalid_distance=bool(invalid))
            deadline = time.monotonic() + a.ack_timeout
            while time.monotonic() < deadline:
                sock.settimeout(max(0.01, deadline - time.monotonic()))
                try:
                    data, _ = sock.recvfrom(512)
                except socket.timeout:
                    break
                try:
                    ack = sc.decode_ack(data)
                except sc.CandidateValidationError:
                    continue
                if ack["seq"] == seq and ack["node_id_numeric"] == a.node_id:
                    got_ack = True
                    log(event="acked", source_id=src, seq=seq, status=ack["status"], attempt=attempt)
                    break
            if got_ack:
                break
            retries += 1 if attempt < a.max_retries else 0
        if got_ack:
            acked += 1
            first_try += 1 if attempt == 0 else 0
        else:
            failed += 1
            log(event="failed", source_id=src, seq=seq)
        seq += 1
        time.sleep(a.interval)

    final = (100.0 * acked / sent) if sent else 0.0
    first = (100.0 * first_try / sent) if sent else 0.0
    print(f"node {src}: sent={sent} acked={acked} failed={failed} retries={retries} "
          f"delivered_after_retries={final:.1f}% first_try={first:.1f}% (mock radio, drop_rate={a.drop_rate})")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Offline, non-authoritative checks for Smart Cane Interface Contract v0.2.

Everything in this file is a PROPOSED candidate. This is not production firmware,
not an API contract, and not evidence that physical components work. The Sensor
Node/Gateway owners must confirm offsets, units, radio compatibility, and ACK
behavior before any candidate becomes APPROVED.

Uses the Python standard library only; works on Windows and Linux.
"""

import argparse
import json
import struct
import sys
from typing import Any


MAGIC = 0x5343
VERSION = 1
TELEMETRY = struct.Struct("<HBBHIIIHhhhhhhBB")
ACK = struct.Struct("<HBBHIIBHI")
assert TELEMETRY.size == 34 and ACK.size == 21

# Independent manually reviewed byte sequences for one illustrative record.
# Candidate numeric Node/Gateway ID=1, boot_nonce=0x1A2B3C4D: NOT provisioned.
GOLDEN_TLM_01 = (
    "43 53 01 01 01 00 4d 3c 2b 1a 7d 00 00 00 f4 f5 01 00 "
    "ce 01 14 00 82 00 d4 03 0b 00 fc ff 06 00 03 00"
)
GOLDEN_ACK_01 = (
    "43 53 01 02 01 00 4d 3c 2b 1a 7d 00 00 00 "
    "00 01 00 0e 94 03 00"
)


class CandidateValidationError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise CandidateValidationError(message)


def is_int(value: Any) -> bool:
    return type(value) is int


def require_field(mapping: dict, key: str, kind: type) -> Any:
    require(key in mapping, f"missing field: {key}")
    value = mapping[key]
    if kind is int:
        require(is_int(value), f"{key} must be integer")
    else:
        require(isinstance(value, kind), f"{key} must be {kind.__name__}")
    return value


def wire_header(magic: int, version: int, msg_type: int, expected: int) -> None:
    require(magic == MAGIC, f"bad magic: 0x{magic:04X}")
    require(version == VERSION, f"unsupported candidate version: {version}")
    require(msg_type == expected, f"wrong candidate message type: {msg_type}")


def decode_telemetry(frame: bytes) -> dict:
    require(len(frame) == 34, f"telemetry needs 34 bytes; received {len(frame)}")
    (magic, version, typ, node, boot, seq, uptime, distance,
     ax, ay, az, gx, gy, gz, flags, origin) = TELEMETRY.unpack(frame)
    wire_header(magic, version, typ, 1)
    require(flags & ~0x03 == 0, f"reserved validity bits set: 0x{flags:02X}")
    require(origin in (0, 1), f"invalid origin_kind: {origin}")
    distance_valid = bool(flags & 1)
    motion_valid = bool(flags & 2)
    require(not (distance_valid and distance == 0xFFFF), "invalid marker with valid distance flag")
    return {
        "kind": "node.telemetry", "schema_version": version, "node_id_numeric": node,
        "boot_nonce": boot, "seq": seq, "sample_uptime_ms": uptime,
        "distance_cm": (distance / 10 if distance_valid else None),
        "accel_g": ({"x": ax / 1000, "y": ay / 1000, "z": az / 1000} if motion_valid else None),
        "gyro_dps": ({"x": gx / 10, "y": gy / 10, "z": gz / 10} if motion_valid else None),
        "distance_valid": distance_valid, "motion_valid": motion_valid,
        "origin_kind": ("physical" if origin == 0 else "simulated"),
    }


def decode_ack(frame: bytes) -> dict:
    require(len(frame) == 21, f"ACK needs 21 bytes; received {len(frame)}")
    magic, version, typ, node, boot, seq, ack_code, gateway, uptime = ACK.unpack(frame)
    wire_header(magic, version, typ, 2)
    require(ack_code in (0, 1, 2), f"unassigned candidate ACK code: {ack_code}")
    return {
        "kind": "node.ack", "schema_version": version, "node_id_numeric": node,
        "boot_nonce": boot, "seq": seq, "ack_code": ack_code,
        "status": ("accepted", "duplicate", "rejected")[ack_code],
        "gateway_id_numeric": gateway, "gateway_uptime_ms": uptime,
        "meaning": "Gateway processing-queue acceptance only; not Cloud/Discord delivery",
    }


def validate_logical(kind: str, obj: dict) -> None:
    """Check minimum proposed semantics, not a finalized Cloud/API schema."""
    require(isinstance(obj, dict), "JSON root must be object")
    require(require_field(obj, "schema_version", int) == 1, "unsupported schema version")
    if kind == "cloud.telemetry":
        require(require_field(obj, "kind", str) == kind, "kind mismatch")
        for key in ("record_id", "gateway_id", "source_id", "source_boot_id"):
            require(bool(require_field(obj, key, str)), f"{key} cannot be empty")
        require_field(obj, "source_seq", int)
        require_field(obj, "source_sample_uptime_ms", int)
        require_field(obj, "gateway_received_uptime_ms", int)
        require(require_field(obj, "origin_kind", str) in ("physical", "simulated"), "bad origin_kind")
        readings = require_field(obj, "readings", dict)
        validity = require_field(obj, "validity", dict)
        for key in ("distance", "motion"):
            require(type(validity.get(key)) is bool, f"validity.{key} must be boolean")
        if not validity["distance"]:
            require(readings.get("distance_cm") is None, "invalid distance cannot masquerade as live numeric")
    elif kind == "cloud.gateway_telemetry":
        require(require_field(obj, "kind", str) == kind, "kind mismatch")
        for key in ("record_id", "gateway_id", "source_id"):
            require(bool(require_field(obj, key, str)), f"{key} cannot be empty")
        require(obj["gateway_id"] == obj["source_id"], "gateway-local source must be gateway_id")
        readings = require_field(obj, "readings", dict)
        for key in ("max30102", "gps", "ldr"):
            require_field(readings, key, dict)
        for key in ("ir_raw", "red_raw"):
            require_field(readings["max30102"], key, int)
        require(type(readings["gps"].get("fix_valid")) is bool, "gps.fix_valid must be bool")
        validate_gps(readings["gps"])
        require_field(readings["ldr"], "adc_raw", int)
    elif kind == "system.event":
        require(require_field(obj, "kind", str) == kind, "kind mismatch")
        for key in ("event_id", "gateway_id", "source_id", "event_type", "severity"):
            require(bool(require_field(obj, key, str)), f"{key} cannot be empty")
        require_field(obj, "gateway_uptime_ms", int)
        validate_gps(require_field(obj, "gps", dict))
    elif kind == "dashboard.latest":
        for key in ("gateway_id", "source_id", "latest_record_id", "source_boot_id"):
            require(bool(require_field(obj, key, str)), f"{key} cannot be empty")
        require(require_field(obj, "origin_kind", str) in ("physical", "simulated"), "bad origin_kind")
        require_field(obj, "measurements", dict)
        # CR-01 (requested by dashboard owner): same seq must be readable at the dashboard.
        require(require_field(obj, "source_seq", int) >= 0, "source_seq must be a nonnegative integer")
        require(require_field(obj, "freshness", str) in
                ("fresh", "stale", "offline", "unknown_clock"), "bad candidate freshness state")
        # Timestamp can be null if no trusted UTC; do not fabricate observation time.
        require("cloud_ingested_at_utc" in obj, "cloud ingestion timestamp must be present on readback")
    else:
        raise CandidateValidationError(f"unsupported logical kind: {kind}")


def validate_gps(gps: dict) -> None:
    require(type(gps.get("fix_valid")) is bool, "gps.fix_valid must be boolean")
    if gps["fix_valid"]:
        lat, lon = gps.get("lat_deg"), gps.get("lon_deg")
        require(type(lat) in (int, float) and -90 <= lat <= 90, "invalid GPS latitude")
        require(type(lon) in (int, float) and -180 <= lon <= 180, "invalid GPS longitude")
    else:
        require(gps.get("lat_deg") is None and gps.get("lon_deg") is None,
                "GPS without fix must not expose stale coordinates as current")


def fixtures() -> tuple[dict, dict, dict, dict]:
    node = {
        "schema_version": 1, "kind": "cloud.telemetry", "record_id": "GW_01:NODE_01:BOOT_A1:125",
        "gateway_id": "GW_01", "source_id": "NODE_01", "source_boot_id": "BOOT_A1",
        "source_seq": 125, "source_sample_uptime_ms": 128500,
        "gateway_received_at_utc": None, "gateway_received_uptime_ms": 234500,
        "origin_kind": "physical",
        "readings": {"distance_cm": 46.2, "accel_g": {"x": 0.02, "y": 0.13, "z": 0.98},
                     "gyro_dps": {"x": 1.1, "y": -0.4, "z": 0.6}},
        "validity": {"distance": True, "motion": True},
    }
    gateway = {
        "schema_version": 1, "kind": "cloud.gateway_telemetry",
        "record_id": "GW_01:GW_01:GWBOOT_3:319", "gateway_id": "GW_01",
        "source_id": "GW_01", "origin_kind": "physical",
        "readings": {
            "max30102": {"ir_raw": 25409, "red_raw": 24100, "bpm": 72, "valid": True},
            "gps": {"lat_deg": 13.7, "lon_deg": 100.5, "fix_valid": True, "fix_age_ms": 1200},
            "ldr": {"adc_raw": 2034, "valid": True},
        },
    }
    event = {
        "schema_version": 1, "kind": "system.event", "event_id": "GW_01:GWBOOT_3:EVENT_001",
        "gateway_id": "GW_01", "source_id": "GW_01", "event_type": "sos_pressed",
        "severity": "critical", "gateway_uptime_ms": 235000,
        "gps": {"fix_valid": False, "fix_age_ms": None, "lat_deg": None, "lon_deg": None},
    }
    latest = {
        "schema_version": 1, "gateway_id": "GW_01", "source_id": "NODE_01",
        "origin_kind": "physical", "latest_record_id": node["record_id"],
        "source_boot_id": "BOOT_A1", "source_seq": 125, "source_sample_uptime_ms": 128500,
        "gateway_received_at_utc": None,
        "cloud_ingested_at_utc": "2026-11-10T07:48:00Z",
        "measurements": {"distance_cm": 46.2}, "freshness": "unknown_clock",
    }
    return node, gateway, event, latest


def run_self_test() -> int:
    passed = 0

    def check(label: str, action, expect_error=False) -> None:
        nonlocal passed
        try:
            action()
        except CandidateValidationError:
            if not expect_error:
                raise
        else:
            if expect_error:
                raise AssertionError(f"expected validation rejection: {label}")
        passed += 1
        print(f"PASS {label}")

    tlm = bytes.fromhex(GOLDEN_TLM_01)
    ack = bytes.fromhex(GOLDEN_ACK_01)
    assert len(tlm) == 34 and len(ack) == 21
    # Encode independently from the hard-coded hex to catch documentation drift.
    produced = TELEMETRY.pack(MAGIC, 1, 1, 1, 0x1A2B3C4D, 125, 128500, 462,
                              20, 130, 980, 11, -4, 6, 3, 0)
    assert produced == tlm, "telemetry golden hex mismatch"
    assert ACK.pack(MAGIC, 1, 2, 1, 0x1A2B3C4D, 125, 0, 1, 234510) == ack
    check("T01 decode physical 34-byte telemetry", lambda: decode_telemetry(tlm))
    check("T02 decode simulated distinct node", lambda: decode_telemetry(
        TELEMETRY.pack(MAGIC, 1, 1, 2, 0x1A2B3C4D, 126, 128510, 500,
                       20, 130, 980, 11, -4, 6, 3, 1)))
    check("T03 absent distance yields None", lambda: assert_invalid_distance(
        TELEMETRY.pack(MAGIC, 1, 1, 1, 0x1A2B3C4D, 127, 128520, 65535,
                       20, 130, 980, 11, -4, 6, 2, 0)))
    check("T04 wrong length rejects", lambda: decode_telemetry(tlm[:-1]), True)
    check("T05 wrong magic rejects", lambda: decode_telemetry(b"\x00\x00" + tlm[2:]), True)
    check("T06 unsupported version rejects", lambda: decode_telemetry(tlm[:2] + b"\x02" + tlm[3:]), True)
    check("T07 unexpected type rejects", lambda: decode_telemetry(tlm[:3] + b"\x02" + tlm[4:]), True)
    check("T08 reserved validity bit rejects", lambda: decode_telemetry(tlm[:32] + b"\x07" + tlm[33:]), True)
    check("T09 unknown origin enum rejects", lambda: decode_telemetry(tlm[:33] + b"\x09"), True)
    check("A01 decode 21-byte ACK accepted", lambda: decode_ack(ack))
    check("A02 ACK duplicate candidate status", lambda: decode_ack(ack[:14] + b"\x01" + ack[15:]))
    check("A03 ACK rejected candidate status", lambda: decode_ack(ack[:14] + b"\x02" + ack[15:]))
    check("A04 unknown ACK code rejects", lambda: decode_ack(ack[:14] + b"\x09" + ack[15:]), True)
    check("A05 malformed ACK length rejects", lambda: decode_ack(ack[:19]), True)

    node, gateway, event, latest = fixtures()
    check("C01 Node raw Cloud envelope", lambda: validate_logical("cloud.telemetry", node))
    check("C02 Gateway raw MAX30102/GPS/LDR", lambda: validate_logical("cloud.gateway_telemetry", gateway))
    check("C03 SOS event without GPS fix", lambda: validate_logical("system.event", event))
    check("C04 Cloud latest with unknown clock", lambda: validate_logical("dashboard.latest", latest))
    bad = {**event, "gps": {"fix_valid": False, "lat_deg": 13.7, "lon_deg": 100.5}}
    check("C05 reject stale GPS claimed with no fix", lambda: validate_logical("system.event", bad), True)
    bad2 = {**node, "readings": {**node["readings"], "distance_cm": 0},
            "validity": {"distance": False, "motion": True}}
    check("C06 reject invalid distance pretending zero", lambda: validate_logical("cloud.telemetry", bad2), True)

    bad3 = {k: v for k, v in latest.items() if k != "source_seq"}
    check("C07 reject dashboard latest without source_seq (CR-01)",
          lambda: validate_logical("dashboard.latest", bad3), True)
    bad4 = {**latest, "source_seq": -1}
    check("C08 reject negative source_seq (CR-01)",
          lambda: validate_logical("dashboard.latest", bad4), True)

    print(f"\n{passed}/{passed} offline candidate checks PASS")
    print("NOT TESTED: radio, MCU serializers, real Cloud writes, Discord delivery, AI/actuator.")
    print("IMPORTANT: little-endian 0x5343 yields bytes 43 53 ('CS'), not ASCII 'SC'.")
    return passed


def assert_invalid_distance(frame: bytes) -> None:
    parsed = decode_telemetry(frame)
    require(parsed["distance_cm"] is None, "invalid distance not converted to None")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--self-test", action="store_true", help="run built-in offline candidate checks")
    mode.add_argument("--decode", choices=("telemetry", "ack"), help="decode a hex candidate frame")
    mode.add_argument("--validate-json", metavar="FILE", help="check a logical JSON fixture")
    parser.add_argument("--hex", default="", help="frame in hexadecimal (required with --decode)")
    parser.add_argument("--kind", choices=("cloud.telemetry", "cloud.gateway_telemetry",
                                           "system.event", "dashboard.latest"),
                        help="logical kind (required with --validate-json)")
    args = parser.parse_args()
    try:
        if args.self_test:
            run_self_test()
        elif args.decode:
            require(bool(args.hex.strip()), "--hex is required with --decode")
            fn = decode_telemetry if args.decode == "telemetry" else decode_ack
            print(json.dumps(fn(bytes.fromhex(args.hex)), ensure_ascii=False, indent=2))
        else:
            require(bool(args.kind), "--kind is required with --validate-json")
            with open(args.validate_json, "r", encoding="utf-8") as f:
                validate_logical(args.kind, json.load(f))
            print(f"PASS candidate logical checks: {args.kind}")
        return 0
    except (CandidateValidationError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

"""Encode/decode helpers for the PROPOSED Smart Cane wire frames (Interface Contract v0.2).

Reuses the struct layouts from tools/validator/candidate_validator.py so the mocks and the
validator can never disagree. Everything here is a CANDIDATE format, not an approved one.
If a field changes (change request), change it in the validator first, then re-run the tests.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "validator"))
import candidate_validator as cv  # noqa: E402

MAGIC = cv.MAGIC
VERSION = cv.VERSION
INVALID_DISTANCE_MM = 0xFFFF

ACK_ACCEPTED, ACK_DUPLICATE, ACK_REJECTED = 0, 1, 2
ORIGIN_PHYSICAL, ORIGIN_SIMULATED = 0, 1


def _i16(value: float, scale: int) -> int:
    n = round(value * scale)
    if not -32768 <= n <= 32767:
        raise ValueError(f"value {value} out of int16 range at scale {scale}")
    return n


def encode_telemetry(node_id: int, boot_nonce: int, seq: int, sample_uptime_ms: int,
                     distance_cm=None, accel_g=None, gyro_dps=None,
                     origin_kind: int = ORIGIN_PHYSICAL) -> bytes:
    """Build the 34-byte telemetry frame. None means 'reading invalid' (never sent as 0)."""
    flags = 0
    if distance_cm is None:
        distance_mm = INVALID_DISTANCE_MM
    else:
        distance_mm = round(distance_cm * 10)
        if not 0 <= distance_mm < INVALID_DISTANCE_MM:
            raise ValueError("distance out of range")
        flags |= 0x01
    if accel_g is None or gyro_dps is None:
        a, g = (0, 0, 0), (0, 0, 0)
    else:
        a = tuple(_i16(accel_g[k], 1000) for k in "xyz")
        g = tuple(_i16(gyro_dps[k], 10) for k in "xyz")
        flags |= 0x02
    return cv.TELEMETRY.pack(MAGIC, VERSION, 1, node_id, boot_nonce, seq,
                             sample_uptime_ms & 0xFFFFFFFF, distance_mm,
                             *a, *g, flags, origin_kind)


def encode_ack(node_id: int, boot_nonce: int, seq: int, ack_code: int,
               gateway_id: int, gateway_uptime_ms: int) -> bytes:
    """Build the 21-byte application ACK (Gateway accepted into its queue; nothing more)."""
    return cv.ACK.pack(MAGIC, VERSION, 2, node_id, boot_nonce, seq, ack_code,
                       gateway_id, gateway_uptime_ms & 0xFFFFFFFF)


decode_telemetry = cv.decode_telemetry
decode_ack = cv.decode_ack
CandidateValidationError = cv.CandidateValidationError


def node_name(node_id: int) -> str:
    return f"NODE_{node_id:02d}"


def gateway_name(gateway_id: int) -> str:
    return f"GW_{gateway_id:02d}"


def boot_name(boot_nonce: int) -> str:
    return f"BOOT_{boot_nonce:08X}"


def to_hex(frame: bytes) -> str:
    return " ".join(f"{b:02X}" for b in frame)

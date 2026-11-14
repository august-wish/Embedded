# Mock chain: fake Node → Gateway → Cloud → Dashboard

Lets every owner test **their own part now**, without waiting for the other boards.
Python 3 standard library only. Everything is **MOCK** and follows the **provisional** Interface Contract v0.2. If the contract changes, the mocks change with it (see "Changing the contract" below).

```
mock_node.py --UDP (stands in for ESP-NOW)--> mock_gateway.py --HTTP POST--> mock_cloud.py <--HTTP GET-- dashboard
```

## Quick start (one command)
```powershell
py tools/mock/run_demo.py                  # 1 node, clean
py tools/mock/run_demo.py --drop-rate 0.3  # lossy radio: see retries + delivery rate
py tools/mock/run_demo.py --nodes 3        # 3 simulated nodes at once (scalability)
py -m unittest discover -s tools/mock -v   # automated checks (12 tests)
```

## What each owner can use

| Owner | Use this | How |
|---|---|---|
| **Udomchok** (Dashboard) | `mock_cloud.py` | Run `py tools/mock/mock_cloud.py`, then fetch `http://127.0.0.1:8080/api/sources` and `/api/latest?source=NODE_01` and `/api/history?source=NODE_01`. CORS is open, so a browser page can call it. Run `mock_node.py` to keep data flowing; stop it to see `freshness` change to `stale` then `offline`. |
| **Chananphat** (Gateway/Cloud) | `mock_node.py`, `mock_cloud.py` | Node mock sends frames to your Gateway code (`--gateway <ip>:<port>`). The cloud mock accepts your `cloud.telemetry` JSON: `POST /api/telemetry`. Bad JSON returns `400` with the reason. Run it with `--host 0.0.0.0` so a real ESP32 on the same Wi-Fi can reach your laptop. Replaying the same `record_id` returns `200 duplicate` (no second row). |
| **Pongsinachai** (Node) | `mock_gateway.py`, `mock_node.py --print-hex` | Compare your firmware's bytes with `--print-hex` output (same `seq`/values). Gateway mock answers with the 21-byte ACK, `duplicate` and `rejected` cases. Real boards send over ESP-NOW, so use the **validator** to decode what your board prints: `py tools/validator/candidate_validator.py --decode telemetry --hex "<bytes>"`. |
| **Thapanakorn** (PM) / **Thiti** | `trace_record.py`, `run_demo.py` | Evidence + delivery-rate numbers (clearly labelled mock). |

## Fault switches on `mock_node.py`
`--drop-rate 0.3` radio loss · `--invalid-every 5` sensor timeout (distance invalid, never 0) · `--dup-every 4` duplicate frame · `--corrupt-every 6` bad magic · `--origin physical|simulated` (mock default is `simulated` so it can never be mistaken for a real reading).

## Trace one message (evidence for test H08)
```powershell
py tools/mock/trace_record.py --source NODE_01 --seq 10 --node-log node.jsonl --gateway-log gateway.jsonl --cloud http://127.0.0.1:8080
```
Prints PASS / FAIL / NOT CHECKED for node log, gateway log, cloud record. The dashboard stage is always `NOT CHECKED`: take a screenshot showing the same `seq` yourself. With real boards, copy the Serial-log lines into the same JSON-lines shape or just compare by eye and screenshot.

## Mock-only decisions (NOT agreed with the team yet)
- HTTP routes (`/api/...`), UDP ports (5001), `boot_id` text (`BOOT_<hex of boot_nonce>`), node name (`NODE_<id>`), freshness limits (10 s / 60 s), ACK timeout 0.3 s, 3 retries, buffer 1000 records. Real values come from decisions D-03, D-04.
- The gateway mock keeps every `(node, boot, seq)` it has seen; real firmware needs a bounded window.
- `gateway_received_at_utc` is `null` (no trusted clock); the cloud adds `cloud_ingested_at_utc`.
- The mock delivery rate is **not** a measurement of ESP-NOW. Do not put it in the report as a result.

## Changing the contract
1. Record the change request (see `docs/integration/`).
2. Edit `tools/validator/candidate_validator.py` first (struct layout, checks). The mocks import it, so they follow.
3. Update `docs/interface/INTERFACE_CONTRACT.md` and `GOLDEN_VECTORS.md`.
4. Run `py tools/validator/candidate_validator.py --self-test` and the unit tests above.

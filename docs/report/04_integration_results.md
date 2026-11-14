# 4. Integration results (architect's part — fill in from real evidence only)

> Source of truth: `docs/integration/RESULTS.md` and files in `docs/integration/evidence/`. Do not write a number here unless a log, screenshot or video backs it. Mock-tool numbers are not results.

## 4.1 Method
- Interfaces were agreed in an interface contract (v0.2 baseline) and checked offline with a validator and example frames.
- Parts were integrated one link at a time: Node → Gateway, Gateway → Cloud, Cloud → Dashboard, then end to end.
- One message was traced across all stages by `node_id` and `seq` (tool: `tools/mock/trace_record.py`; screenshots for the dashboard).

## 4.2 Results table (copy from RESULTS.md when tests are done)

| ID | Test | Result | Evidence | Notes |
|---|---|---|---|---|
| G1 | Node → Gateway | NOT TESTED | | |
| G2 | Gateway → Cloud | NOT TESTED | | |
| G3 | Cloud → Dashboard | NOT TESTED | | |
| G4 | End to end | NOT TESTED | | |
| H02 | ESP-NOW with hotspot, reconnect | NOT TESTED | | |
| H03 | Offline buffer and replay | NOT TESTED | | |
| H05 | SOS with no GPS fix | NOT TESTED | | |
| H06 | AI → servo/audio, latency | NOT TESTED | | |
| H07 | Multi-node | NOT TESTED | | |
| H10 | Internet cut, local warning | NOT TESTED | | |

## 4.3 Metrics (course asks for ≥3 measured with real data; PM owns the formal test plan)
For each: how it was measured, number of runs, mean and min/max.

| Metric | Method | Runs | Result |
|---|---|---|---|
| End-to-end latency (sensor → dashboard) | | | |
| Packet delivery rate Node → Gateway | count sent vs received over N packets | | |
| Uptime over a continuous run | | | |

## 4.4 Known issues and limits
Copy open items from `RESULTS.md` "Known issues". State clearly what was **not** tested.

## 4.5 What I learned / discussion points
- Interface disagreements found and how they were resolved (from `docs/DECISIONS.md`).
- Problems found only when the real parts were connected (hotspot channel, pin limits, timing).

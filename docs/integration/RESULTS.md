# Integration Results

Owner: Thiti Wanganuttara. Updated: 14 Nov 2026.

**Rules**
- Status is only `PASS`, `FAIL` or `NOT TESTED`.
- `PASS` needs a file in `docs/integration/evidence/` (log, screenshot or video). No file, no PASS.
- Mock runs are listed separately. They prove the contract and tools agree, **not** that hardware works.

**Test IDs:** the PM owns the formal test plan (T01–T18, Google Sheet). This file is the integrator's evidence index. Mapping to the PM's IDs:

| PM test | Meaning | IDs here |
|---|---|---|
| T01 | Gateway board model and TP4056 protection confirmed | D-01, known issues 1, 2 |
| T02 | HC-SR04 reads, timeout = invalid | G0 |
| T03 | Node → Gateway with real hotspot | G1, H01, H02 |
| T04 | Gateway → Cloud | G2 |
| T05 | Cloud → Dashboard | G3 |
| T06 | Real sensor, same `seq` at all 4 points | G4, H08 |
| T07 | Check the checkpoint video | G4 |
| T08 | Local warning without Internet | H10 |
| T09 | SOS → Discord | H05, H09 |
| T10 | Camera AI → warning | H06 |
| T11 | GPS valid / no fix | H04, H05 |
| T12 | Packet/ACK loss, hotspot reconnect | H01, H02 |
| T13 | Cloud down, replay | H03 |
| T14 | GPS / heart rate / light to Cloud | H04 |
| T15 | Suspected fall | D-07 |
| T16 | Multi-node | H07 |

When the two disagree, the PM's sheet is the plan and this file records the evidence.

## Checkpoint slice (20 Nov): distance reading end to end

| Stage | Test | Status | Evidence | Owner | Notes |
|---|---|---|---|---|---|
| G0 | Each part runs alone (Node prints, Gateway boots, Dashboard opens) | NOT TESTED | | each owner | |
| G1 | Node → Gateway over ESP-NOW (same `seq` in both logs) | NOT TESTED | | Pongsinachai + Chananphat | |
| G2 | Gateway → Cloud (row visible, same `seq`) | NOT TESTED | | Chananphat | |
| G3 | Cloud → Dashboard (same `seq` shown) | NOT TESTED | | Udomchok | |
| G4 | End to end, recorded for the video | NOT TESTED | | all; PM submits | Due 20 Nov 23:59 |

## Physical integration tests (full list)

| ID | What it proves | Status | Evidence | Blocked by |
|---|---|---|---|---|
| H01 | Real Node frame → Gateway decodes → ACK returns | NOT TESTED | | D-02, D-03 |
| H02 | ESP-NOW still works while Gateway is on the real hotspot, and after reconnect | NOT TESTED | | D-09 |
| H03 | Cloud down → Gateway buffers → replay, no duplicate rows | NOT TESTED | | D-03, D-04 |
| H04 | Node + Gateway sensors (MAX30102, GPS, LDR) → Cloud → Dashboard, with IDs, units, validity | NOT TESTED | | D-04, D-10 |
| H05 | SOS with no GPS fix: no stale position shown, same `event_id` on retry | NOT TESTED | | D-05, D-06 |
| H06 | Real AI output → Gateway decision → servo/audio, with latency | NOT TESTED | | D-01, D-07 |
| H07 | Several nodes at once stay distinct in Gateway, Cloud, Dashboard | NOT TESTED | | D-08 |
| H08 | One real HC-SR04/MPU6050 reading traced Node → Gateway → Cloud → Dashboard | NOT TESTED | | all owners |
| H09 | Discord retry / failure handling and secret handling | NOT TESTED | | D-05 |
| H10 | Internet cut: local warning and servo stop still safe | NOT TESTED | | D-01, D-07 |

## Offline / mock checks (not hardware)

| Check | Status | Run date | Command |
|---|---|---|---|
| Validator: 22 candidate checks | PASS (offline) | 16 Nov 2026 | `py tools/validator/candidate_validator.py --self-test` |
| Mock chain: 12 automated tests | PASS (offline) | 14 Nov 2026 | `py -m unittest discover -s tools/mock -v` |
| Mock demo: 1 node, 30% radio loss, all delivered after retries | PASS (mock) | 14 Nov 2026 | `py tools/mock/run_demo.py --drop-rate 0.3` |

## Known issues

| # | Issue | Owner | Status |
|---|---|---|---|
| 1 | BOM Gateway link is ESP32-CAM, proposal says ESP32-S3; pin count may be too low | Chananphat | OPEN |
| 2 | BOM audio is MAX98357 amp, proposal says DFPlayer Mini | Chananphat | OPEN |
| 3 | ESP-NOW + hotspot channel untested | Pongsinachai + Chananphat | OPEN |
| 4 | Hardware has arrived (PM-01, 15 Nov). Exact Gateway board model and TP4056 protection still to confirm (PM-02 / T01, due 16 Nov) | Peem + PM | OPEN |
| 5 | No owner has confirmed the contract yet (no objection only) | Thiti | OPEN |

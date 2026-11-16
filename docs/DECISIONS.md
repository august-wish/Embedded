# Decision Log

Owner: Thiti Wanganuttara (System Architect & Integration). One row per decision. Never delete a row; add a new row when a decision changes.

**Baseline rule (since 14 Nov 2026):** `docs/interface/INTERFACE_CONTRACT.md` v0.2 is the **provisional baseline**. It was sent to all owners on 10 Nov with no objection received. "No objection" is **not** the same as "approved". Status stays `NO OBJECTION` until the owners of both sides confirm. Any owner can ask for a change at any time (see Change Requests below).

Status values: `OPEN` (not decided) · `NO OBJECTION` (baseline in use, not confirmed) · `AGREED` (both owners confirmed, with date) · `CHANGED` (new value agreed) · `DEFERRED`.

**Sources of schedule/tests:** the PM keeps the schedule and the formal test plan (T01–T18) in the shared Google Sheet. The decision IDs below (D-01 to D-10) are referenced there.

## Open decisions

| ID | Priority | Decision | Owners | Baseline in use | Status | Date / by |
|---|---|---|---|---|---|---|
| D-01 | P0 | Exact Gateway board (ESP32-S3 vs ESP32-CAM), PSRAM, free GPIO. Audio part: DFPlayer (proposal) vs MAX98357 (BOM) | Chananphat + hardware buyer | Proposal: ESP32-S3 + DFPlayer | OPEN | |
| D-02 | P0 | Packet format: 34-byte telemetry + 21-byte ACK, little-endian, magic `0x5343` (bytes `43 53`). Or a simpler text/JSON packet for the checkpoint | Pongsinachai + Chananphat | 34 B / 21 B binary | NO OBJECTION | 14 Nov, Thiti |
| D-03 | P0 | Sample rate, ACK timeout, retries, backoff, stale limit, buffer size | Pongsinachai + Chananphat | Mock defaults: ACK 0.3 s, 3 retries, stale 10 s, offline 60 s, buffer 1000. Boom's Worker uses fresh 30 s, stale 90 s | OPEN | |
| D-04 | P0 | Cloud platform, protocol, auth, schema, read API for the Dashboard | Chananphat + Udomchok | Candidates: Boom's Cloudflare Worker + D1 in `dashboard/hosted-site/` (POST needs `device_id` + Bearer token, answers 202; not in contract yet) or Firebase (PM sheet). Mock API in `tools/mock/` is not real | OPEN. PM task PM-04, due 16 Nov | |
| D-05 | High | Discord alert: Gateway calls webhook directly or via relay; where the secret is stored | Chananphat + Udomchok | Proposal diagram: Gateway → Wi-Fi → Discord | OPEN | |
| D-06 | High | UTC time source, GPS valid/stale rule, event de-duplication | Chananphat + Udomchok | `gateway_received_at_utc = null` when no clock; cloud adds `cloud_ingested_at_utc` | NO OBJECTION | 14 Nov, Thiti |
| D-07 | High | What "AI decision" and "suspected fall" mean (a cane sensor can't prove a person fell) | Chananphat + PM | Use wording "suspected fall / cane drop" | OPEN | |
| D-08 | Medium | Multi-node target: software only (1 pt) / 1 real + 2 simulated (2 pts) / 2 real (3 pts) | PM + team | Suggest 2-point option | OPEN | |
| D-09 | P0 | ESP-NOW and hotspot Wi-Fi channel policy, reconnect behaviour | Pongsinachai + Chananphat | None. Needs a hardware trial with the real hotspot | OPEN | |
| D-10 | High | MAX30102, GPS, LDR raw fields, units, sample rate, storage policy | Chananphat + Udomchok | Contract section 6 examples | OPEN | |

## Decisions made

| Date | ID | Decision | Made by | Notes |
|---|---|---|---|---|
| 14 Nov 2026 | D-02a | Contract text now states magic `0x5343` is sent as bytes `43 53` (ASCII "CS"), not "SC". **Wording only, wire value unchanged.** | Thiti (architect) | Owners still to confirm value vs byte order |
| 14 Nov 2026 | – | Use contract v0.2 as provisional baseline; owners may request changes later | Thiti (architect) | See baseline rule above |
| 14 Nov 2026 | – | Checkpoint scope = one HC-SR04 distance reading Node → Gateway → Cloud → Dashboard | Thiti (proposal to PM) | PM to confirm |

## Change requests

Copy this block for each request.

```text
CR-xx   Date:
Requested by:
Interface (IF-xx) and field:
Old value:
New value:
Reason:
Producer / Consumer affected:
Agreed by (both owners):
Files to update: INTERFACE_CONTRACT.md, GOLDEN_VECTORS.md, candidate_validator.py, tools/mock, tests
New contract version:
Evidence re-run (date, path):
```

| CR | Date | Interface / field | Old → New | Requested by | Status |
|---|---|---|---|---|---|
| CR-02 | 16 Nov 2026 | IF-03 upload shape vs hosted Worker: `device_id` required, distance read from `readings.hc_sr04`, motion in m/s² | Worker should accept the contract shape (4 changes listed in evidence F-01) | Thiti (proposal) | PROPOSED, waiting for Boom + Peem. Evidence: `docs/integration/evidence/F01_worker-vs-contract_2026-11-16.md`, probe `tools/compat/probe_worker_contract.mjs` (2/6 pass) |
| CR-01 | 16 Nov 2026 | IF-04 read model: `source_seq` | absent from minimum envelope → **required nonnegative integer** | Boom (dashboard owner) | APPLIED to contract v0.2.1, validator (22 checks), mock. Cloud owner (Peem) to confirm |

Rule: change the validator first (the mocks import it), then the docs, then run `py tools/validator/candidate_validator.py --self-test` and `py -m unittest discover -s tools/mock`.

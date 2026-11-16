# F-01 — Hosted Worker vs Interface Contract IF-03 (offline source check)

Date: 16 Nov 2026 · Checked by: Thiti (integrator) · Status: **FINDING, owner decision pending** (Boom + Peem, PM-04 / D-04)

**What was checked:** the repo source `dashboard/hosted-site/worker/index.js` (function `normalizeTelemetry`) fed with a record in our contract shape (`tools/compat/contract_record.json`, valid per `candidate_validator.py`). Nothing was sent to any network. A deployed Worker may differ from the repo source.

**Reproduce:** `node tools/compat/probe_worker_contract.mjs` (exit code 1 while any check fails).

## Result (16 Nov 2026): 2 of 6 checks pass

| Check | Result | Detail |
|---|---|---|
| Accepts a contract record as-is (no `device_id`) | FAIL | `device_id is required and may contain only letters, numbers, _ and -` |
| Keeps `source_seq`, `record_id`, `source_id`, `origin_kind` | PASS | seq 125, NODE_01, physical |
| Keeps `readings.distance_cm` = 46.2 | FAIL | stored as `null` (Worker reads `readings.hc_sr04.distance_cm` or `readings.ultrasonic.distance_cm`) |
| Marks the ultrasonic reading valid | FAIL | `ultrasonicValid = 0` (Worker reads `valid` inside the reading, ignores top-level `validity`) |
| Keeps `accel_g` / `gyro_dps` | FAIL | `null` (Worker reads `accel_x_mps2`, `gyro_x_dps`, … in m/s²) |
| Invalid distance is null/invalid, never 0 | PASS | trivially: the Worker drops the distance in every case, so this is not a meaningful pass |

## Effect
If the Gateway sends the contract format to this Worker, the record is rejected. If a `device_id` is added, the record is stored with the distance as `null`, and the dashboard shows "—" while the Node works.

## Matches the contract
`source_seq`, `record_id`, `source_boot_id`, `origin_kind`, `gateway_id`, `gateway_received_at_utc`, `readings.max30102` (`bpm`, `ir_raw`, `red_raw`, `valid`), `readings.gps` (`lat_deg`, `lon_deg`, `fix_valid`, `fix_age_ms`), `readings.ldr.adc_raw`.

## Other differences (not tested by the probe)
- Success status: Worker answers 202; the mock cloud answers 201. Firmware must accept 200/201/202.
- Read API: Worker exposes `/api/dashboard`, `/api/telemetry/latest`, `/api/telemetry/history`; the checkpoint viewer calls `/api/sources` (mock route).
- Freshness limits: Worker fresh ≤ 30 s, stale ≤ 90 s; mock 10 s / 60 s (D-03 open).
- Contract has two record kinds (`cloud.telemetry` for Node, `cloud.gateway_telemetry` for Gateway sensors); the Worker stores one record shape and reads Gateway sensors from `readings.*` of the same record.

## Proposed change (CR-02, on the Worker side)
No Gateway firmware exists yet, so changing the Worker is cheaper than changing the contract, validator, mock and docs. Suggested:
1. `device_id` optional, default to `gateway_id`.
2. Read `readings.distance_cm` and top-level `validity` (keep `hc_sr04` as an alternative).
3. Accept `accel_g` and `gyro_dps` objects (convert g to m/s² if the database needs it, or store g).
4. Accept 200/201/202 as success on the Gateway side, or answer 201.

The alternative (change the contract to the Worker's shape) is possible; then the validator, mock, golden vectors and tests change instead. Owners decide.

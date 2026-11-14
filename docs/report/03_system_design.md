# 3. System Design (architect's draft, DRAFT — not yet verified on hardware)

> Draft notes for the final report. Facts below come from the submitted proposal and the interface contract v0.2 (provisional baseline). Replace "proposed" wording with measured facts once tests pass. Items marked **[CONFIRM]** depend on an open decision in `docs/DECISIONS.md`.

## 3.1 Overview

The smart cane has a distributed design. A **Sensor Node** at the cane tip measures obstacle distance and motion. A **Gateway** at the handle receives the node's data, reads its own sensors, makes local decisions, and uploads to the **Cloud**. A **Dashboard** shows caregivers the stored data. Important events go to a caregiver notification (Discord).

```
Node (ESP32)  --ESP-NOW-->  Gateway (ESP32-S3 [CONFIRM])  --Wi-Fi-->  Cloud [CONFIRM]  -->  Dashboard
HC-SR04, MPU6050            camera, MAX30102, GPS, LDR, SOS            raw data store      map, BPM, history
                            servo + speaker (local warning)   \-->  Discord alert
```

Two paths run separately:
- **Real-time local path:** sensors → Gateway decision → servo/speaker. It does not wait for the Internet.
- **Remote monitoring path:** Gateway → Cloud → Dashboard and alerts. Losing the Internet delays this path, but does not disable local warnings.

Figure: `docs/proposal/data_flow_diagram.png` (replace with a cleaner diagram for the report).

## 3.2 Components

| Component | Hardware (from proposal) | Role | Owner |
|---|---|---|---|
| Sensor Node | ESP32, HC-SR04, MPU6050 | Measure distance and motion, send over ESP-NOW | Pongsinachai |
| Gateway | ESP32-S3 [CONFIRM D-01], camera, MAX30102, NEO-6M GPS, LDR, SOS button, SG90 servo, audio [CONFIRM D-01] | Receive, decide, warn locally, upload | Chananphat |
| Cloud | [CONFIRM D-04] | Store raw readings and events, serve the dashboard | Chananphat + Udomchok |
| Dashboard | Web | Show latest values, history, events, stale/offline state | Udomchok |

Sensor types: HC-SR04, MPU6050 (node); MAX30102, GPS, LDR (gateway); camera is an AI input and not counted. One physical actuator: servo (the speaker does not count as an actuator by the course definition).

*(Each owner writes 3 to 5 sentences about their own block here, in their own words, for Q&A.)*

## 3.3 Message format

All inter-component messages carry a **source ID** (`node_id`), a **sequence number** (`seq`) and a **time reference**, so many nodes can be told apart and lost or duplicate messages found.

**Node → Gateway (ESP-NOW)** [CONFIRM D-02]: compact binary frame, 34 bytes, little-endian, no struct padding.

| Offset | Field | Bytes | Meaning |
|---:|---|---:|---|
| 0 | magic | 2 | `0x5343` (wire bytes `43 53`) |
| 2 | packet_version | 1 | 1 |
| 3 | message_type | 1 | 1 = telemetry |
| 4 | node_id | 2 | which node |
| 6 | boot_nonce | 4 | distinguishes reboots |
| 10 | seq | 4 | counter within node and boot |
| 14 | sample_uptime_ms | 4 | time since boot (not clock time) |
| 18 | distance_mm | 2 | `65535` = invalid |
| 20 | accel_mg | 6 | 3 × int16, milli-g |
| 26 | gyro_dps10 | 6 | 3 × int16, tenths of °/s |
| 32 | validity_flags | 1 | bit 0 distance valid, bit 1 motion valid |
| 33 | origin_kind | 1 | 0 physical, 1 simulated |

The 34-byte frame fits well under the 250-byte ESP-NOW (v1.0) limit. The same data as JSON is 282 bytes, which does not fit, which is why a compact binary frame was chosen. **[If the team uses a text packet for the checkpoint, update this section.]**

**Gateway → Node (ACK):** 21-byte frame with the same `(node_id, boot_nonce, seq)` and a code (accepted / duplicate / rejected). It confirms only that the Gateway accepted the message into its queue, not that the cloud stored it.

**Gateway → Cloud:** JSON records `cloud.telemetry` (node readings), `cloud.gateway_telemetry` (MAX30102, GPS, LDR) and `system.event` (SOS, suspected fall). Each has a stable `record_id` or `event_id` so a retry cannot create a duplicate. Missing or failed readings carry a validity flag and `null`, never `0`. [CONFIRM D-04, D-10]

**Cloud → Dashboard:** latest value per source with `freshness` (fresh / stale / offline), plus history and events. [CONFIRM D-04]

Full field list: `docs/interface/INTERFACE_CONTRACT.md`. Example frames: `docs/interface/GOLDEN_VECTORS.md`. Format checks: `tools/validator/`.

## 3.4 Scalability
Every message carries `node_id`; the Gateway tracks duplicates and last-seen per node; simulated nodes are marked `origin_kind = simulated`. Demonstration level chosen: **[CONFIRM D-08]** (software only / 1 real + 2 simulated / 2 real).

## 3.5 Reliability and safety design (selected engineering-depth items from the proposal)
- **E4 reliable communication:** ACK and retry between Node and Gateway, bounded store-and-forward buffer at the Gateway, idempotent cloud writes. [measure packet delivery rate on real hardware]
- **E2 interrupt:** SOS button handled by an ISR with deferred processing. [owner to describe]
- **E1 FreeRTOS, E3 low power, E7 on-device AI:** owners describe their implementation and measurements.
- **Safety (M7):** servo has a safe stop/timeout; lithium cells have a protection circuit and are not charged unattended. [owner to confirm what was built]
- **Time:** the Node sends uptime only; the Gateway adds a UTC receipt time only when it has a trusted clock; the cloud adds its own ingestion time. A missing time or GPS fix is shown as unavailable, never invented.

## 3.6 Radio coexistence
ESP-NOW and the Wi-Fi hotspot must use the same channel on the Gateway. This was tested on the real hotspot: **[results from H02, or write NOT TESTED]**.

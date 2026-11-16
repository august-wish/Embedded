# Smart Cane — Interface Contract

**Group:** TMR Praao  
**Owner:** Thiti Wanganuttara — System Architect & Integration  
**Version:** v0.2 — **PROPOSED / NOT APPROVED**  
**Date:** 10 November 2026 (ICT)  
**Reviewers:** Pongsinachai (Sensor Node), Chananphat (Gateway & Cloud), Udomchok (Dashboard), Thapanakorn (PM & Test Lead)

> **Purpose:** Make the interfaces between independently developed parts explicit so the team can integrate the Smart Cane without changing one another's implementation. Examples are **logical message shapes**, not finalized wire protocols, firmware structures, database schemas, or API endpoints. Every `PROPOSED` field and `TBD` decision requires owner agreement.

## Quick review — start here

**What is ready:** Proposed Node/Gateway message semantics; a **34-byte telemetry** and **21-byte ACK** wire candidate that both embedded owners can assess; example raw Gateway sensor, Cloud event and Dashboard read envelopes; explicit Proposal-aligned Gateway→Discord flow.

**What is not approved:** The wire encoding itself, Node IDs, timing/retry values, hotspot channel policy, Cloud platform/API, AI thresholds, and alert delivery strategy. These are **not instructions to implement without review**.

**Review sequence for the 20 Nov end-to-end checkpoint:**

1. **Pongsinachai + Chananphat:** settle IF-01/IF-01A packet layout, units, ACK and ESP-NOW/Wi-Fi channel behavior (Sections 4, 9, 10).
2. **Chananphat + Udomchok:** settle Node/Gateway raw Cloud schema and Dashboard readback fields (Sections 6–7, 10).
3. **Chananphat + Udomchok, PM consulted:** settle SOS/Discord semantics; confirm one physical Node reading can be traced end to end (Sections 8, 11).

## 1. Source of truth and scope

The **submitted `Embedded System Proposal.pdf` and its original data-flow diagram** are the functional baseline. This file **does not redesign the architecture**:

1. **Cane-tip Sensor Node:** ESP32 + HC-SR04 + MPU6050.
2. **Cane-handle Gateway:** ESP32-S3 **as specified in the proposal**; camera, MAX30102, GPS, LDR, SOS, TinyML, SG90, DFPlayer/speaker.
3. **Node → Gateway:** ESP-NOW.
4. **Gateway → Cloud:** Wi-Fi, raw sensor readings and events stored for Dashboard.
5. **Gateway → local warning:** immediate physical/audio feedback, independent of Internet.
6. **Gateway → caregiver alert:** proposal depicts a Wi-Fi path to **Discord Webhook**. The exact network caller/relay is **TBD**; do not silently substitute a Cloud→Alert route.

**Hardware warning:** The shopping item labeled **ESP32-CAM** has not been verified to be the **ESP32-S3** required by the proposed on-device AI architecture. Confirm exact model/PSRAM/GPIO with the hardware and Gateway owner. This is a blocking hardware decision, not permission for the architect to replace the board.

**Architect owns:** cross-component field names, units, identity, event meaning, interface versioning, compatibility review, and integration checks. **Component owners retain:** sensors/firmware/AI, Gateway/Cloud implementation, Dashboard/alerts UI, and the PM's formal test plan.

## 2. Interface register

| ID | Producer → consumer | Transport/status | Contract subject | Review with |
|---|---|---|---|---|
| IF-01 | Sensor Node → Gateway | **ESP-NOW (proposal)** | Logical telemetry, candidate compact wire frame, identity, freshness, validity | Sensor Node + Gateway |
| IF-01A | Gateway → Sensor Node | **ESP-NOW (E4 proposed)** | Application-level receipt ACK, duplicate/error codes, retry semantics | Sensor Node + Gateway |
| IF-02 | Gateway decision → servo/audio | **Local (proposal)** | Alert priority, action/stop, safe response, AI outcome | Gateway owner |
| IF-03 | Gateway → Cloud storage | **Wi-Fi (proposal); HTTPS/MQTT TBD** | Node + Gateway raw readings, event identity, timestamps, offline replay | Gateway & Cloud owner |
| IF-04 | Cloud → Dashboard | **API/stream TBD** | Typed latest/history/event read models, location validity, multi-node identity | Cloud + Dashboard |
| IF-05 | Gateway → caregiver notification | **Wi-Fi → Discord (proposal)** | SOS/fall event, GPS validity, idempotency, credential handling | Gateway & Dashboard/alert owners |
| IF-06 | AI inference → local decision | **Inside Gateway (proposal)** | Model outcome, confidence, action and reaction time | Gateway/AI owner |

No specific library, cloud vendor, database, packet encoding, API route, or rate has been approved.

## 3. Shared definitions (proposal for review)

| Name | Definition | Decision state |
|---|---|---|
| `schema_version` | Version of this **logical message schema**, used for backward compatibility | **PROPOSED** |
| `node_id` | Stable identity of the source Sensor Node, e.g. `NODE_01`; unique per physical/simulated node | **PROPOSED**; exact provisioning TBD |
| `gateway_id` | Stable identity of the Gateway, e.g. `GW_01` | **PROPOSED** |
| `source_id` | Sender's source identity on Cloud/UI records: `node_id` for remote Node data, `gateway_id` for Gateway-local data/events | **PROPOSED** |
| `boot_id` | Distinguishes fresh sequence numbers after MCU reboot | **PROPOSED**; representation TBD |
| `seq` | Monotonically increasing message sequence within one `(node_id, boot_id)` | **PROPOSED**; width/wrap TBD |
| `node_uptime_ms` | Node's local monotonic sample time; **not UTC** | **PROPOSED** |
| `gateway_received_uptime_ms` | Gateway monotonic time when a Node packet was accepted | **PROPOSED** |
| `gateway_received_at_utc` | Gateway's trusted UTC receipt time, or `null` if not synchronized | **PROPOSED**; clock source TBD |
| `cloud_ingested_at_utc` | Cloud-generated UTC time when the record was persisted (not the sensor observation time) | **PROPOSED**; Cloud owner to confirm |
| `valid`/`validity` | Explicit indication of failed or unavailable readings; never pretend missing=zero | **PROPOSED** |
| `event_id` | Stable identifier for deduplicating one real-world event across retries | **PROPOSED** |
| `origin_kind` | `physical` or `simulated`, clearly distinguishable throughout the system | **PROPOSED** |

**Time and identity rule:** Every telemetry, ACK, event, and persisted record must carry an unambiguous source/subject ID **and an explicit time reference**. For ESP-NOW, a monotonic uptime value plus `boot_id` is a time reference, **not UTC**. For Cloud, preserve the original sample/receipt references and attach `cloud_ingested_at_utc` on persistence. Do not turn a missing UTC time or GPS fix into a fabricated timestamp/location. The exact synchronization method and reboot/wrap behavior still need owner agreement.

## 4. IF-01: Sensor Node → Gateway telemetry

### 4.1 Logical message — `node.telemetry` (**PROPOSED**)

Example shown as JSON for **logical field review only**. Its compact UTF-8 representation is **282 bytes**, exceeding ESP-NOW v1.0's **250-byte** maximum. **Do not transmit this JSON as the v1.0 wire packet.** ESP-NOW v2.0 may support larger frames, but mixed-device compatibility must be confirmed from the exact boards/SDKs; the candidate compact layout below is deliberately under 250 bytes.

```json
{
  "schema_version": 1,
  "kind": "node.telemetry",
  "node_id": "NODE_01",
  "origin_kind": "physical",
  "boot_id": "BOOT_A1",
  "seq": 125,
  "node_uptime_ms": 128500,
  "distance_cm": 46.2,
  "accel_g": {"x": 0.02, "y": 0.13, "z": 0.98},
  "gyro_dps": {"x": 1.1, "y": -0.4, "z": 0.6},
  "validity": {"distance": true, "motion": true}
}
```

| Field | Logical type | Meaning | Validation proposal |
|---|---|---|---|
| `schema_version` | integer | Field-layout version | Reject unsupported major version |
| `kind` | enum/string | Distinguish telemetry from ACK/events | Must equal `node.telemetry` |
| `node_id` | string/compact ID | Unique node source | Required, stable and non-empty |
| `origin_kind` | enum | Physical vs simulation | Required in scalability demo |
| `boot_id` | string/number | MCU reboot session | Combine with `seq` to identify duplicates |
| `seq` | unsigned integer | Packet sequence | Required; wrap policy TBD |
| `node_uptime_ms` | unsigned integer | Sensor sample time since boot | Not a UTC time |
| `distance_cm` | number/invalid marker | HC-SR04 distance in centimeters | Do not treat sensor timeout as `0 cm` |
| `accel_g` | XYZ numeric triplet | MPU6050 acceleration in **g** | Axis orientation/calibration must be agreed |
| `gyro_dps` | XYZ numeric triplet | MPU6050 angular rate in degrees/second | Units and sign convention must be agreed |
| `validity` | flags | Which readings can be trusted | Invalid readings explicitly flagged |

### 4.2 Candidate compact ESP-NOW telemetry frame (**PROPOSED, not frozen**)

This is a **34-byte design candidate**, not an instruction to copy a C struct to the radio. It keeps the full sensor meaning while avoiding the JSON size issue. The Node/Gateway owners must verify serialization, field limits, target SDK, and sample precision before approval.

| Byte offset | Wire field | Type/bytes | Logical meaning / conversion |
|---:|---|---|---|
| 0 | `magic` | uint16 / 2 | `0x5343`; little-endian wire bytes are `43 53` (ASCII "CS", not "SC"); candidate identifier — owners confirm value vs. byte order (D-02) |
| 2 | `packet_version` | uint8 / 1 | `1` for this proposed layout |
| 3 | `message_type` | uint8 / 1 | `1` = Node telemetry |
| 4 | `node_id` | uint16 / 2 | Numeric mapping of `NODE_01`, etc.; provisioning TBD |
| 6 | `boot_nonce` | uint32 / 4 | Logical `boot_id`; generation/reuse policy TBD |
| 10 | `seq` | uint32 / 4 | Sequence within `(node_id, boot_nonce)` |
| 14 | `sample_uptime_ms` | uint32 / 4 | Local monotonic sample time |
| 18 | `distance_mm` | uint16 / 2 | `round(distance_cm × 10)`; `65535` reserved invalid |
| 20 | `accel_mg[3]` | int16 × 3 / 6 | XYZ acceleration in milli-g (`g × 1000`) |
| 26 | `gyro_dps10[3]` | int16 × 3 / 6 | XYZ angular rate in tenths of °/s (`dps × 10`) |
| 32 | `validity_flags` | uint8 / 1 | Bit 0 distance valid; bit 1 motion valid; other bits reserved |
| 33 | `origin_kind` | uint8 / 1 | `0` physical, `1` simulated |
| **Total** | | **34 bytes** | **Below ESP-NOW v1.0's 250-byte data limit** |

**Candidate serialization rules:** explicit fixed-width integer packing; little-endian; no compiler padding or raw `sizeof(struct)` assumption; reserved bits zero; invalid data ignored based on validity flags; unique numeric ID mapping held by Gateway. The MCU owners must agree on range/overflow behavior (including uptime and sequence wrap) and whether a CRC or additional fields are justified. **No wire choice is approved by this draft.**

**Not frozen:** exact binary/JSON encoding; numeric ID provisioning; `boot_nonce` generation; sample interval; latency budget; MCU axes; HC-SR04 timeout behavior; calibration; whether the measurements share one sample instant.

### 4.3 IF-01A application ACK (**PROPOSED for E4**)

```json
{
  "schema_version": 1,
  "kind": "node.ack",
  "node_id": "NODE_01",
  "boot_id": "BOOT_A1",
  "seq": 125,
  "gateway_id": "GW_01",
  "gateway_uptime_ms": 234510,
  "status": "accepted"
}
```

- **Candidate 21-byte ACK wire layout:** `magic:u16` (2) + `packet_version:u8` (1) + `message_type:u8` (1; ACK=2) + `node_id:u16` (2) + `boot_nonce:u32` (4) + `seq:u32` (4) + `ack_code:u8` (1) + `gateway_id:u16` (2) + `gateway_uptime_ms:u32` (4). Explicit little-endian packing is **PROPOSED**.
- ACK code candidates: `0=accepted` (valid packet placed in Gateway processing queue), `1=duplicate` (already accepted), `2=rejected` (header parseable but payload not accepted). Unsupported/corrupt frames may have no ACK; error counters must remain visible.
- ACK indicates **Gateway acceptance**, not successful Cloud upload, AI processing, or Dashboard display.
- Sender retains/retries unacknowledged packets per agreed `ack_timeout_ms`, `max_retries`, retry/backoff and queue overflow policy (**all TBD**).
- Receiver deduplicates by `(node_id, boot_id, seq)` and must not re-trigger a one-shot warning merely because an old packet is repeated. Ongoing hazards still require fresh observations.
- On reboot, disconnection, invalid packet, or queue overflow, errors should be observable. Gateway should not report `accepted` when it cannot safely enqueue the reading.
- This is a **logical application ACK** proposed to fulfill E4. ESP-NOW's link-level send callback alone is not proof that application processing succeeded.

### 4.4 ESP-NOW + hotspot Wi-Fi channel compatibility (**P0 decision**)

The Gateway must receive ESP-NOW **while** using Wi-Fi for Cloud/Discord. ESP-NOW peers must operate on compatible Wi-Fi channels; the mobile hotspot can affect the Gateway's active station channel. This is an **integration contract**, not a Node-only or Gateway-only setting.

- **TBD with both embedded owners:** Gateway Wi-Fi mode, hotspot band/channel, initial peer discovery, and behavior after hotspot reconnect/channel change.
- **Required integration check:** on the *actual hotspot*, demonstrate Node packets arriving before and after Gateway joins Wi-Fi, a Wi-Fi disconnect/reconnect, and an ESP-NOW-only outage; measure the failure/recovery behavior.
- **Do not assume** hard-coding an arbitrary ESP-NOW channel will work when Gateway joins a hotspot on a different channel. Record the channel policy after a hardware trial.

## 5. IF-02 and IF-06: local decision / AI / actuator

The proposal requires a closed-loop AI output used by a real decision or actuator action; this path stays **on the Gateway**, not in the Cloud.

**Suggested interface concepts (not an implementation design):**

| Contract field | Purpose | TBD with Gateway/AI owner |
|---|---|---|
| `source` | Distance / camera AI / motion AI / SOS | Event taxonomy |
| `classification` | e.g. obstacle class or **suspected** fall | Valid labels and model versions |
| `confidence` | AI score if available | Range and threshold semantics |
| `severity` | Alert priority | Priority and conflict handling |
| `action` | Servo motion, audio prompt, or none | Servo bounds, duration and safe stop |
| `decision_uptime_ms` | When Gateway decided | Response latency target |

**Proposed logical decision record** (internal Gateway handoff, not a network packet):

```json
{
  "schema_version": 1,
  "decision_id": "GW_01:GWBOOT_3:DECISION_44",
  "gateway_id": "GW_01",
  "source_id": "NODE_01",
  "source": "motion_ai",
  "model_id": "fall_model",
  "model_version": "TBD",
  "classification": "suspected_fall",
  "confidence": 0.82,
  "decision_uptime_ms": 235100,
  "action": "local_warning_requested"
}
```

The example does **not** approve a confidence threshold or warning action. The Gateway owner must map the two proposed AI uses (camera obstacle classification and movement/fall evaluation) to actual local decisions and define latency/priority/safe-stop behavior. Integration should record a traceable `decision_id` linked to its sensor or camera input and resulting local action; exact tracing implementation is the Gateway owner's choice.

**Safety:** a dropped cane and a fallen person are not automatically equivalent, because MPU6050 is mounted on the cane. Agree on event terminology and a realistic demonstration claim. The owner of Gateway firmware decides task/queue implementation, not this contract.

## 6. IF-03: Gateway → Cloud (raw data and events)

**Baseline:** raw readings from the Sensor Node **and Gateway sensors** (MAX30102, GPS, LDR, plus relevant camera/AI metadata), with provenance, are persisted. An AI/event summary **alone** cannot replace raw sensor storage for course M5.

**Proposed logical `cloud.telemetry` shape:**

```json
{
  "schema_version": 1,
  "kind": "cloud.telemetry",
  "record_id": "GW_01:NODE_01:BOOT_A1:125",
  "gateway_id": "GW_01",
  "source_id": "NODE_01",
  "origin_kind": "physical",
  "source_boot_id": "BOOT_A1",
  "source_seq": 125,
  "source_sample_uptime_ms": 128500,
  "gateway_received_at_utc": null,
  "gateway_received_uptime_ms": 234500,
  "readings": {
    "distance_cm": 46.2,
    "accel_g": {"x": 0.02, "y": 0.13, "z": 0.98},
    "gyro_dps": {"x": 1.1, "y": -0.4, "z": 0.6}
  },
  "validity": {"distance": true, "motion": true}
}
```

The example is **a Sensor Node reading** relayed by Gateway. `record_id` must be stable across retry/replay so Cloud can detect duplicate writes. The original sample time is **not** the replay/ingestion time.

### Gateway-local raw telemetry — `cloud.gateway_telemetry` (**PROPOSED**)

The Gateway has its own required sensor types. This *separate* sample is illustrative only; readings/availability and the exact MAX30102/GPS/LDR fields must be confirmed by Gateway/Cloud and Dashboard owners.

```json
{
  "schema_version": 1,
  "kind": "cloud.gateway_telemetry",
  "record_id": "GW_01:GW_01:GWBOOT_3:319",
  "gateway_id": "GW_01",
  "source_id": "GW_01",
  "origin_kind": "physical",
  "source_boot_id": "GWBOOT_3",
  "source_seq": 319,
  "source_sample_uptime_ms": 234800,
  "gateway_received_at_utc": null,
  "gateway_received_uptime_ms": 234800,
  "readings": {
    "max30102": {"ir_raw": 25409, "red_raw": 24100, "bpm": 72, "valid": true},
    "gps": {"lat_deg": 13.7, "lon_deg": 100.5, "fix_valid": true, "fix_age_ms": 1200},
    "ldr": {"adc_raw": 2034, "valid": true}
  }
}
```

| Sensor/field group | Meaning / required decision | Review status |
|---|---|---|
| `max30102.ir_raw`, `red_raw` | Unprocessed sampled channels; measurement cadence, sample averaging and numeric width | **PROPOSED / TBD** |
| `max30102.bpm`, `valid` | Derived BPM and validity/no-finger behavior; not a replacement for raw samples | **PROPOSED / TBD** |
| `gps.lat_deg`, `lon_deg` | WGS84 coordinates in decimal degrees *only when fix is valid* | **PROPOSED / TBD** |
| `gps.fix_valid`, `fix_age_ms` | Fix availability and age; old coordinates must not masquerade as current | **PROPOSED / TBD** |
| `ldr.adc_raw`, `valid` | Raw ADC reading; range/reference voltage and whether lux conversion exists | **PROPOSED / TBD** |
| Camera/AI metadata | Model/classification reference and inference result in an event; full image storage is **not assumed** | **PROPOSED / TBD** |

When a reading is unavailable, send a validity state and a `null`/explicit unavailable value in the final approved encoding. Do **not** invent sensor values or equate invalid with numeric zero. This example does not mandate recording every camera image or every high-rate optical sample; the raw-data sampling/storage policy must be agreed and must satisfy course M5.

### Event record — separate from raw telemetry (**PROPOSED**)

```json
{
  "schema_version": 1,
  "kind": "system.event",
  "event_id": "GW_01:GWBOOT_3:EVENT_001",
  "gateway_id": "GW_01",
  "source_id": "GW_01",
  "source_boot_id": "GWBOOT_3",
  "origin_kind": "physical",
  "event_type": "sos_pressed",
  "severity": "critical",
  "gateway_uptime_ms": 235000,
  "occurred_at_utc": null,
  "gps": {"fix_valid": false, "fix_age_ms": null, "lat_deg": null, "lon_deg": null},
  "delivery_state": "pending"
}
```

- `event_id` must remain unchanged across retry/replay; avoid generating a new event on each send attempt.
- For a Gateway SOS button event, `source_id = gateway_id`. For a Node-derived motion event, preserve the originating `node_id` in `source_id`. Event ID assignment and reboot collision prevention are **TBD**.
- A missing GPS fix must be explicit. Do not send a stale position as if it were live.
- **E4 proposal:** when Wi-Fi/Cloud is down, Gateway buffers bounded records and later replays them in order as feasible. Capacity, persistence across reboot, overflow policy and Cloud idempotency are **TBD**.
- Cloud persistence should attach **`cloud_ingested_at_utc`** as a server-generated timestamp to each accepted record, separately from `source_sample_uptime_ms` and Gateway receipt time. When a Gateway has no valid UTC clock, Cloud ingestion time must **not** be relabeled as the sensor observation time.
- Cloud should use stable `record_id`/`event_id` for **idempotent storage** on replay. Define how duplicate writes and partial failures are reported to Gateway (**TBD**).
- Cloud provider, HTTPS/MQTT, authentication, database schema and API endpoints remain **Gateway/Cloud owner decisions**, coordinated with Dashboard.
- Never commit credentials, tokens or Discord webhook URLs to the repository.

## 7. IF-04: Cloud → Dashboard read contract

Minimum concepts to agree with Cloud and Dashboard owners:

1. **Latest reading by source:** `record_id`, `gateway_id`, `source_id`, `origin_kind`, sensor name/value/unit/validity, sample/receipt/Cloud-ingestion time.
2. **History:** time range, stable sorting, raw records retrievable after Cloud write, and a way to distinguish delayed uploads.
3. **Events:** `event_id`, event type, severity, time, GPS fix state, delivery state.
4. **Health:** current/last-seen/offline/stale is explicit; a temporarily missing sensor is not displayed as zero.
5. **Multi-node:** simultaneous `NODE_01`, `NODE_02`, etc. stay distinct from each other and the Gateway.

**Proposed minimum read-model envelope** (the Cloud/Dashboard owners may choose REST, MQTT, or another transport):

```json
{
  "schema_version": 1,
  "gateway_id": "GW_01",
  "source_id": "NODE_01",
  "origin_kind": "physical",
  "latest_record_id": "GW_01:NODE_01:BOOT_A1:125",
  "source_seq": 125,
  "source_sample_uptime_ms": 128500,
  "source_boot_id": "BOOT_A1",
  "gateway_received_at_utc": null,
  "cloud_ingested_at_utc": "2026-11-10T07:48:00Z",
  "measurements": {"distance_cm": 46.2},
  "freshness": "unknown_clock"
}
```

`source_seq` (nonnegative integer, same value as IF-03 `source_seq`) is **required** in the read model so the dashboard can show the same `seq` as the Node, Gateway and Cloud (change CR-01, requested by the dashboard owner, 16 Nov 2026).

`freshness` candidates: `fresh`, `stale`, `offline`, `unknown_clock`; the actual thresholds and which component computes them are **TBD**. The example is intentionally **not** an HTTP endpoint specification.

**TBD:** provider, endpoint/query/stream mechanism, polling frequency, authentication, display freshness rule, data retention and privacy policy. The architect owns the interface vocabulary; UI layout and implementation remain with the Dashboard owner.

## 8. IF-05: Gateway → Discord caregiver alert

The **Proposal image explicitly draws** Gateway/local-warning → **Wi-Fi** → caregiver notification (**Discord Webhook**). Treat this as the **logical source and destination**. The technical question of whether the Gateway calls Discord directly or uses a relay/service remains **TBD and must be decided with owners**.

**Proposed event content:** stable `event_id`, event type (`sos_pressed` / `suspected_fall` as approved), severity, readable time, node/gateway identity, and Google Maps link **only for a validated GPS fix**. Retries must not spam a caregiver for the same event. Decide whether to notify on SOS, suspected fall, and which additional events.

**Delivery semantics requiring a decision:** Direct Discord Webhook calls may be retried after a lost acknowledgement, but the client might not know whether Discord already accepted the previous request. `event_id` is the correlation key, **not a guarantee of exactly-once Discord delivery**. If the team needs stronger deduplication, Gateway/alert owners must explicitly agree on a relay, durable delivery state, and retry policy; otherwise document best-effort/possible duplicate alerts in the demonstration. This does not authorize changing the Proposal's logical Gateway→caregiver path.

**No architect-owned code here:** Discord message design and delivery implementation are with the assigned owners. The architect verifies event IDs, source provenance, and end-to-end alert behavior.

## 9. Cross-interface rules to review

| Topic | Draft architectural rule | State |
|---|---|---|
| Versioning | Every intercomponent payload has a schema version; unknown versions fail clearly | PROPOSED |
| Wire budget | IF-01/IF-01A wire frames fit the **actual lower common ESP-NOW payload capability**; 34/21-byte candidates are not approved | PROPOSED, size/SDK verification TBD |
| Wi-Fi channel | ESP-NOW reception and Wi-Fi hotspot connection must coexist on compatible channels; reconnect behavior verified | **P0 decision** |
| Identity | Keep `node_id` distinct for physical/simulated sources; no hard-coded single-node assumptions | PROPOSED |
| Source and time | Telemetry, ACK and events carry source/subject identity and sample/receipt time reference; Cloud appends ingestion time | PROPOSED |
| Freshness | Receiver uses receipt time/age and validity flags; stale is not current | PROPOSED, TTL TBD |
| Units | Define SI/engineering units and axis conventions; no implicit conversions | PROPOSED, sign-off TBD |
| Retries | Reuse message/event identity; distinguish Gateway acceptance ACK from Cloud persistence and Discord delivery | PROPOSED, limits TBD |
| Offline | Local warning does not depend on Internet; cloud backlog/replay bounded and observable | Proposal + E4, implementation TBD |
| Time | Separate monotonic sample time from trusted UTC | PROPOSED, clock source TBD |
| Security | No secret in Git; agree authenticated cloud connection and webhook protection | Required safety practice, implementation TBD |
| Multi-node | State/last-seen/dedup tracked per source ID | PROPOSED, demo target TBD |

### 9.1 Parameters that **must be decided** before calling the contract final

| Parameter | Owner agreement needed | Why it matters |
|---|---|---|
| `espnow_payload_version`, byte order, frame length | Sensor Node + Gateway | Both must decode exactly the same bytes |
| `node_id` assignment and boot/session identity | Sensor Node + Gateway | Multi-node and reboot-safe deduplication |
| `sample_period_ms`, `ack_timeout_ms`, `max_retries`, backoff | Sensor Node + Gateway | E4 reliability without flooding or stale warnings |
| `stale_after_ms`, sensor invalid/timeout codes | Sensor Node + Gateway + Dashboard | Clear fresh versus unavailable readings |
| Hotspot band/channel and ESP-NOW peer channel policy | Sensor Node + Gateway | Radio stays usable with Cloud Wi-Fi |
| Offline `buffer_capacity`, persistence, overflow and replay order | Gateway/Cloud | Data loss/recovery is observable and bounded |
| Cloud provider/transport/auth and ingestion timestamp | Gateway/Cloud + Dashboard | M5 raw data can be stored and read back |
| Discord caller, retry/dedup and webhook secret storage | Gateway/Cloud + Dashboard/alerts | Prevent unsafe secret handling and unexpected alert spam |

**No numeric defaults have been chosen for these operational values**; agree them after the actual hardware/SDK and a short integration trial are known.

## 10. Team review: decisions needed before implementation freeze

| ID / priority | Question to settle | Owners to confirm | Status |
|---|---|---|---|
| D-01 / P0 | Exact ESP32-S3 vs ESP32-CAM board, memory and GPIO available? | Hardware purchaser + Gateway | OPEN |
| D-02 / P0 | Approve/replace the 34-byte telemetry and 21-byte ACK candidates; confirm common ESP-NOW version, widths, axes and serialization? | Sensor Node + Gateway | OPEN |
| D-03 / P0 | Sensor sample rate, ACK/retry/backoff, stale TTL and buffer capacity? | Sensor Node + Gateway | OPEN |
| D-04 / P0 | Cloud storage platform, Node + Gateway raw schema, protocol and read API for Dashboard? | Gateway/Cloud + Dashboard | OPEN |
| D-05 / High | Gateway-to-Discord direct webhook or agreed relay? How are credentials protected? | Gateway/Cloud + Dashboard/alerts | OPEN |
| D-06 / High | UTC source, Cloud ingestion time, GPS valid/stale semantics and event dedup policy? | Gateway/Cloud + Dashboard/alerts | OPEN |
| D-07 / High | Definition and verification of AI decision and suspected-fall claim? | Gateway/AI + PM/Test | OPEN |
| D-08 / Medium | Scalability target: protocol-only, physical+simulated, or two physical nodes? | PM + team | OPEN |
| D-09 / P0 | ESP-NOW and Gateway Wi-Fi hotspot channel policy, including reconnect/hotspot change? | Sensor Node + Gateway | OPEN |
| D-10 / High | Confirm MAX30102 raw/BPM, GPS and LDR fields/units/validity; sample frequency and storage policy? | Gateway/Cloud + Dashboard | OPEN |

**Review protocol:** owners comment on their interface only; architect consolidates and marks each decision **Agreed**, **Changed**, or **Deferred** with date. Until then this document remains a proposal, and examples must not be treated as firmware/API requirements.

### 10.1 Interface approval record (all pending)

| Interface | Required reviewers | Current status | Date / approved revision |
|---|---|---|---|
| IF-01, IF-01A | Pongsinachai + Chananphat | **PENDING** | — |
| IF-02, IF-06 | Chananphat (AI/Gateway), PM consulted on demo claims | **PENDING** | — |
| IF-03 | Chananphat + Udomchok (readback expectations) | **PENDING** | — |
| IF-04 | Chananphat + Udomchok | **PENDING** | — |
| IF-05 | Chananphat + Udomchok; PM on alert demonstration | **PENDING** | — |
| Multi-node target / integration demonstration | PM + affected developers + Architect | **PENDING** | — |

An interface becomes **AGREED** only after the named owners approve the same field-level revision. Log later changes with impact on producer and consumer; never silently change a published field's meaning.

## 11. Architect integration checklist (not the PM's formal test plan)

- [ ] Node owner and Gateway owner acknowledge IF-01 field names, units, encoding, identity, ACK/freshness rules.
- [ ] Serializers on both ends agree on frame length, offsets, endian/scaling and accept/reject tests; the chosen ESP-NOW frame fits the common device limit.
- [ ] ESP-NOW still works while Gateway uses the actual Wi-Fi hotspot, and after disconnect/reconnect/channel changes.
- [ ] Gateway and Cloud/Dashboard owners acknowledge IF-03/IF-04 field shape and raw storage/readback behavior.
- [ ] Raw Gateway sensors (MAX30102, GPS, LDR) and raw Node readings are stored with source ID, validity, and distinct sample/receipt/ingestion time references.
- [ ] Emergency alert pathway matches the **original Proposal diagram** or an explicitly approved change.
- [ ] One real HC-SR04/MPU6050 reading can be traced: **physical Node → Gateway → Cloud raw record → Dashboard**.
- [ ] Raw data retains a valid source ID; simulated readings are labeled and do not overwrite physical readings.
- [ ] Gateway action is driven by a genuine AI model output as required by M4; local warning works without Internet.
- [ ] ESP-NOW loss and Wi-Fi loss are separately observable; retry/replay behavior is demonstrated with stable IDs.
- [ ] SOS/critical-event identity survives retry; invalid GPS is not presented as current location.
- [ ] A deliberately replayed telemetry record does not create duplicate Cloud storage; any unavoidable Discord duplicate-delivery risk is documented.
- [ ] Integration evidence is recorded for the **20 November 2026** checkpoint video (≤2 minutes), coordinated with PM/Test Lead.

## 12. Change control and references

| Version | Date | Change | Review |
|---|---|---|---|
| v0.1 | 10 Nov 2026 | First **proposed** logical message contract, transport boundaries and review questions | Not approved |
| v0.2.1 | 16 Nov 2026 | CR-01: IF-04 read-model envelope now requires `source_seq` (requested by dashboard owner; no existing field renamed). Validator, mock and tests updated together | Cloud owner to confirm |
| v0.2 | 10 Nov 2026 | Self-audit fixes: bounded ESP-NOW wire candidates, radio channel check, Gateway raw sensor payload, timestamp/source rules, AI traceability, alert delivery caveat, approval record | **Pending team review** |

**Sources:** `Embedded System Proposal.pdf` (submitted team proposal and original diagram); `Embedded System (CEDT) - Final Project 2026.pdf` (Section 3 roles; M3–M6; Section II message-format and scalability scoring; E4 reliability; 20 Nov checkpoint); [Espressif ESP-NOW programming guide](https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32/api-reference/network/esp_now.html) (v1/v2 payload limits, channel and send callback behavior). `SYSTEM_ARCHITECTURE.md` is an earlier **draft**, not authority to override the submitted Proposal.

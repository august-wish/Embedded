# Smart Cane Interface Verification and Golden Test Vectors

**Group:** TMR Praao  
**Owner:** Thiti Wanganuttara — System Architect & Integration  
**Document version:** v0.1 (10 November 2026, ICT)  
**Source contract:** `INTERFACE_CONTRACT_team_review_v3.docx` / logical Contract v0.2  
**Decision status:** **PROPOSED / NOT APPROVED**  
**Verification status:** **20/20 offline candidate checks PASS; 0 physical integration tests executed**

## 1. วัตถุประสงค์และขอบเขต

เอกสารนี้เตรียม **Interface Verification Matrix** และ **Golden Test Vectors** ให้ทีมตรวจว่าฝั่งส่งและฝั่งรับตีความข้อมูลตรงกันก่อน Integration วันที่ **20 พฤศจิกายน 2026** โดยไม่แก้ Firmware, Cloud, Dashboard หรือ AI ของเจ้าของงาน และไม่เปลี่ยนค่าที่เสนอไว้เป็นข้อกำหนดที่อนุมัติแล้ว

ให้ใช้คู่กับไฟล์ `candidate_validator.py` ซึ่งใช้ Python Standard Library และทำงานออฟไลน์ได้ ชุดตรวจสอบนี้ทดสอบ **รูปแบบข้อมูล Candidate เท่านั้น** ไม่ใช่หลักฐานว่า ESP-NOW, Hotspot, Cloud, Discord, โมเดล AI หรือ Servo ทำงานกับฮาร์ดแวร์จริงแล้ว

**กติกาการตัดสิน:** `PASS (OFFLINE)` = Validator แปลข้อมูลที่เสนอได้ตรงตาม Test Vector; `PENDING OWNER` = ต้องได้รับ AGREE/CHANGE/QUESTION จากเจ้าของ Producer และ Consumer; `NOT TESTED (PHYSICAL)` = ยังไม่มีผลทดสอบฮาร์ดแวร์จริง

## 2. Interface Verification Matrix

| IF | Producer → Consumer | สิ่งที่ต้องตรวจสอบข้ามส่วน | Evidence / Test IDs | ผู้ต้องยืนยัน | สถานะ |
| --- | --- | --- | --- | --- | --- |
| **IF-01** | Sensor Node → Gateway | 34-byte candidate, `node_id`, `boot_nonce`, `seq`, sample uptime, distance/IMU scaling, validity, origin, reject malformed | T01–T09 + H01/H02 | **Pongsinachai + Chananphat** | OFFLINE PASS; OWNER PENDING |
| **IF-01A** | Gateway → Sensor Node | 21-byte candidate ACK, same `(node_id,boot_nonce,seq)`, accepted/duplicate/rejected meanings, timeout/retry TBD | A01–A05 + H01/H03 | **Pongsinachai + Chananphat** | OFFLINE PASS; OWNER PENDING |
| **IF-02** | Gateway Decision → Servo/Audio | Local priority, action/stop, Internet-independent warning, safe stop, measured reaction trace | H06/H10 | **Chananphat**, PM consulted | NOT TESTED (PHYSICAL) |
| **IF-03** | Gateway → Cloud | Node and Gateway raw sensors, distinct source IDs, validity, sample/receipt/ingest time, stable record ID, offline replay | C01/C02/C06 + H03/H04/H08 | **Chananphat + Udomchok** on readback | OFFLINE PASS; OWNER PENDING |
| **IF-04** | Cloud → Dashboard | Latest/history/events, typed units, source and physical/simulated identity, stale/offline/unknown clock, valid GPS only | C04/C05 + H04/H07/H08 | **Chananphat + Udomchok** | OFFLINE PASS; OWNER PENDING |
| **IF-05** | Gateway → Discord caregiver alert | Stable `event_id`, SOS/fall semantics, no stale GPS link, secrets and duplicate delivery caveat | C03/C05 + H05/H09 | **Chananphat + Udomchok**, PM consulted | OFFLINE PASS; OWNER PENDING |
| **IF-06** | AI inference → Gateway decision | Real model output → `decision_id`/classification/confidence → local warning/actuator, model evidence, latency | H06/H10 | **Chananphat**, PM consulted | NOT TESTED (PHYSICAL) |

**Traceability:** M3 = IF-01; E4 = IF-01A + IF-03 replay; M4/E7 = IF-06 → IF-02; M5 = IF-03/04; M6 = IF-05; M7 = IF-02 safe-stop; II Scalability = source identity throughout IF-01/03/04. การประเมินคะแนนและ Formal Test Plan ยังคงเป็นหน้าที่ PM/Test Lead

## 3. Golden Telemetry Frame IF-01

**Candidate framing:** 34 bytes, Little-endian, fixed-width integers, explicit serialization (ห้ามใช้ raw C struct ที่อาจมี padding), `packet_version=1`, `message_type=1`. ตัวเลข `node_id=1` และ `boot_nonce=0x1A2B3C4D` ต่อไปนี้ **เป็นค่าตัวอย่างสำหรับตรวจเท่านั้น ไม่ใช่ Provisioning ที่ได้รับอนุมัติ**

| Offset | Length | Wire field | Encoding / Example | Logical check |
| ---: | ---: | --- | --- | --- |
| 0 | 2 | `magic` | `uint16 LE = 0x5343` → `43 53` | Magic candidate ตรงกัน |
| 2 | 1 | `packet_version` | `01` | Reject version ที่ไม่รองรับ |
| 3 | 1 | `message_type` | `01` | Telemetry เท่านั้น |
| 4 | 2 | `node_id` | `01 00` | Mapping จริง TBD |
| 6 | 4 | `boot_nonce` | `4D 3C 2B 1A` | แยกรอบบูต |
| 10 | 4 | `seq` | `7D 00 00 00` = 125 | ใช้จับซ้ำร่วมกับ Node + Boot |
| 14 | 4 | `sample_uptime_ms` | `F4 F5 01 00` = 128500 | ไม่ใช่ UTC |
| 18 | 2 | `distance_mm` | `CE 01` = 462 mm | เท่ากับ 46.2 cm; `FFFF` invalid marker candidate |
| 20 | 6 | `accel_mg[3]` | `14 00 82 00 D4 03` | `(20,130,980) mg` → `(0.02,0.13,0.98) g` |
| 26 | 6 | `gyro_dps10[3]` | `0B 00 FC FF 06 00` | `(11,-4,6)/10` → `(1.1,-0.4,0.6) °/s` |
| 32 | 1 | `validity_flags` | `03` | Bit 0 distance; bit 1 motion |
| 33 | 1 | `origin_kind` | `00` | 0 physical; 1 simulated |
| **Total** | **34** | | | **Candidate only** |

**T01 Golden Hex — 34 bytes**

```text
43 53 01 01 01 00 4D 3C 2B 1A 7D 00 00 00 F4 F5 01 00
CE 01 14 00 82 00 D4 03 0B 00 FC FF 06 00 03 00
```

Expected decoded subset:

```json
{
  "node_id_numeric": 1,
  "boot_nonce": 439041101,
  "seq": 125,
  "sample_uptime_ms": 128500,
  "distance_cm": 46.2,
  "accel_g": {"x": 0.02, "y": 0.13, "z": 0.98},
  "gyro_dps": {"x": 1.1, "y": -0.4, "z": 0.6},
  "distance_valid": true,
  "motion_valid": true,
  "origin_kind": "physical"
}
```

**ประเด็นที่ค้นพบ (ต้องหารือ D-02):** Contract เขียน `magic = 0x5343 ("SC")` แต่เมื่อ Serialize **Little-endian** จะได้ไบต์ `43 53` ซึ่งหากอ่านเป็น ASCII จะเป็น **"CS"** ไม่ใช่ **"SC"**. ตัวทดสอบยึดค่าเลข `0x5343` ตาม Candidate เดิมโดยไม่เปลี่ยนเอง; ทีม Node + Gateway ต้องเลือกว่าจะยึด **เลข Magic** หรือ **ลำดับตัวอักษรบนสายส่ง** ก่อน Freeze

## 4. Golden ACK Frame IF-01A

**Candidate framing:** 21 bytes, Little-endian, `packet_version=1`, `message_type=2`. ACK เพียงยืนยันว่า **Gateway รับ Packet เข้า Processing Queue** ไม่ได้ยืนยัน Cloud, Dashboard, AI หรือ Discord สำเร็จ

| Offset | Length | Field | Value in A01 |
| ---: | ---: | --- | --- |
| 0 | 2 | `magic` | `43 53` |
| 2 | 1 | `packet_version` | `01` |
| 3 | 1 | `message_type` | `02` |
| 4 | 2 | `node_id` | `01 00` |
| 6 | 4 | `boot_nonce` | `4D 3C 2B 1A` |
| 10 | 4 | `seq` | `7D 00 00 00` |
| 14 | 1 | `ack_code` | `00` accepted; candidate `01` duplicate, `02` rejected |
| 15 | 2 | `gateway_id` | `01 00` (illustrative) |
| 17 | 4 | `gateway_uptime_ms` | `0E 94 03 00` = 234510 |
| **Total** | **21** | | |

**A01 Golden Hex — 21 bytes**

```text
43 53 01 02 01 00 4D 3C 2B 1A 7D 00 00 00 00 01 00
0E 94 03 00
```

ACK `accepted`, `duplicate`, `rejected` และกรณี Packet เสียหายที่ **ไม่มี ACK** ต้องให้ Node/Gateway ตกลงร่วมกันเรื่อง Queue/Timeout/Retry/Backoff/Overflow (D-03) ก่อนทดสอบเชิงเวลาจริง

## 5. Offline Candidate Test Catalog

ตารางนี้เป็นผลของ Script กับข้อมูลสังเคราะห์ ไม่ใช่ผลบนบอร์ดจริง

| Test ID | Input / mutation | Expected offline result | Result 10 Nov |
| --- | --- | --- | --- |
| T01 | 34-byte physical Telemetry ตาม Golden Hex | Decode ทั้ง units, signed gyro, flags ถูก | PASS |
| T02 | Node ID 2, simulated origin, seq ใหม่ | แยก Source/Origin ได้ | PASS |
| T03 | Distance flag invalid + `FFFF` marker | `distance_cm` เป็น `null` ไม่ปลอมเป็น 0 | PASS |
| T04 | ตัด Telemetry เหลือ 33 bytes | Reject bad length | PASS |
| T05 | เปลี่ยน Magic | Reject bad magic | PASS |
| T06 | เปลี่ยน version เป็น 2 | Reject unsupported candidate version | PASS |
| T07 | ใส่ Message Type 2 ใน Telemetry frame | Reject wrong type | PASS |
| T08 | เปิด Reserved Validity Bit | Reject reserved bits | PASS |
| T09 | ตั้ง `origin_kind=9` | Reject unknown origin | PASS |
| A01 | 21-byte ACK ตาม Golden Hex | Decode accepted | PASS |
| A02 | ACK code 1 | Decode duplicate | PASS |
| A03 | ACK code 2 | Decode rejected | PASS |
| A04 | ACK code 9 | Reject unknown code | PASS |
| A05 | ACK length 19 bytes | Reject malformed ACK | PASS |
| C01 | Node raw `cloud.telemetry` | มี Source, Sample/Receipt, Validity และ Raw Values | PASS |
| C02 | Gateway raw `cloud.gateway_telemetry` | MAX30102 raw, GPS, LDR มีต้นทาง Gateway | PASS |
| C03 | SOS `system.event` ไม่มี GPS fix | null lat/lon ถูกต้อง | PASS |
| C04 | Dashboard latest + `unknown_clock` | แยก Ingest Time กับ Sample Time | PASS |
| C05 | GPS `fix_valid=false` แต่ยังมี Lat/Lon | Reject stale location | PASS |
| C06 | Distance invalid แต่ `distance_cm=0` | Reject false valid number | PASS |

**ขอบเขตของ Validator:** ตรวจรูปแบบข้อมูลและ Consistency เบื้องต้นเท่านั้น; ไม่ตัดสิน Sampling Rate, TTL, Version Negotiation, Replay Buffer Size, Cloud API, GPS Freshness Threshold หรือ AI Confidence Threshold เพราะยังเป็น TBD. สำหรับ C01/C02/C04 เป็นการตรวจ Minimum Candidate Fields ไม่ใช่ Schema ที่ทุกฝ่ายอนุมัติแล้ว

## 6. วิธีรัน Validator และตรวจ Hex

วางไฟล์ `candidate_validator.py` ในโฟลเดอร์เดียวกับเอกสาร แล้วรันจาก Command Prompt/PowerShell ที่มี Python 3:

```powershell
py candidate_validator.py --self-test
```

ผลที่ตรวจได้ในวันนี้:

```text
20/20 offline candidate checks PASS
NOT TESTED: radio, MCU serializers, real Cloud writes,
Discord delivery, AI/actuator.
IMPORTANT: little-endian 0x5343 yields bytes 43 53 ('CS'),
not ASCII 'SC'.
```

ตัวอย่างการ Decode Frame ที่ได้รับจากทีม (นำ Hex ที่วัดจริงมาแทน):

```powershell
py candidate_validator.py --decode telemetry --hex "4353010101004D3C2B1A7D000000F4F50100CE0114008200D4030B00FCFF06000300"
```

การตรวจไฟล์ JSON ของ Owner:

```powershell
py candidate_validator.py --validate-json node_sample.json --kind cloud.telemetry
```

**คำเตือน:** อย่าเอาไฟล์ Validator นี้ไป Flash ลง MCU หรือใช้เป็น Production Gateway Decoder โดยยังไม่มี Sign-off เพราะเป็นเครื่องมือทดสอบฝั่ง Architect เท่านั้น

## 7. Physical Integration Test Cases ที่ยังต้องทำ

ทุกกรณีด้านล่างเป็น **NOT TESTED (PHYSICAL)**. PM/Test Lead เป็นผู้รับผิดชอบ Formal Test Plan; Architect ตรวจ Interface Compatibility และเก็บ Evidence เชื่อม Component

| ID | ขั้นตอนพิสูจน์ | Expected evidence | Owners / blockers |
| --- | --- | --- | --- |
| H01 | Node ส่ง Frame จริง → Gateway Decode/Enqueue → ACK กลับ | Raw Hex, Decoded Fields, Matching tuple, ACK Log | Pongsinachai + Chananphat; D-02/03 |
| H02 | ใช้ Hotspot จริง แล้ว Join/Reconnect ขณะรับ ESP-NOW | Channel/Band, Packet Arrival ก่อนและหลัง Reconnect | Pongsinachai + Chananphat; D-09 |
| H03 | ตัด Wi-Fi/Cloud เก็บ Backlog แล้วคืนเน็ตและ Replay | Same Record IDs, Buffer/Retry Log, ไม่มี Duplicate Cloud Row | Chananphat; D-03/04 |
| H04 | ส่ง Node และ Gateway MAX30102/GPS/LDR Raw Data → Cloud → Dashboard | Record/Source ID, Units, Validity, Sample/Receipt/Ingest Time | Chananphat + Udomchok; D-04/10 |
| H05 | กด SOS เมื่อ GPS ไม่มี Fix และลอง Retry Event เดิม | ไม่แสดงพิกัดเก่าเป็น Live; Event ID คงเดิม | Chananphat + Udomchok; D-05/06 |
| H06 | AI Model จริงให้ Output แล้ว Gateway สั่ง Servo/Audio | Model Output, Decision ID, Action Trace, Latency, Safe Stop | Chananphat + PM; D-01/07 |
| H07 | Node หลายตัว (จำลองหรือจริงตามที่ทีมเลือก) ส่งพร้อมกัน | แต่ละ Source แยกกันใน Gateway/Cloud/Dashboard | PM + Developers; D-08 |
| H08 | Trace Physical HC-SR04/MPU6050 Reading ครบ E2E | Node → Gateway → Cloud Raw Record → Dashboard ID เดียวกัน | ทุก Component + PM; 20 Nov |
| H09 | ทดสอบ Discord Retry/Failed ACK ตามวิธีที่ทีมเลือก | Delivery State, Duplicate Risk, Secret Handling Evidence | Gateway + Dashboard; D-05 |
| H10 | ตัด Internet ระหว่าง Local Warning และตรวจ Servo Stop | ยังคง Warn/Stop ปลอดภัย; ไม่อ้างว่า Cloud สำเร็จ | Gateway + PM; M4/M7 |

**Evidence template สำหรับแต่ละ H-test**

```text
Test ID: H__
Date / Device / Firmware Version / Hotspot:
Owner(s):
Contract revision approved by:
Input frame / record ID / event ID:
Expected result:
Actual result:
PASS / FAIL / NOT TESTED:
Logs, screenshots or video path:
Blocking decision / follow-up owner:
```

## 8. Open Decisions ที่ต้องรับคำตอบก่อน Freeze

| Decision | ต้องยืนยันอะไร | ผู้ตอบ | ตอนนี้ |
| --- | --- | --- | --- |
| D-01 | บอร์ด ESP32-S3/ESP32-CAM, PSRAM, GPIO | Purchaser + Gateway | OPEN |
| D-02 | 34B/21B Layout, Magic `SC` vs `43 53`, Endian, Units/ID | Node + Gateway | OPEN — Magic mismatch flagged |
| D-03 | Sampling, ACK timeout/retry/backoff, stale TTL, Buffer | Node + Gateway | OPEN |
| D-04 | Cloud Platform/Transport/Auth/Schema/API | Gateway/Cloud + Dashboard | OPEN |
| D-05 | Discord Direct/Relay, Duplicate Caveat, Secret Storage | Gateway/Cloud + Dashboard | OPEN |
| D-06 | UTC Source, GPS Validity/Stale, Event Dedup | Gateway/Cloud + Dashboard | OPEN |
| D-07 | AI Decision/Fall Claim และเกณฑ์ Evidence | Gateway/AI + PM | OPEN |
| D-08 | Target Multi-node สำหรับคะแนน Scalability | PM + Team | OPEN |
| D-09 | ESP-NOW + Actual Hotspot Channel/Reconnect | Node + Gateway | OPEN |
| D-10 | MAX30102/GPS/LDR Raw Fields, Units, Sampling | Gateway/Cloud + Dashboard | OPEN |

**Approval rule:** Interface หนึ่งรายการจะเป็น **AGREED** ได้เมื่อเจ้าของ Producer และ Consumer ที่เกี่ยวข้องตอบรับ Revision เดียวกัน และ Architect บันทึกวันที่/Revision ใน Approval Record แล้วเท่านั้น

## 9. แผนทำงานถัดไปของฝั่ง Architect

- [x] จัดทำ Verification Matrix ครบ IF-01/IF-01A/IF-02–IF-06 (เอกสารนี้)
- [x] จัดทำ Golden Hex 34B/21B พร้อม Expected Decoding (เอกสารนี้)
- [x] สร้างและรัน Offline Candidate Validator (20/20 PASS)
- [x] ระบุความเสี่ยง Magic/Endian ให้ Owner ตอบใน D-02
- [ ] ส่งเอกสารให้ Pongsinachai, Chananphat, Udomchok และ Thapanakorn Review เฉพาะ IF ที่เกี่ยวข้อง
- [ ] รับ AGREE / CHANGE / QUESTION และอัปเดต Test Vectors ตาม Revision ที่ตกลง
- [ ] เก็บตัวอย่าง Hex/JSON จริงจาก Owner แล้ว Compare กับ Golden Candidate
- [ ] ประสาน H01–H10 กับ PM และรวบรวม Evidence สำหรับ Checkpoint **20 Nov 2026**
- [ ] เปลี่ยน State เป็น AGREED เฉพาะรายการที่มีการยืนยันครบจริง

## 10. แหล่งข้อมูลและการควบคุมเวอร์ชัน

1. `Embedded System Proposal.pdf` — Architecture ที่ทีมส่ง: ESP32 Node, ESP32-S3 Gateway, ESP-NOW, Cloud Dashboard, Servo/Audio, Discord
2. `Embedded System (CEDT) - Final Project 2026.pdf` — M3/M4/M5/M6/M7, II Scalability, E4, Checkpoint 20 Nov, Final 8 Dec
3. `INTERFACE_CONTRACT.md` และ `INTERFACE_CONTRACT_team_review_v3.docx` — Candidate Contract v0.2 / Team Review, **PROPOSED / NOT APPROVED**

**Change log:** v0.1 (10 Nov 2026) — First architect-owned verification matrix, golden frame fixtures, 20 offline checks and physical-test backlog. **No firmware/cloud/dashboard/AI implementation changed.**

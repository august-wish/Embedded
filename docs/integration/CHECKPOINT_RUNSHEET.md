# Checkpoint Video Run-Sheet (due Fri 20 Nov 2026, 23:59 ICT)

Prepared by Thiti (integrator) for the PM (Thapanakorn), who owns the video and the submission. Use, change or ignore.

**Course requirement:** progress video, **max 2 minutes**, submitted on MyCourseVille, showing data flowing end to end: **sensor node → gateway → cloud → dashboard.** A missing or late checkpoint costs 2 points.

## 1. Go / No-go (decide Wed 18 Nov, 20:00)

| Level | What is real | What to do |
|---|---|---|
| **A (target)** | Real Node → real Gateway → real Cloud → real Dashboard | Record Fri morning |
| **B** | Real Node → real Gateway → real Cloud, dashboard not ready | Show the cloud console/table as the "dashboard" stage and say so on the video |
| **C** | One real link works, the rest not | Show the real link live. Show the rest with the mock tools, **clearly labelled "simulated"** on screen and in the voice-over |

Honesty rule: never present mock data as real. Label it. Missing real stages cost points, a misleading video costs more.

Backup rule: record a full working take on **Thu 19 Nov** if possible. Fri morning is a retake, Fri evening is the last chance. Submit before 23:59 (late by 24 h = −2 points).

## 2. Pre-flight checklist (the evening before)

- [ ] Phone hotspot on, 2.4 GHz, same hotspot used in all tests. Hotspot name and password **not visible** on screen.
- [ ] Node powered (battery or USB) and mounted/placed where the HC-SR04 can see a hand or box.
- [ ] Gateway powered. Serial Monitor open for both boards (two windows side by side, big font).
- [ ] Cloud console/table open, filtered to show the newest rows, sorted newest first.
- [ ] Dashboard open on the same screen or a second screen.
- [ ] **Hide secrets:** no API keys, tokens, Wi-Fi passwords, Discord webhook URL anywhere on screen (check browser tabs, serial printouts, code windows).
- [ ] Screen recorder tested (Windows: Win+G, or OBS). Microphone level checked.
- [ ] Phone ready to film the hardware (steady, landscape).
- [ ] One full dry run, 3 times in a row, without touching the code.
- [ ] Boards charged. Spare USB cables.

## 3. Shot list (target 1:50)

| Time | On screen | Say (example) |
|---|---|---|
| 0:00–0:10 | Title: "Smart Cane, TMR Praao, Checkpoint" and team names | "This is TMR Praao's smart cane checkpoint." |
| 0:10–0:25 | Architecture diagram (`docs/proposal/data_flow_diagram.png`) | "A sensor node at the cane tip sends distance by ESP-NOW to a gateway at the handle, which uploads to the cloud and a caregiver dashboard." |
| 0:25–0:40 | Phone shot of Node and Gateway boards | "Here are the node with the ultrasonic sensor, and the gateway." |
| 0:40–1:20 | **Split screen:** Node Serial, Gateway Serial, Cloud, Dashboard. Move a hand toward the sensor: 80 cm → 30 cm → 10 cm | "As I move my hand closer, the node reads the distance, the gateway receives it, the cloud stores it, and the dashboard updates." |
| 1:20–1:45 | Freeze on one message. Highlight the same `seq` (e.g. 42) in all four places | "The same message number, 42, appears at every stage, so we can trace one reading from sensor to dashboard." |
| 1:45–1:55 | Slide: "Next: AI warning, SOS alert, offline recovery, GPS and heart rate" | "Next we add the AI warning, SOS alert to Discord, and offline recovery." |

Keep total under 2:00. Do not read from a script on camera if you can avoid it.

## 4. What must be visible (checklist for the PM when reviewing the video)

- [ ] A real or clearly labelled reading leaves the Node.
- [ ] Gateway log shows the **same `node_id` and `seq`**.
- [ ] Cloud shows a row with the **same `seq`** and the distance value.
- [ ] Dashboard shows the value changing when the hand moves.
- [ ] No secret visible. Video length ≤ 2:00. Sound understandable.

## 5. Evidence to save (for `docs/integration/evidence/`)

Name files like `G4_end-to-end_2026-11-19_<what>.<ext>`.

- Node Serial log, Gateway Serial log (text or screenshot) with the traced `seq`.
- Screenshot of the cloud row with the same `seq`.
- Screenshot of the dashboard showing the value.
- The video file (or link) itself.
- Fill `docs/integration/EVIDENCE_TEMPLATE.md` once, for test G4.

Then update `docs/integration/RESULTS.md` rows G1 to G4 from NOT TESTED to PASS (only if the files exist).

## 6. If something breaks on the day

| Symptom | First thing to try |
|---|---|
| Gateway receives nothing from Node | Hotspot on a different channel: reboot both boards after Gateway joins Wi-Fi. Confirm both use the same channel (decision D-09). Check the Gateway MAC in the Node code. |
| Cloud row missing | Check hotspot has Internet. Look at the Gateway Serial for the HTTP/upload error. |
| Dashboard empty | Check it reads the same cloud, and refresh. Show the cloud table instead (Level B). |
| Distance always 0 or wild | Check HC-SR04 wiring, 5 V vs 3.3 V on echo, and that the target is flat and within 1 m. A timeout must show as invalid, not 0. |
| Everything flaky | Use Level C: show the real part you have, plus the mocks labelled "simulated". |

## 7. Mock fallback (only labelled as simulated)
```text
py tools/mock/run_demo.py --count 20
```
It prints the trace of one `seq` through node log → gateway log → cloud. The dashboard stage still needs a real screenshot.

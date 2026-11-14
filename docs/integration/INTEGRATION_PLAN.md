# Integration Plan (draft v0.1)

Owner: Thiti Wanganuttara (System Architect & Integration). Status: DRAFT, not yet reviewed by owners.

## Goal for 20 Nov checkpoint (the "slice")
One HC-SR04 distance reading travels **Node → Gateway → Cloud → Dashboard** and the same `seq` is visible at every stage.

Minimum fields at every stage: `node_id`, `seq`, `distance_cm`, a time value.

## Stages and pass rules
| Stage | Test | Pass rule | Evidence | Owner |
|---|---|---|---|---|
| G0 Ready | Each owner can run own part alone | Node prints readings; Gateway boots; Dashboard opens | Serial log / screenshot | each owner |
| G1 Node → Gateway | Gateway receives Node packet over ESP-NOW | Gateway log shows same `node_id` + `seq` + distance as Node log | Both logs, side by side | Pongsinachai + Chananphat |
| G2 Gateway → Cloud | Gateway uploads one record | Row visible in Cloud console with same `seq` | Screenshot | Chananphat |
| G3 Cloud → Dashboard | Dashboard reads and shows it | Same `seq`, `node_id`, value shown | Screenshot | Udomchok |
| G4 End to end | Move hand in front of sensor, watch dashboard change | Same `seq` seen in G1–G3 within a few seconds | Screen recording | all; PM submits |

## After checkpoint (target before 8 Dec)
Reliable link (ACK/retry), offline buffer + replay, hotspot channel test, GPS/BPM/LDR raw upload, AI → servo/audio, SOS → Discord, multi-node demo.

## Trace fields (follow one message)
`node_id`, `boot_id`, `seq`, `record_id`, `event_id`, and the time fields from `docs/interface/INTERFACE_CONTRACT.md`.

## Status rule
Use only: PASS / FAIL / NOT TESTED. Never PASS without a file in `evidence/`.

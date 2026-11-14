# Smart Cane with Obstacle Detection for the Visually Impaired — TMR Praao

Embedded Systems (CEDT) Final Project 2026, theme: Smart Devices.

## Idea
A smart cane. A Sensor Node at the cane tip (ESP32 + HC-SR04 + MPU6050) sends readings over ESP-NOW to a Gateway at the handle (ESP32-S3 + camera, MAX30102, GPS, LDR, SOS button, servo, speaker). The Gateway warns the user locally, uploads raw data to the cloud, and alerts a caregiver (Discord). A dashboard shows data to the caregiver.

```
Node --ESP-NOW--> Gateway --Wi-Fi--> Cloud --> Dashboard
                    |                    \--> Discord alert
                    \--> Servo + speaker (works without Internet)
```

## Team and roles
| Member | Role | Folder |
|---|---|---|
| Pongsinachai Treepol | Embedded Developer (Sensor Node) | `node/` |
| Chananphat Tacharoenmuang | Embedded Developer (Gateway & Cloud) | `gateway/` |
| Udomchok Chaikhamrongkul | UI/UX & Dashboard Developer | `dashboard/` |
| Thapanakorn Chitvibulsophon | PM & Test Lead | `docs/test/` |
| Thiti Wanganuttara | System Architect & Integration | `docs/architecture/`, `docs/interface/`, `docs/integration/`, `tools/` |

## Folder map
- `docs/architecture/` — system design and data flow
- `docs/interface/` — interface contract (message formats) and example packets
- `docs/integration/` — integration plan, evidence of end-to-end tests
- `docs/proposal/` — submitted proposal and diagram
- `tools/` — validator and mock/test scripts
- `node/`, `gateway/`, `dashboard/` — firmware / web code of each owner

## Rules
- **No secrets in Git** (Wi-Fi passwords, API keys, tokens, Discord webhook). Use `secrets.h` (ignored) and commit only `secrets.example.h`.
- Commit often, small commits, clear messages (`docs:`, `feat:`, `fix:`, `test:`).
- Pull before you push.

## Milestones
- 20 Nov 2026: checkpoint video (Node → Gateway → Cloud → Dashboard)
- 8 Dec 2026: final demo, report, code

## AI tool declaration
AI coding/writing assistants (ChatGPT, Claude) were used for documentation drafting and the offline validator. Details per member are in the final report.

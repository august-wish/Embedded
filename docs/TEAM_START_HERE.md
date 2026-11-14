# Team Start Here — Smart Cane (TMR Praao)

For all five members. Read your own section only (Part 3). About 5 minutes.

## 1. What this repo is for
- One public repo for the whole team (course rule M8: every member needs commits here).
- `node/`, `gateway/`, `dashboard/` = each owner's code. Please push there.
- `docs/` and `tools/` = interface contract, test tools, evidence (Thiti, integrator).

## 2. Where we are (14 Nov 2026)
- **Interface Contract v0.2** (`docs/interface/INTERFACE_CONTRACT.md`) is our **working baseline**. It is not final. If something does not fit your part, ask for a change (Part 5). Early changes are cheap.
- **Checkpoint video due Fri 20 Nov 2026, 23:59.** It must show data going end to end: **Node → Gateway → Cloud → Dashboard.**
- **Smallest goal for the checkpoint:** one HC-SR04 distance number travels the whole way, and the same `seq` (counter) can be seen at every stage. AI, SOS, GPS, heart rate, servo, Discord come after the checkpoint (final demo is 8 Dec).
- The PM (Thapanakorn) owns the schedule and the test plan.

Minimum fields that must survive every stage:

| Field | Meaning |
|---|---|
| `node_id` | which Node sent it (1 = NODE_01) |
| `seq` | counter, +1 for every message |
| `distance_cm` | HC-SR04 reading. If the sensor times out it is **invalid**, never 0 |
| time | `sample_uptime_ms` (time since boot, not clock time) |

## 3. Per-role notes

### Pongsinachai — Sensor Node (`node/`)
- Goal: send `node_id`, `seq`, distance and uptime to the Gateway over ESP-NOW.
- Format: contract proposes a 34-byte binary packet (section 4.2). A short text packet is fine for the checkpoint if binary is hard. Tell Thiti which you use.
- Check your bytes: `py tools/mock/mock_node.py --print-hex` prints the frame we expect. Decode what your board prints: `py tools/validator/candidate_validator.py --decode telemetry --hex "<bytes>"`.
- Send as evidence: Serial Monitor log or photo showing readings with `seq`, plus your board's MAC address.
- HC-SR04 echo can be 5 V. ESP32 pins are 3.3 V. Check your module version.

### Chananphat — Gateway and Cloud (`gateway/`)
- Goal: receive the Node packet, print it on Serial, upload one record to the cloud.
- Please settle with Udomchok: which cloud, and how the dashboard reads it (open decision D-04).
- Board and audio part: BOM link says ESP32-CAM, proposal says ESP32-S3; BOM audio is MAX98357, proposal says DFPlayer. Please confirm what you have (D-01).
- Upload JSON format: contract section 6 (`cloud.telemetry`). Test it against the mock cloud: `py tools/mock/mock_cloud.py --host 0.0.0.0` then POST to `/api/telemetry`. Bad JSON returns `400` with the reason.
- ESP-NOW and Wi-Fi must use the same channel. Try your real phone hotspot early.
- Send as evidence: Serial log of the Gateway receiving a packet, and a screenshot of the cloud row.

### Udomchok — Dashboard (`dashboard/`)
- Goal for the checkpoint: show the latest distance, which node, the `seq`, last update time, and "stale/offline" if no new data (never show 0 for missing data).
- You can start now with fake data: `py tools/mock/mock_cloud.py`, then open `http://127.0.0.1:8080/api/sources`. Run `py tools/mock/mock_node.py --count 0` in another window to keep data flowing. Stop it and watch `freshness` change. These routes are **mock only**: your real cloud and API are your and Chananphat's choice.
- Data shape: contract section 7.
- Send as evidence: screenshot showing the same `seq` that the Gateway log shows.

### Thapanakorn — PM and Test Lead
- You own the schedule, the formal test plan and the performance metrics.
- Needed from you: who records and submits the checkpoint video (due 20 Nov 23:59), what hardware has actually arrived, and the multi-node target (decision D-08).
- `docs/integration/RESULTS.md` and `EVIDENCE_TEMPLATE.md` are there if useful. Reuse or ignore.
- Battery safety (course rule M7): lithium cells need a protection circuit, and must not charge unattended. Check the TP4056 charger modules we ordered have protection.

### Thiti — Architect and Integrator
- Owns: contract, validator, mock tools, integration plan, decision log, results table, traces.
- Verifies each link from evidence you send. Does not write your code.

## 4. Mock tools (optional)
`tools/mock/` has fake Node, Gateway and Cloud programs, so you can test your part alone. Python 3.9+ only, no installs.

```text
py tools/mock/run_demo.py                  # Windows. On Mac/Linux use: python3
py -m unittest discover -s tools/mock -v   # automated checks
```
Details: `tools/mock/README.md`. They are throwaway test tools, not the real system.

## 5. Ask for a change to the contract
Message Thiti with: **which interface + which field + old value → new value + why**. Thiti updates the contract, validator, mocks and logs it in `docs/DECISIONS.md`. Nothing breaks silently.

## 6. How to push your code
```text
git clone https://github.com/august-wish/Embedded.git
cd Embedded
git pull                                   # do this first, every time
# work inside YOUR folder (node/ gateway/ dashboard/)
git add node/                              # or gateway/ or dashboard/
git commit -m "feat(node): read HC-SR04 and print distance"
git push
```
- Small commits, often. Message style: `feat:`, `fix:`, `docs:`, `test:`.
- Only change your own folder. If push is refused with "rejected", run `git pull` then `git push` again.
- First time: set your name and email once: `git config --global user.name "Your Name"` and `git config --global user.email "your-github-noreply-email"`. (GitHub → Settings → Emails shows a noreply address.)

### Never commit secrets
Wi-Fi password, hotspot name, API keys, cloud tokens and the Discord webhook URL must **never** be in Git (course rule). Pattern:
1. Put them in `secrets.h` (already ignored by `.gitignore`).
2. Commit only `secrets.example.h` with fake values. Template: `docs/templates/secrets.example.h`.
3. If you pushed a secret by mistake: tell the team and **change that secret**. Deleting the file is not enough, Git keeps history.

## 7. Evidence: how to hand it to Thiti
Put files in `docs/integration/evidence/` with this name: `G1_node-to-gateway_2026-11-17_serial.txt` (stage, what, date, kind). Or just send a photo/screenshot in the chat and Thiti commits it. A test counts as PASS only when a file exists.

## 8. Optional: print one log line per event
So Thiti can capture your board's Serial output as evidence with `tools/serial/capture_serial.py`, please print one simple line per event, for example:
`TX node=1 seq=125 dist_cm=46.2` (Node) and `RX node=1 seq=125 dist_cm=46.2 ack=accepted` (Gateway).
Full format: `docs/interface/SERIAL_LOG_FORMAT.md`. Other print lines are fine, they are ignored. If you prefer another format, tell Thiti and the tool will follow it.

## 9. If you use an AI coding agent
Tell it: **"Read AGENTS.md first."** The file in the repo root gives it the project, lanes and rules. Some tools read it automatically, some (e.g. Claude Code) do not, so say it explicitly. You still start the agent, review its work, and must be able to explain your own code at Q&A. Declare the tool in `docs/report/06_roles_and_ai_declaration.md`.

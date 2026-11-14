# AGENTS.md — instructions for any AI coding agent in this repo

Project: **Smart Cane** (group TMR Praao), CEDT Embedded Systems Final Project 2026. A Sensor Node (ESP32) sends distance/motion by ESP-NOW to a Gateway (ESP32-S3), which warns locally, uploads to a Cloud, and feeds a caregiver Dashboard.

## First, do this
1. **Ask your human which team member they are** (Part 2). Work only in that member's lane.
2. Read, in order: `docs/TEAM_START_HERE.md`, `docs/DECISIONS.md`, `docs/integration/RESULTS.md`, `docs/interface/INTERFACE_CONTRACT.md`.
3. Run `git pull` before you start and before you push.

Chat decisions are **not** visible to you. If the repo and your human disagree, ask the human, then record the decision in `docs/DECISIONS.md`.

## Roles and lanes

| Member | Role | May edit |
|---|---|---|
| Pongsinachai | Sensor Node | `node/` |
| Chananphat | Gateway and Cloud | `gateway/` |
| Udomchok | Dashboard | `dashboard/` |
| Thapanakorn | PM and Test Lead | `docs/test/`, schedule |
| Thiti | Architect and Integration | `docs/`, `tools/` |

Do **not** edit another member's folder. If you think it needs a change, tell your human to ask that owner.

## Rules
1. **Interface contract** (`docs/interface/INTERFACE_CONTRACT.md`, v0.2) is the **provisional baseline**: not final, but do not change a field, unit, byte layout or ID on your own. Write a change request (template in `docs/DECISIONS.md`) and let the integrator update contract, validator and mocks together.
2. **No secrets in Git, ever:** Wi-Fi passwords, hotspot name, API keys, tokens, Discord webhook URL. Use `secrets.h` (ignored) and commit only `docs/templates/secrets.example.h`-style files. If a secret was committed, tell your human to **change it**; deleting the file is not enough.
3. **Never claim PASS, VERIFIED or "works" without evidence** (a log, screenshot or video file in `docs/integration/evidence/`). Mock or offline results are labelled as such and are **not** hardware results.
4. **Invalid is not zero.** A sensor timeout or missing GPS fix must be marked invalid/null, never `0`.
5. **Keep scope small.** The checkpoint (Fri 20 Nov 2026, 23:59) needs only: HC-SR04 distance Node → Gateway → Cloud → Dashboard, same `seq` visible at every stage. Everything else waits.
6. **The human must understand the code.** Each member is asked about their own code at Q&A (course rule 4.6). Explain what you write in plain words. Don't add large unexplained code.
7. **Declare AI use.** Add a `Co-Authored-By` trailer to commits you help write, and tell your human to add the tool to `docs/report/06_roles_and_ai_declaration.md`.
8. **Don't touch hardware state.** Do not flash firmware, erase flash or open a serial port unless your human says so and the board belongs to them.
9. Don't invent hardware facts. The BOM is outdated. Known open issues: Gateway board (ESP32-CAM vs S3), audio part (MAX98357 vs DFPlayer). Ask.

## Commits
- Small commits, clear messages: `feat(node): ...`, `fix(gateway): ...`, `docs: ...`, `test: ...`.
- Only stage files in your lane: `git add node/` (not `git add .`).
- `git pull` then `git push`. Never force-push.

## Useful commands (Python 3.9+, no installs)
```text
py tools/validator/candidate_validator.py --self-test     # 20 format checks (python3 on Mac/Linux)
py -m unittest discover -s tools/mock -v                  # mock chain tests
py -m unittest discover -s tools/serial -v                # serial capture tests
py tools/mock/run_demo.py                                 # fake Node -> Gateway -> Cloud demo
py tools/validator/candidate_validator.py --decode telemetry --hex "<34 bytes as hex>"
```
Mock tools are throwaway test aids (`tools/mock/README.md`). Their `/api/...` routes are not the real cloud API.

## When to stop and ask your human
- A change would touch another member's folder or the contract.
- You are about to commit anything that looks like a credential.
- You are unsure which board, pin or cloud is really used.
- A test result looks too good to be true.

## Where facts live
Architecture `docs/architecture/` · Contract and example frames `docs/interface/` · Decisions `docs/DECISIONS.md` · Test status `docs/integration/RESULTS.md` · Checkpoint plan `docs/integration/CHECKPOINT_RUNSHEET.md` · Report drafts `docs/report/`.

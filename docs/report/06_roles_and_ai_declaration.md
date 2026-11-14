# 6. Roles, contributions, Git link and AI tool declaration

Git repository: https://github.com/august-wish/Embedded

## 6.1 Roles and contributions

| Member | Role | Main contributions (fill in from real work) | Where in Git |
|---|---|---|---|
| Pongsinachai Treepol | Embedded Developer (Sensor Node) | | `node/` |
| Chananphat Tacharoenmuang | Embedded Developer (Gateway & Cloud) | | `gateway/` |
| Udomchok Chaikhamrongkul | UI/UX & Dashboard Developer | | `dashboard/` |
| Thapanakorn Chitvibulsophon | PM & Test Lead | | `docs/test/` |
| Thiti Wanganuttara | System Architect & Integration | Architecture and data flow; interface contract and message format; offline validator and test vectors; mock test tools; integration plan, decision log, results and evidence; report sections 3 and 4 | `docs/`, `tools/` |

Check each row against `git log --author` before submitting. Every member must have commits.

## 6.2 AI tool declaration (course rule 4.6)

Fill in honestly. Each member must be able to explain the code and design of their own part.

| Tool | Used by | Used for | Parts affected |
|---|---|---|---|
| ChatGPT | Thiti | Early drafts of architecture and interface contract documents | `docs/architecture/`, `docs/interface/` |
| Claude (Claude Code) | Thiti | Reviewing and correcting documents; writing the validator-based mock test tools, decision log, results tables, report drafts, and run-sheet | `tools/`, `docs/` |
| *(others add their own)* | | | |

Commits that were written with AI help carry a `Co-Authored-By` line in the Git history.

## 6.3 Third-party code and sources
List any code, libraries or designs from other people, with links (course rule 4.6). Libraries used in firmware (e.g. ESP-NOW examples, sensor libraries) go here too.

| Item | Source | Used where |
|---|---|---|
| Espressif ESP-NOW programming guide | https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32/api-reference/network/esp_now.html | Frame size limits, channel behaviour |
| *(add firmware libraries)* | | |

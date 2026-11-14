# Final Report — working folder

Final report: **PDF, max 10 pages** (cover, table of contents, references and appendix don't count). English or Thai. Due **Tue 8 Dec 2026, 23:59**. Pages beyond 10 are not graded.

## The six graded parts (1 point each)

| # | Part | Draft owner | File |
|---|---|---|---|
| 1 | Introduction and problem statement | Udomchok / PM (to agree) | `01_introduction.md` (not started) |
| 2 | Related work and similar solutions, with references | PM (to agree) | `02_related_work.md` (not started) |
| 3 | **System design:** overview diagram, sensor node, gateway, cloud/storage, dashboard, **message format** | Thiti (overview, message format), each owner for their own block | `03_system_design.md` |
| 4 | **Test results and performance metrics** | PM + Thiti (integration results) | `04_integration_results.md` |
| 5 | Discussion and conclusion | all | `05_discussion.md` (not started) |
| 6 | Role and contribution of each member, **Git link**, **AI tool declaration** | all, Thiti compiles | `06_roles_and_ai_declaration.md` |

Only 03, 04 and 06 are started here. They are the architect's parts. The other three are placeholders for the owners and PM. Each member must be able to explain their own part at Q&A (individual Q&A is 3 points).

## Rules from the course brief
- Each member's work must appear in the Git commit history.
- Declare which AI tools were used and for which parts. Code you cannot explain in Q&A may get no credit.
- Code, libraries or designs from other people must be cited in the report and the repo.
- No Wi-Fi passwords, API keys or tokens in the repo.

## How to fill these in
- Facts come from `docs/architecture/`, `docs/interface/`, `docs/integration/RESULTS.md`, `docs/DECISIONS.md`.
- Write results **only** from real evidence in `docs/integration/evidence/`. Mock numbers are never test results.
- Keep sentences short and concrete. Use measured numbers with how they were measured.
- When 03 or 04 changes after a contract change, update them from `docs/DECISIONS.md`.

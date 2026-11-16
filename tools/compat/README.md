# Compatibility probes

Offline checks that a real component understands our contract. They read source files only and never touch the network.

| Probe | Checks | Run |
|---|---|---|
| `probe_worker_contract.mjs` | Hosted Worker (`dashboard/hosted-site/worker/index.js`) vs a contract-shaped `cloud.telemetry` record (`contract_record.json`) | `node tools/compat/probe_worker_contract.mjs` |

Exit code 1 while any check fails; it turns green when the component follows the contract. Result and reasoning: `docs/integration/evidence/F01_worker-vs-contract_2026-11-16.md`.

If the contract changes, update `contract_record.json` (it must pass `py tools/validator/candidate_validator.py --validate-json tools/compat/contract_record.json --kind cloud.telemetry`).

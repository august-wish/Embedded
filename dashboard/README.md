# Smart Cane dashboard · 20 Nov checkpoint

Dashboard owner: **Boom Udomchok (GitHub: [@Boomudm](https://github.com/Boomudm))**. This folder contains the checkpoint viewer, its mock evidence, and the reviewable source of the hosted caregiver website.

This is Udomchok's React dashboard in `dashboard/`. It reads the provisional IF-04 Cloud → Dashboard model and displays the latest `distance_cm`, `source_id` (Node), `source_seq`, Cloud ingestion time, and freshness. The full caregiver UI already exists separately; this small screen makes the checkpoint trace easy to record.

The deployed caregiver website's reviewable source is in `dashboard/hosted-site/`. It has its own D1 database and deployment flow; this checkpoint viewer still uses the team mock until D-04 is agreed.

## Run with the team mock (offline simulation)

From the repo root, use separate terminals:

```sh
python3 tools/mock/mock_cloud.py
python3 tools/mock/mock_gateway.py
python3 tools/mock/mock_node.py --count 0
```

Then run the dashboard:

```sh
cd dashboard
npm ci
npm run dev
```

Open the local URL printed by Vite. Show the same `seq` in Node/Gateway logs, `http://127.0.0.1:8080/api/latest?source=NODE_01`, and this screen. Stop the Node to see `stale` and then `offline` (mock defaults: 10 s and 60 s). An invalid or missing distance is `—`, never `0`.

`npm test` checks the IF-04 adapter; `npm run build` makes a production bundle. The local Vite server proxies `/api` to the mock Cloud at port 8080. For a real Cloud, set `VITE_CLOUD_BASE_URL` in a local `.env` file only after D-04 settles the provider, read endpoint, CORS/auth and deployment. The URL must expose `/api/sources` or the adapter must be updated for the agreed API. Do not commit `.env` or credentials. Browser-side secrets are unsafe: use a backend proxy if the real Cloud requires private tokens.

The mock's routes and freshness thresholds are test conveniences, not an agreed real Cloud interface or hardware evidence. Send a screenshot with matching `seq` to Thiti for checkpoint evidence.

## Contract clarification for Thiti

IF-04 `source_seq`: **absent from the section 7 minimum envelope → required nonnegative integer**. The mock already returns it, and IF-03 `cloud.telemetry` already has it. The dashboard needs this field to show the same `seq` as the Node, Gateway and Cloud at the 20 Nov checkpoint. Please update the IF-04 envelope and its validator/mock together. No existing field is renamed.

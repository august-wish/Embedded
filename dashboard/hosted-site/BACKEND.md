# Smart Cane Cloud and Dashboard contract

The caregiver dashboard is rendered by React 19. Its UI source is in `src/main.jsx`; `src/dashboard-template.html` retains the existing layout and SVG assets while React owns the rendered tree, state, navigation, forms, and API polling. `npm run build` bundles React into `dist/app.js` and then embeds the dashboard assets into the Cloudflare Worker. The API and D1 schema remain unchanged.

The hosted Site includes a Cloudflare Worker API and D1 database implementing the proposed Interface Contract v0.2.1 for IF-03, IF-04, and the Dashboard side of IF-05.

## Caregiver login

Caregivers sign in with an email and password stored as six chained PBKDF2-HMAC-SHA-256 rounds of 100,000 iterations each, with a unique per-account salt and a distinct salt for each round in D1. The browser receives an opaque, seven-day `Secure`, `HttpOnly`, `SameSite=Strict` session cookie; D1 stores only the hash of that random session token. Login failures are limited per account. The first account is claimed once at `/setup` while the Site remains owner-private and the existing ChatGPT identity is present. It keeps that identity's existing caregiver-to-recipient links. Once the owner has set a password, the Site can be switched to public so the login page can open without ChatGPT. Public registration is disabled.

Gateway writes require `Authorization: Bearer <GATEWAY_WRITE_TOKEN>`; store that token as a Sites runtime secret, never in source. The old Sites bypass header is not a substitute for this check once the Site is public. Caregiver reads and mutations require a valid D1 session; browser mutations also require same-origin requests.

## Read API

- `GET /api/health` — database and contract version
- `GET /api/dashboard?device_id=SC-ESP32-001` — latest structured record, source health, alerts, and recent events
- `GET /api/node/firebase/latest` — signed-in caregiver proxy for the public Firebase latest Node feed
- `GET /api/telemetry/latest?device_id=SC-ESP32-001` — latest raw record
- `GET /api/telemetry/history?device_id=SC-ESP32-001&from=<ISO>&to=<ISO>&source_id=NODE_01&limit=50` — time-range history sorted by Cloud ingestion time
- `GET /api/events?device_id=SC-ESP32-001&limit=50` — stable emergency event records
- `POST /api/alerts/:id/acknowledge` — acknowledge an active caregiver alert

Caregiver read routes require the D1 session and enforce the caregiver-to-recipient device mapping.

The dashboard response also includes `node_latest` and `node_freshness`, so the Overview can keep showing the Node's `source_seq` and HC-SR04 distance when a newer Gateway-local record arrives. Overview opens in live mode and polls every five seconds. Until the first cloud record arrives, it displays an explicitly labeled demo sample; demo values are not stored in D1.

Overview also polls the team's public Firebase RTDB `smart_cane/latest.json` through the Worker. That feed currently has only `node_id`, `seq`, and `distance_cm`. Its values take priority in the separate shared Node feed panel; `"invalid"` is displayed as unavailable, not zero. The proxy records when it fetched the value, but the Firebase record has no sensor timestamp, so the panel does not claim the measurement is fresh. The feed is global and has no device or caregiver mapping; it must not be used to assert a selected person's safety.

## Gateway write API

- `POST /api/telemetry` — store one Node or Gateway-local telemetry record
- `POST /api/events` — store one separate SOS or suspected-fall event

The Worker protects write routes with the runtime `GATEWAY_WRITE_TOKEN`. The ESP32 Gateway sends it in the `Authorization` header. Keep that credential outside Git.

The Worker accepts both the IF-03 contract record and the older nested sensor shape. Each telemetry upload should include:

- `schema_version`, `kind`, and stable `record_id`
- `gateway_id`, `source_id`, `origin_kind`, and `source_boot_id`; `device_id` is optional and defaults to `gateway_id`
- sequence/uptime and distinct sample, Gateway-receipt, and Cloud-ingestion time references
- IF-03 `readings.distance_cm`, `readings.accel_g`, `readings.gyro_dps`, and top-level `validity`; nested `readings.hc_sr04` and `readings.mpu6050` remain accepted
- engineering units encoded in field names and returned explicitly by the read API

Contract acceleration in g is converted to m/s² for the existing D1 columns and read API. Invalid or missing sensor values are stored as null. The Worker returns HTTP 202 for a new record and 200 for a duplicate; Gateway should treat any 2xx response as success. The dashboard only displays a device after the caregiver links its effective device ID (the `gateway_id` for contract records).

See `tools/compat/contract_record.json` in the team repo for the IF-03 payload example.

Stable `record_id` and `event_id` values make retries idempotent. Physical and simulated sources remain distinct. Missing or invalid sensor readings are returned as invalid, never as zero.

## Freshness and GPS

The current prototype uses:

- fresh: at most 30 seconds since Cloud ingestion
- stale: over 30 seconds and at most 90 seconds
- offline: over 90 seconds
- unknown clock: no usable receipt/ingestion time

The Dashboard opens Google Maps only when `fix_valid` is true, `fix_age_ms` is present and at most 90 seconds, and the containing record is fresh.

These values remain team-review parameters in the contract and can be changed after hardware integration testing.

## Emergency delivery

The Cloud stores and displays emergency records but does not call Discord directly. This preserves the Proposal's logical Gateway → caregiver Discord path. The Gateway reports `delivery_state` as `gateway_expected`, `gateway_sent`, `delivered`, `failed`, or `not_configured`.

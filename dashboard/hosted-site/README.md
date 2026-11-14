# Hosted Smart Cane caregiver Site

Dashboard owner: **Boom Udomchok (GitHub: [@Boomudm](https://github.com/Boomudm))**.

This is the source of the React caregiver website hosted at `https://smart-cane-care.stripylapel2.chatgpt.site/`. It is included in Udomchok's `dashboard/` lane so the team can review and archive the UI and its D1-backed API. The hosted Site uses its own deployment repository; a commit here does not deploy the website.

The Site has a one-time account claim at `/setup` while owner-private. That page uses the existing platform identity only to migrate the current caregiver and recipient links. The user chooses a password there. After the account exists, the Site can be opened to visitors and its own email/password login protects `/app` and caregiver APIs. There is no public registration. Password hashes and opaque session hashes are stored in D1 via `drizzle/0003_local_auth.sql`.

Gateway writes require the separately configured `GATEWAY_WRITE_TOKEN` runtime secret in `Authorization: Bearer <token>`. No token or password is in this folder. The Gateway owner must agree on this auth header under D-04 before using the hosted API.

Build and check locally:

```sh
npm ci
npm run build
npm test
```

`dist/login.html`, `dist/setup.html`, `dist/styles.css`, and `dist/assets/` are source assets. Other `dist/` files are generated. The separate `dashboard/` app is the checkpoint mock viewer; it does not automatically read this hosted Site's D1 database.

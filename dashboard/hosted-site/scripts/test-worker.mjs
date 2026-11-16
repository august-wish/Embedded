import assert from "node:assert/strict";
import worker from "../dist/server/index.js";

// Match the production Worker's PBKDF2 ceiling so account creation cannot
// pass locally and then fail with a 500 after deployment.
const nativeCrypto = globalThis.crypto;
let pbkdf2Calls = 0;
Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: {
    getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto),
    randomUUID: nativeCrypto.randomUUID.bind(nativeCrypto),
    subtle: {
      importKey: nativeCrypto.subtle.importKey.bind(nativeCrypto.subtle),
      digest: nativeCrypto.subtle.digest.bind(nativeCrypto.subtle),
      deriveBits: (algorithm, key, length) => {
        assert.ok(algorithm.iterations <= 100_000, "Cloudflare PBKDF2 supports at most 100,000 iterations per call");
        pbkdf2Calls += 1;
        return nativeCrypto.subtle.deriveBits(algorithm, key, length);
      },
    },
  },
});

const authUsers = new Map();
const authSessions = new Map();
const loginLimits = new Map();

class Statement {
  constructor(sql) { this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() {
    if (this.sql.includes("SELECT id FROM auth_users LIMIT 1")) return [...authUsers.values()][0] || null;
    if (this.sql.includes("SELECT * FROM auth_users WHERE email")) return [...authUsers.values()].find((user) => user.email === this.values[0]) || null;
    if (this.sql.includes("FROM auth_sessions s")) {
      const session = authSessions.get(this.values[0]);
      const user = session && session.expires_at > this.values[1] ? authUsers.get(session.user_id) : null;
      return user ? { id: user.id, email: user.email, full_name: user.full_name } : null;
    }
    if (this.sql.includes("SELECT attempts FROM auth_login_limits")) return loginLimits.get(this.values[0]) || null;
    if (this.sql.includes("SELECT * FROM devices")) return null;
    if (this.sql.includes("SELECT * FROM telemetry_readings")) return null;
    if (this.sql.includes("SELECT id FROM telemetry_readings")) return null;
    if (this.sql.includes("SELECT id FROM events")) return null;
    if (this.sql.includes("SELECT id FROM care_recipients")) return { id: 1 };
    if (this.sql.includes("SELECT p.id FROM care_recipients")) return { id: 1 };
    if (this.sql.includes("SELECT * FROM care_recipients WHERE device_id")) {
      return { id: 2, display_name: this.values[0] === "SC-ESP32-002" ? "Mali" : "Somchai", relationship: "Family member", device_id: this.values[0] };
    }
    return { ok: 1 };
  }
  async all() {
    if (this.sql.includes("SELECT p.* FROM care_recipients")) {
      return { results: [{ id: 1, display_name: "Somchai", relationship: "Family member", device_id: "SC-ESP32-001" }] };
    }
    return { results: [] };
  }
  async run() {
    if (this.sql.includes("INSERT INTO auth_users")) {
      const [id, email, full_name, password_salt, password_hash, password_iterations, created_at, updated_at] = this.values;
      authUsers.set(id, { id, email, full_name, password_salt, password_hash, password_iterations, created_at, updated_at, failed_login_count: 0, locked_until: null });
    }
    if (this.sql.includes("INSERT INTO auth_sessions")) {
      const [token_hash, user_id, created_at, expires_at] = this.values;
      authSessions.set(token_hash, { token_hash, user_id, created_at, expires_at });
    }
    if (this.sql.includes("UPDATE auth_users SET failed_login_count = ?,")) {
      const user = authUsers.get(this.values[2]);
      user.failed_login_count = this.values[0]; user.locked_until = this.values[1];
    }
    if (this.sql.includes("UPDATE auth_users SET failed_login_count = 0")) {
      const user = authUsers.get(this.values[0]);
      user.failed_login_count = 0; user.locked_until = null;
    }
    if (this.sql.includes("DELETE FROM auth_sessions")) authSessions.delete(this.values[0]);
    if (this.sql.includes("INSERT INTO auth_login_limits")) {
      const [key, resetAt, now] = this.values;
      const old = loginLimits.get(key);
      loginLimits.set(key, { attempts: !old || old.reset_at <= now ? 1 : old.attempts + 1, reset_at: !old || old.reset_at <= now ? resetAt : old.reset_at });
    }
    return { meta: { changes: 1 } };
  }
}

const DB = {
  prepare(sql) { return new Statement(sql); },
  async batch(statements) { return statements.map(() => ({ success: true, meta: { changes: 1 } })); },
};

async function request(path, init) {
  return worker.fetch(new Request(`https://smart-cane.test${path}`, init), { DB, GATEWAY_WRITE_TOKEN: "test-gateway-token" }, {});
}

const page = await request("/");
assert.equal(page.status, 200);
assert.match(await page.text(), /เข้าสู่ระบบผู้ดูแล/);
assert.doesNotMatch(await (await request("/")).text(), /เข้าสู่ระบบด้วย ChatGPT/);

const app = await request("/app");
assert.equal(app.status, 303);
assert.equal(app.headers.get("location"), "/");
assert.equal((await request("/api/dashboard?device_id=SC-ESP32-001")).status, 401);
assert.equal((await request("/api/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 401);

const authHeaders = {
  "oai-authenticated-user-id": "caregiver-1",
  "oai-authenticated-user-email": "pim@example.com",
  "oai-authenticated-user-full-name": "Pim%20Caregiver",
  "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
};
assert.equal((await request("/", { headers: authHeaders })).headers.get("location"), "/setup");
const setup = await request("/setup", { headers: authHeaders });
assert.equal(setup.status, 200);
assert.match(await setup.text(), /pim@example.com/);

const claimBody = new URLSearchParams({ password: "correct horse battery staple", confirm_password: "correct horse battery staple" });
assert.equal((await request("/auth/claim", { method: "POST", headers: { ...authHeaders, "content-type": "application/x-www-form-urlencoded" }, body: claimBody })).status, 403);
const claim = await request("/auth/claim", {
  method: "POST", headers: { ...authHeaders, origin: "https://smart-cane.test", "content-type": "application/x-www-form-urlencoded" }, body: claimBody,
});
assert.equal(claim.status, 303);
assert.equal(pbkdf2Calls, 6);
assert.equal(claim.headers.get("location"), "/app");
assert.match(claim.headers.get("set-cookie"), /Secure; HttpOnly; SameSite=Strict/);
assert.equal((await request("/setup", { headers: authHeaders })).headers.get("location"), "/");
const cookie = claim.headers.get("set-cookie").split(";")[0];
const cookieHeaders = { cookie };
const protectedApp = await request("/app", { headers: cookieHeaders });
assert.equal(protectedApp.status, 200);
const appText = await protectedApp.text();
assert.match(appText, /id="root"/);
assert.match(appText, /app\.js\?v=20261115-event-status-nav/);

const appScript = await request("/app.js");
assert.equal(appScript.status, 200);
const appScriptText = await appScript.text();
assert.match(appScriptText, /createRoot/);
assert.match(appScriptText, /High heart rate/);
assert.match(appScriptText, /Dark environment/);

const health = await request("/api/health");
assert.equal(health.status, 200);
const healthBody = await health.json();
assert.equal(healthBody.database, "connected");
assert.equal(healthBody.interface_contract, "0.2.1");

assert.equal((await request("/api/session", { headers: authHeaders })).status, 401);
const session = await request("/api/session", { headers: cookieHeaders });
assert.equal(session.status, 200);
assert.equal((await session.json()).user.name, "Pim Caregiver");

const people = await request("/api/people", { headers: cookieHeaders });
assert.equal(people.status, 200);
assert.equal((await people.json()).people.length, 1);

const addPerson = await request("/api/people", {
  method: "POST",
  headers: { ...cookieHeaders, origin: "https://smart-cane.test", "content-type": "application/json" },
  body: JSON.stringify({ display_name: "Mali", relationship: "Parent", device_id: "SC-ESP32-002" }),
});
assert.equal(addPerson.status, 201);
assert.equal((await addPerson.json()).person.device_id, "SC-ESP32-002");

const dashboard = await request("/api/dashboard?device_id=SC-ESP32-001", { headers: cookieHeaders });
assert.equal(dashboard.status, 200);
assert.equal((await dashboard.json()).connection, "offline");

const telemetry = await request("/api/telemetry", {
  method: "POST",
  headers: { authorization: "Bearer test-gateway-token", "content-type": "application/json" },
  body: JSON.stringify({
    schema_version: "0.2",
    kind: "telemetry",
    record_id: "boot-01:telemetry:42",
    device_id: "SC-ESP32-001",
    gateway_id: "GW-001",
    source_id: "NODE_01",
    source_boot_id: "boot-01",
    source_seq: 42,
    source_sample_uptime_ms: 12000,
    origin_kind: "physical",
    readings: {
      hc_sr04: { distance_cm: 146, valid: true },
      mpu6050: { accel_z_mps2: 9.7, classification: "walking", valid: true },
      max30102: { ir_raw: 52340, red_raw: 49720, bpm: 76, valid: true },
      ldr: { adc_raw: 2480, lux: 620, valid: true },
      gps: { lat_deg: 13.7262, lon_deg: 100.5581, accuracy_m: 6, fix_valid: true, fix_age_ms: 0 },
      ai: { model_name: "fall-motion-classifier", model_version: "1.0.0", classification: "normal_walking", confidence: 0.96, valid: true },
    },
  }),
});
assert.equal(telemetry.status, 202);
const telemetryBody = await telemetry.json();
assert.equal(telemetryBody.ok, true);
assert.equal(telemetryBody.record_id, "boot-01:telemetry:42");

const contractRecord = {
  schema_version: 1, kind: "cloud.telemetry", record_id: "GW_01:NODE_01:BOOT_A1:125",
  gateway_id: "GW_01", source_id: "NODE_01", source_boot_id: "BOOT_A1",
  source_seq: 125, source_sample_uptime_ms: 128500, origin_kind: "physical",
  readings: { distance_cm: 46.2, accel_g: { x: 0.02 }, gyro_dps: { x: 1.1 } },
  validity: { distance: true, motion: true },
};
const contractUpload = await request("/api/telemetry", {
  method: "POST",
  headers: { authorization: "Bearer test-gateway-token", "content-type": "application/json" },
  body: JSON.stringify(contractRecord),
});
assert.equal(contractUpload.status, 202);
assert.equal((await contractUpload.json()).record_id, contractRecord.record_id);

const telemetryHistory = await request("/api/telemetry/history?device_id=SC-ESP32-001&limit=20", { headers: cookieHeaders });
assert.equal(telemetryHistory.status, 200);
assert.deepEqual((await telemetryHistory.json()).records, []);

const latestTelemetry = await request("/api/telemetry/latest?device_id=SC-ESP32-001", { headers: cookieHeaders });
assert.equal(latestTelemetry.status, 200);
assert.equal((await latestTelemetry.json()).record, null);

const emergencyEvent = await request("/api/events", {
  method: "POST",
  headers: { authorization: "Bearer test-gateway-token", "content-type": "application/json" },
  body: JSON.stringify({
    schema_version: "0.2",
    kind: "event",
    event_id: "boot-01:sos:43",
    device_id: "SC-ESP32-001",
    gateway_id: "GW-001",
    source_id: "NODE_01",
    origin_kind: "physical",
    event_type: "sos_pressed",
    severity: "emergency",
    gps: { lat_deg: 13.7262, lon_deg: 100.5581, fix_valid: true, fix_age_ms: 0 },
    delivery_state: "gateway_expected",
  }),
});
assert.equal(emergencyEvent.status, 202);
assert.equal((await emergencyEvent.json()).event_id, "boot-01:sos:43");

const invalid = await request("/api/telemetry", {
  method: "POST",
  headers: { authorization: "Bearer test-gateway-token", "content-type": "application/json" },
  body: JSON.stringify({ device_id: "invalid device id" }),
});
assert.equal(invalid.status, 400);

const acknowledge = await request("/api/alerts/1/acknowledge", { method: "POST" });
assert.equal(acknowledge.status, 403);

const authorizedAcknowledge = await request("/api/alerts/1/acknowledge", { method: "POST", headers: { ...cookieHeaders, origin: "https://smart-cane.test" } });
assert.equal(authorizedAcknowledge.status, 200);
assert.equal((await authorizedAcknowledge.json()).ok, true);

const badLogin = await request("/auth/login", { method: "POST", headers: { origin: "https://smart-cane.test", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: "pim@example.com", password: "wrong password" }) });
assert.equal(badLogin.headers.get("location"), "/?error=invalid");
const goodLogin = await request("/auth/login", { method: "POST", headers: { origin: "https://smart-cane.test", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: "pim@example.com", password: "correct horse battery staple" }) });
assert.equal(goodLogin.status, 303);
assert.equal(pbkdf2Calls, 18);
assert.match(goodLogin.headers.get("set-cookie"), /__Host-smartcane_session=/);
const logout = await request("/auth/logout", { method: "POST", headers: { ...cookieHeaders, origin: "https://smart-cane.test" } });
assert.equal(logout.status, 303);
assert.equal((await request("/api/session", { headers: cookieHeaders })).status, 401);

console.log("Worker API tests passed");

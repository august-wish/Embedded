const page = "__SMART_CANE_HTML__";
const loginPage = "__SMART_CANE_LOGIN__";
const setupPage = "__SMART_CANE_SETUP__";
const styles = "__SMART_CANE_CSS__";
const appScript = "__SMART_CANE_JS__";

const CONTRACT_VERSION = "0.2";
const FRESH_AFTER_MS = 30_000;
const OFFLINE_AFTER_MS = 90_000;
const GPS_CURRENT_AFTER_MS = 90_000;
const PASSWORD_ITERATIONS = 600_000;
const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;
const SESSION_COOKIE = "__Host-smartcane_session";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function asset(body, contentType) {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}

function html(body) {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function legacyChatGPTUser(request) {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name") || "";
  let name = encodedName;
  if (request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(encodedName); } catch { name = encodedName; }
  }
  return { id, email, name: name || email.split("@")[0] || "Caregiver" };
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const encoded = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4)), (char) => char.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function passwordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256));
}

async function sha256(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function sessionToken(request) {
  const match = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9_-]{43})(?:;|$)`));
  return match?.[1] || null;
}

async function authenticatedUser(request, env) {
  const token = sessionToken(request);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.full_name FROM auth_sessions s
    JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(hash, new Date().toISOString()).first();
  return row ? { id: row.id, email: row.email, name: row.full_name } : null;
}

function cookieHeader(token, maxAge = SESSION_MAX_AGE_S) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

async function newSession(env, userId) {
  const token = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_S * 1000);
  await env.DB.prepare("INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), userId, now.toISOString(), expires.toISOString()).run();
  return cookieHeader(token);
}

function redirect(path, cookie) {
  const headers = { location: path, "cache-control": "no-store" };
  if (cookie) headers["set-cookie"] = cookie;
  return new Response(null, { status: 303, headers });
}

function sameOrigin(request, url) {
  return request.headers.get("origin") === url.origin;
}

async function readForm(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 4096 || !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return null;
  const body = await request.text();
  return body.length <= 4096 ? new URLSearchParams(body) : null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function authorizedGateway(request, env) {
  const secret = env.GATEWAY_WRITE_TOKEN;
  const value = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !value || value.length > 256) return false;
  return constantTimeEqual(new TextEncoder().encode(value), new TextEncoder().encode(secret));
}

async function handleAuth(request, env, url) {
  if (!sameOrigin(request, url)) return new Response("Forbidden", { status: 403 });
  if (url.pathname === "/auth/logout") {
    const token = sessionToken(request);
    if (token) await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return redirect("/", cookieHeader("", 0));
  }
  const form = await readForm(request);
  if (!form) return new Response("Invalid form", { status: 400 });
  const password = form.get("password");
  if (typeof password !== "string") return new Response("Invalid form", { status: 400 });

  if (url.pathname === "/auth/claim") {
    const legacy = legacyChatGPTUser(request);
    if (!legacy) return new Response("Forbidden", { status: 403 });
    const existing = await env.DB.prepare("SELECT id FROM auth_users LIMIT 1").first();
    if (existing) return redirect("/");
    if (password.length < 12 || password.length > 128 || password !== form.get("confirm_password")) return redirect("/setup?error=invalid");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await passwordHash(password, salt);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO auth_users
      (id, email, full_name, password_salt, password_hash, password_iterations, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(legacy.id, legacy.email.toLowerCase(), legacy.name, base64Url(salt), base64Url(hash), PASSWORD_ITERATIONS, now, now).run();
    return redirect("/app", await newSession(env, legacy.id));
  }

  if (url.pathname === "/auth/login") {
    const email = String(form.get("email") || "").trim().toLowerCase();
    if (!email || email.length > 254 || password.length > 128) return redirect("/?error=invalid");
    const ipKey = await sha256(request.headers.get("cf-connecting-ip") || "unknown-ip");
    const now = new Date().toISOString();
    const resetAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await env.DB.prepare(`INSERT INTO auth_login_limits (key, attempts, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN reset_at <= ? THEN 1 ELSE attempts + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END`)
      .bind(ipKey, resetAt, now, now).run();
    const limit = await env.DB.prepare("SELECT attempts FROM auth_login_limits WHERE key = ?").bind(ipKey).first();
    if (limit?.attempts > 10) return redirect("/?error=invalid");
    const user = await env.DB.prepare("SELECT * FROM auth_users WHERE email = ?").bind(email).first();
    if (user?.locked_until && Date.parse(user.locked_until) > Date.now()) return redirect("/?error=invalid");
    const salt = user ? fromBase64Url(user.password_salt) : new Uint8Array(16);
    const actual = await passwordHash(password, salt, user?.password_iterations || PASSWORD_ITERATIONS);
    const expected = user ? fromBase64Url(user.password_hash) : new Uint8Array(32);
    if (!user || !constantTimeEqual(actual, expected)) {
      if (user) {
        const failures = (user.failed_login_count || 0) + 1;
        const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
        await env.DB.prepare("UPDATE auth_users SET failed_login_count = ?, locked_until = ? WHERE id = ?")
          .bind(lockedUntil ? 0 : failures, lockedUntil, user.id).run();
      }
      return redirect("/?error=invalid");
    }
    await env.DB.prepare("UPDATE auth_users SET failed_login_count = 0, locked_until = NULL WHERE id = ?").bind(user.id).run();
    return redirect("/app", await newSession(env, user.id));
  }

  return new Response("Not found", { status: 404 });
}

async function ensureCaregiver(env, user) {
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO caregivers (id, email, full_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, full_name = excluded.full_name, updated_at = excluded.updated_at`)
    .bind(user.id, user.email, user.name, now, now).run();

  let people = await env.DB.prepare(`SELECT p.* FROM care_recipients p
    JOIN caregiver_recipients cp ON cp.recipient_id = p.id
    WHERE cp.caregiver_id = ? ORDER BY p.display_name`).bind(user.id).all();

  if (!(people.results ?? []).length) {
    await env.DB.prepare(`INSERT INTO care_recipients (display_name, relationship, device_id, created_at, updated_at)
      VALUES ('Somchai', 'Family member', 'SC-ESP32-001', ?, ?)
      ON CONFLICT(device_id) DO NOTHING`).bind(now, now).run();
    const defaultPerson = await env.DB.prepare("SELECT id FROM care_recipients WHERE device_id = 'SC-ESP32-001'").first();
    if (defaultPerson) {
      await env.DB.prepare(`INSERT INTO caregiver_recipients (caregiver_id, recipient_id, created_at)
        VALUES (?, ?, ?) ON CONFLICT(caregiver_id, recipient_id) DO NOTHING`)
        .bind(user.id, defaultPerson.id, now).run();
    }
    people = await env.DB.prepare(`SELECT p.* FROM care_recipients p
      JOIN caregiver_recipients cp ON cp.recipient_id = p.id
      WHERE cp.caregiver_id = ? ORDER BY p.display_name`).bind(user.id).all();
  }
  return people.results ?? [];
}

async function caregiverCanAccessDevice(env, caregiverId, deviceId) {
  return env.DB.prepare(`SELECT p.id FROM care_recipients p
    JOIN caregiver_recipients cp ON cp.recipient_id = p.id
    WHERE cp.caregiver_id = ? AND p.device_id = ? LIMIT 1`).bind(caregiverId, deviceId).first();
}

function finiteNumber(value, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return integer ? Math.round(number) : number;
}

function cleanText(value, fallback = null, maxLength = 80) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : fallback;
}

function booleanInt(value) {
  return value === true || value === 1 || value === "1" ? 1 : 0;
}

function validFor(value, explicit) {
  if (explicit !== undefined && explicit !== null) return booleanInt(explicit);
  return value !== null && value !== undefined ? 1 : 0;
}

function isoTime(value) {
  const text = cleanText(value, null, 40);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function stableId(value, prefix) {
  const id = cleanText(value, null, 128);
  return id && /^[A-Za-z0-9._:-]+$/.test(id) ? id : `${prefix}:${crypto.randomUUID()}`;
}

function allowedValue(value, choices, fallback) {
  const text = cleanText(value, fallback, 40);
  return choices.includes(text) ? text : fallback;
}

function normalizeTelemetry(input) {
  const deviceId = cleanText(input.device_id, null, 64);
  if (!deviceId || !/^[A-Za-z0-9_-]+$/.test(deviceId)) {
    return { error: "device_id is required and may contain only letters, numbers, _ and -" };
  }

  const readings = input.readings ?? {};
  const ultrasonic = readings.hc_sr04 ?? readings.ultrasonic ?? {};
  const motion = readings.mpu6050 ?? {};
  const pulse = readings.max30102 ?? {};
  const gps = readings.gps ?? input.gps ?? {};
  const light = readings.ldr ?? {};
  const ai = readings.ai ?? input.ai ?? {};
  const now = new Date().toISOString();
  const sourceSampleAt = isoTime(input.source_sample_at_utc ?? input.sample_at_utc);

  const heartRate = finiteNumber(pulse.bpm ?? input.heart_rate, { min: 20, max: 240, integer: true });
  const lightLux = finiteNumber(light.lux ?? input.light_lux, { min: 0, max: 200000 });
  const latitude = finiteNumber(gps.lat_deg ?? gps.latitude ?? input.latitude, { min: -90, max: 90 });
  const longitude = finiteNumber(gps.lon_deg ?? gps.longitude ?? input.longitude, { min: -180, max: 180 });
  const gpsAccuracy = finiteNumber(gps.accuracy_m ?? gps.accuracy ?? input.gps_accuracy, { min: 0, max: 10000 });
  const gpsValid = validFor(latitude !== null && longitude !== null ? true : null, gps.fix_valid ?? gps.valid);
  const mpuValues = [motion.accel_x_mps2, motion.accel_y_mps2, motion.accel_z_mps2, motion.gyro_x_dps, motion.gyro_y_dps, motion.gyro_z_dps];
  const delayedUpload = input.delayed_upload !== undefined
    ? booleanInt(input.delayed_upload)
    : sourceSampleAt && Date.parse(now) - Date.parse(sourceSampleAt) > FRESH_AFTER_MS ? 1 : 0;

  return {
    value: {
      schemaVersion: cleanText(input.schema_version, "0.1-legacy", 20),
      kind: "telemetry",
      recordId: stableId(input.record_id, "legacy-record"),
      deviceId,
      deviceName: cleanText(input.device_name, "Smart Cane", 80),
      gatewayId: cleanText(input.gateway_id, deviceId, 64),
      sourceId: cleanText(input.source_id ?? input.node_id, deviceId, 64),
      originKind: allowedValue(input.origin_kind, ["physical", "simulated", "unknown"], "unknown"),
      sourceBootId: cleanText(input.source_boot_id, null, 80),
      sourceSeq: finiteNumber(input.source_seq, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
      sourceSampleUptimeMs: finiteNumber(input.source_sample_uptime_ms, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
      sourceSampleAt,
      gatewayReceivedAt: isoTime(input.gateway_received_at_utc),
      gatewayReceivedUptimeMs: finiteNumber(input.gateway_received_uptime_ms, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
      cloudIngestedAt: now,
      delayedUpload,
      distanceCm: finiteNumber(ultrasonic.distance_cm, { min: 0, max: 1000 }),
      ultrasonicValid: validFor(ultrasonic.distance_cm, ultrasonic.valid),
      accelX: finiteNumber(motion.accel_x_mps2),
      accelY: finiteNumber(motion.accel_y_mps2),
      accelZ: finiteNumber(motion.accel_z_mps2),
      gyroX: finiteNumber(motion.gyro_x_dps),
      gyroY: finiteNumber(motion.gyro_y_dps),
      gyroZ: finiteNumber(motion.gyro_z_dps),
      motionValid: validFor(mpuValues.some((value) => value !== null && value !== undefined) ? true : null, motion.valid),
      heartRate,
      irRaw: finiteNumber(pulse.ir_raw, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
      redRaw: finiteNumber(pulse.red_raw, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
      heartValid: validFor(heartRate, pulse.valid ?? input.heart_rate_valid),
      movement: cleanText(motion.classification ?? input.movement, "unknown", 40),
      ldrAdcRaw: finiteNumber(light.adc_raw, { min: 0, max: 65535, integer: true }),
      lightLux,
      lightValid: validFor(lightLux, light.valid ?? input.light_valid),
      latitude,
      longitude,
      gpsAccuracy,
      gpsValid,
      gpsFixAgeMs: finiteNumber(gps.fix_age_ms, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
      aiModelName: cleanText(ai.model_name, null, 80),
      aiModelVersion: cleanText(ai.model_version, null, 40),
      aiClassification: cleanText(ai.classification, null, 80),
      aiConfidence: finiteNumber(ai.confidence, { min: 0, max: 1 }),
      aiValid: validFor(ai.classification, ai.valid),
      fallDetected: booleanInt(input.fall_detected ?? input.events?.suspected_fall),
      sosPressed: booleanInt(input.sos_pressed ?? input.events?.sos_pressed),
    },
  };
}

function freshnessState(timestamp, now = Date.now()) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return { state: "unknown_clock", age_ms: null };
  const age = Math.max(0, now - Date.parse(timestamp));
  if (age <= FRESH_AFTER_MS) return { state: "fresh", age_ms: age };
  if (age <= OFFLINE_AFTER_MS) return { state: "stale", age_ms: age };
  return { state: "offline", age_ms: age };
}

function telemetryRecord(row) {
  if (!row) return null;
  return {
    schema_version: row.schema_version,
    kind: row.kind || "telemetry",
    record_id: row.record_id,
    device_id: row.device_id,
    gateway_id: row.gateway_id,
    source_id: row.source_id,
    origin_kind: row.origin_kind,
    source_boot_id: row.source_boot_id,
    source_seq: row.source_seq,
    times: {
      source_sample_uptime_ms: row.source_sample_uptime_ms,
      source_sample_at_utc: row.source_sample_at_utc,
      gateway_received_at_utc: row.gateway_received_at_utc,
      gateway_received_uptime_ms: row.gateway_received_uptime_ms,
      cloud_ingested_at_utc: row.cloud_ingested_at_utc || row.recorded_at,
    },
    delayed_upload: Boolean(row.delayed_upload),
    readings: {
      hc_sr04: { distance_cm: row.hc_sr04_distance_cm, unit: "cm", valid: Boolean(row.hc_sr04_valid) },
      mpu6050: {
        accel_x_mps2: row.mpu_accel_x_mps2, accel_y_mps2: row.mpu_accel_y_mps2, accel_z_mps2: row.mpu_accel_z_mps2,
        gyro_x_dps: row.mpu_gyro_x_dps, gyro_y_dps: row.mpu_gyro_y_dps, gyro_z_dps: row.mpu_gyro_z_dps,
        classification: row.movement, valid: Boolean(row.mpu6050_valid),
      },
      max30102: { ir_raw: row.max30102_ir_raw, red_raw: row.max30102_red_raw, bpm: row.heart_rate, unit: "BPM", valid: Boolean(row.max30102_valid) },
      gps: { lat_deg: row.latitude, lon_deg: row.longitude, accuracy_m: row.gps_accuracy, fix_valid: Boolean(row.gps_fix_valid), fix_age_ms: row.gps_fix_age_ms },
      ldr: { adc_raw: row.ldr_adc_raw, lux: row.light_lux, unit: "lux", valid: Boolean(row.ldr_valid) },
      ai: { model_name: row.ai_model_name, model_version: row.ai_model_version, classification: row.ai_classification, confidence: row.ai_confidence, valid: Boolean(row.ai_valid) },
    },
  };
}

function eventRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    event_id: row.event_id || `legacy-event:${row.id}`,
    device_id: row.device_id,
    gateway_id: row.gateway_id,
    source_id: row.source_id,
    source_boot_id: row.source_boot_id,
    origin_kind: row.origin_kind,
    event_type: row.event_type,
    severity: row.severity,
    description: row.description,
    source_sample_uptime_ms: row.source_sample_uptime_ms,
    occurred_at_utc: row.occurred_at || row.event_timestamp,
    cloud_ingested_at_utc: row.cloud_ingested_at_utc,
    gps: { lat_deg: row.latitude, lon_deg: row.longitude, fix_valid: Boolean(row.gps_fix_valid), fix_age_ms: row.gps_fix_age_ms },
    ai: { model_name: row.ai_model_name, model_version: row.ai_model_version, confidence: row.ai_confidence },
    delivery_state: row.delivery_state || "unknown",
    acknowledged: Boolean(row.acknowledged),
  };
}

async function recordEvent(env, input) {
  const deviceId = cleanText(input.device_id, null, 64);
  if (!deviceId) return { error: "device_id is required" };
  const eventType = allowedValue(input.event_type, ["sos_pressed", "suspected_fall"], null);
  if (!eventType) return { error: "event_type must be sos_pressed or suspected_fall" };
  const eventId = stableId(input.event_id, "legacy-event");
  const duplicate = await env.DB.prepare("SELECT id FROM events WHERE event_id = ? LIMIT 1").bind(eventId).first();
  if (duplicate) return { duplicate: true, event_id: eventId };

  const now = new Date().toISOString();
  const gps = input.gps ?? {};
  const latitude = finiteNumber(gps.lat_deg ?? gps.latitude ?? input.latitude, { min: -90, max: 90 });
  const longitude = finiteNumber(gps.lon_deg ?? gps.longitude ?? input.longitude, { min: -180, max: 180 });
  const gpsValid = validFor(latitude !== null && longitude !== null ? true : null, gps.fix_valid ?? gps.valid);
  const gpsFixAgeMs = finiteNumber(gps.fix_age_ms, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true });
  const description = cleanText(input.description, eventType === "sos_pressed" ? "SOS button pressed" : "Possible fall detected by AI", 240);
  const occurredAt = isoTime(input.occurred_at_utc) || now;
  const deliveryState = allowedValue(input.delivery_state, ["gateway_expected", "gateway_sent", "delivered", "failed", "not_configured"], "gateway_expected");
  const ai = input.ai ?? {};

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO events
      (device_id, event_id, gateway_id, source_id, source_boot_id, origin_kind, event_type, severity, description,
       source_sample_uptime_ms, latitude, longitude, gps_fix_valid, gps_fix_age_ms, delivery_state, occurred_at,
       cloud_ingested_at_utc, ai_model_name, ai_model_version, ai_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(deviceId, eventId, cleanText(input.gateway_id, deviceId, 64), cleanText(input.source_id, deviceId, 64), cleanText(input.source_boot_id, null, 80),
        allowedValue(input.origin_kind, ["physical", "simulated", "unknown"], "unknown"), eventType,
        allowedValue(input.severity, ["information", "warning", "emergency"], "emergency"), description,
        finiteNumber(input.source_sample_uptime_ms, { min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }),
        gpsValid ? latitude : null, gpsValid ? longitude : null, gpsValid, gpsFixAgeMs, deliveryState, occurredAt, now,
        cleanText(ai.model_name, null, 80), cleanText(ai.model_version, null, 40), finiteNumber(ai.confidence, { min: 0, max: 1 })),
    env.DB.prepare(`INSERT INTO alerts
      (device_id, event_id, event_type, severity, description, latitude, longitude, gps_fix_valid, gps_fix_age_ms, delivery_state, event_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(deviceId, eventId, eventType, allowedValue(input.severity, ["information", "warning", "emergency"], "emergency"), description,
        gpsValid ? latitude : null, gpsValid ? longitude : null, gpsValid, gpsFixAgeMs, deliveryState, occurredAt),
  ]);
  return { duplicate: false, event_id: eventId, event_type: eventType, occurred_at_utc: occurredAt, delivery_state: deliveryState };
}

async function ingestTelemetry(env, input) {
  const parsed = normalizeTelemetry(input);
  if (parsed.error) return { error: parsed.error };
  const d = parsed.value;
  const duplicate = await env.DB.prepare("SELECT id FROM telemetry_readings WHERE record_id = ? LIMIT 1").bind(d.recordId).first();
  if (duplicate) return { data: d, duplicate: true, event: null, timestamp: d.cloudIngestedAt };

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO devices
      (id, name, heart_rate, movement, light_lux, latitude, longitude, gps_accuracy, fall_detected, sos_pressed, last_seen, updated_at,
       schema_version, gateway_id, source_id, origin_kind, latest_record_id, source_sample_at_utc, gateway_received_at_utc,
       cloud_ingested_at_utc, heart_rate_valid, light_valid, gps_valid, gps_fix_age_ms, ai_model_name, ai_model_version,
       ai_classification, ai_confidence, ai_valid, delayed_upload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, heart_rate = excluded.heart_rate, movement = excluded.movement, light_lux = excluded.light_lux,
        latitude = excluded.latitude, longitude = excluded.longitude, gps_accuracy = excluded.gps_accuracy,
        fall_detected = excluded.fall_detected, sos_pressed = excluded.sos_pressed, last_seen = excluded.last_seen,
        updated_at = excluded.updated_at, schema_version = excluded.schema_version, gateway_id = excluded.gateway_id,
        source_id = excluded.source_id, origin_kind = excluded.origin_kind, latest_record_id = excluded.latest_record_id,
        source_sample_at_utc = excluded.source_sample_at_utc, gateway_received_at_utc = excluded.gateway_received_at_utc,
        cloud_ingested_at_utc = excluded.cloud_ingested_at_utc, heart_rate_valid = excluded.heart_rate_valid,
        light_valid = excluded.light_valid, gps_valid = excluded.gps_valid, gps_fix_age_ms = excluded.gps_fix_age_ms,
        ai_model_name = excluded.ai_model_name, ai_model_version = excluded.ai_model_version,
        ai_classification = excluded.ai_classification, ai_confidence = excluded.ai_confidence,
        ai_valid = excluded.ai_valid, delayed_upload = excluded.delayed_upload`)
      .bind(d.deviceId, d.deviceName, d.heartRate, d.movement, d.lightLux, d.latitude, d.longitude, d.gpsAccuracy,
        d.fallDetected, d.sosPressed, d.cloudIngestedAt, d.cloudIngestedAt, d.schemaVersion, d.gatewayId, d.sourceId,
        d.originKind, d.recordId, d.sourceSampleAt, d.gatewayReceivedAt, d.cloudIngestedAt, d.heartValid, d.lightValid,
        d.gpsValid, d.gpsFixAgeMs, d.aiModelName, d.aiModelVersion, d.aiClassification, d.aiConfidence, d.aiValid, d.delayedUpload),
    env.DB.prepare(`INSERT INTO telemetry_readings
      (device_id, heart_rate, movement, light_lux, latitude, longitude, gps_accuracy, fall_detected, sos_pressed, recorded_at,
       record_id, schema_version, kind, gateway_id, source_id, origin_kind, source_boot_id, source_seq,
       source_sample_uptime_ms, source_sample_at_utc, gateway_received_at_utc, gateway_received_uptime_ms,
       cloud_ingested_at_utc, delayed_upload, hc_sr04_distance_cm, hc_sr04_valid,
       mpu_accel_x_mps2, mpu_accel_y_mps2, mpu_accel_z_mps2, mpu_gyro_x_dps, mpu_gyro_y_dps, mpu_gyro_z_dps,
       mpu6050_valid, max30102_ir_raw, max30102_red_raw, max30102_valid, ldr_adc_raw, ldr_valid,
       gps_fix_valid, gps_fix_age_ms, ai_model_name, ai_model_version, ai_classification, ai_confidence, ai_valid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(d.deviceId, d.heartRate, d.movement, d.lightLux, d.latitude, d.longitude, d.gpsAccuracy, d.fallDetected,
        d.sosPressed, d.cloudIngestedAt, d.recordId, d.schemaVersion, d.kind, d.gatewayId, d.sourceId, d.originKind,
        d.sourceBootId, d.sourceSeq, d.sourceSampleUptimeMs, d.sourceSampleAt, d.gatewayReceivedAt, d.gatewayReceivedUptimeMs,
        d.cloudIngestedAt, d.delayedUpload, d.distanceCm, d.ultrasonicValid, d.accelX, d.accelY, d.accelZ, d.gyroX,
        d.gyroY, d.gyroZ, d.motionValid, d.irRaw, d.redRaw, d.heartValid, d.ldrAdcRaw, d.lightValid, d.gpsValid,
        d.gpsFixAgeMs, d.aiModelName, d.aiModelVersion, d.aiClassification, d.aiConfidence, d.aiValid),
  ]);

  let event = null;
  if (d.sosPressed || d.fallDetected) {
    event = await recordEvent(env, {
      event_id: cleanText(input.event_id, `${d.recordId}:${d.sosPressed ? "sos_pressed" : "suspected_fall"}`, 128),
      device_id: d.deviceId, gateway_id: d.gatewayId, source_id: d.sourceId, source_boot_id: d.sourceBootId,
      source_sample_uptime_ms: d.sourceSampleUptimeMs, origin_kind: d.originKind,
      event_type: d.sosPressed ? "sos_pressed" : "suspected_fall", severity: "emergency",
      gps: { lat_deg: d.latitude, lon_deg: d.longitude, fix_valid: d.gpsValid, fix_age_ms: d.gpsFixAgeMs },
      ai: { model_name: d.aiModelName, model_version: d.aiModelVersion, confidence: d.aiConfidence },
      occurred_at_utc: d.sourceSampleAt || d.gatewayReceivedAt || d.cloudIngestedAt,
      delivery_state: cleanText(input.delivery_state, "gateway_expected", 40),
    });
  }
  return { data: d, duplicate: false, event, timestamp: d.cloudIngestedAt };
}

async function latestTelemetry(env, deviceId) {
  return env.DB.prepare(`SELECT * FROM telemetry_readings WHERE device_id = ?
    ORDER BY COALESCE(cloud_ingested_at_utc, recorded_at) DESC, id DESC LIMIT 1`).bind(deviceId).first();
}

async function dashboardData(env, deviceId) {
  const [device, latest, alerts, events, sources] = await Promise.all([
    env.DB.prepare("SELECT * FROM devices WHERE id = ?").bind(deviceId).first(), latestTelemetry(env, deviceId),
    env.DB.prepare(`SELECT * FROM alerts WHERE device_id = ? AND acknowledged = 0 ORDER BY event_timestamp DESC LIMIT 10`).bind(deviceId).all(),
    env.DB.prepare(`SELECT * FROM events WHERE device_id = ? ORDER BY occurred_at DESC LIMIT 20`).bind(deviceId).all(),
    env.DB.prepare(`SELECT source_id, gateway_id, origin_kind, MAX(COALESCE(cloud_ingested_at_utc, recorded_at)) AS last_seen
      FROM telemetry_readings WHERE device_id = ? GROUP BY source_id, gateway_id, origin_kind ORDER BY source_id`).bind(deviceId).all(),
  ]);
  const referenceTime = latest?.cloud_ingested_at_utc || latest?.recorded_at || device?.last_seen;
  const freshness = freshnessState(referenceTime);
  return {
    contract: { schema_version: CONTRACT_VERSION, fresh_after_ms: FRESH_AFTER_MS, offline_after_ms: OFFLINE_AFTER_MS, gps_current_after_ms: GPS_CURRENT_AFTER_MS },
    device: device || null, latest: telemetryRecord(latest),
    connection: freshness.state === "offline" || freshness.state === "unknown_clock" ? "offline" : "online",
    freshness: freshness.state,
    stale_seconds: freshness.age_ms === null ? null : Math.round(freshness.age_ms / 1000),
    sources: (sources.results ?? []).map((source) => ({ ...source, freshness: freshnessState(source.last_seen).state })),
    active_alerts: (alerts.results ?? []).map(eventRecord),
    recent_events: (events.results ?? []).map(eventRecord),
    server_time: new Date().toISOString(),
  };
}

async function requireDeviceAccess(request, env, url) {
  const user = await authenticatedUser(request, env);
  if (!user) return { response: json({ error: "Sign in required" }, 401) };
  const deviceId = cleanText(url.searchParams.get("device_id"), "SC-ESP32-001", 64);
  if (!(await caregiverCanAccessDevice(env, user.id, deviceId))) return { response: json({ error: "Device access denied" }, 403) };
  return { user, deviceId };
}

async function telemetryHistory(env, deviceId, url) {
  const limit = finiteNumber(url.searchParams.get("limit"), { min: 1, max: 200, integer: true }) || 50;
  const from = isoTime(url.searchParams.get("from"));
  const to = isoTime(url.searchParams.get("to"));
  const sourceId = cleanText(url.searchParams.get("source_id"), null, 64);
  const clauses = ["device_id = ?"];
  const binds = [deviceId];
  if (from) { clauses.push("COALESCE(cloud_ingested_at_utc, recorded_at) >= ?"); binds.push(from); }
  if (to) { clauses.push("COALESCE(cloud_ingested_at_utc, recorded_at) <= ?"); binds.push(to); }
  if (sourceId) { clauses.push("source_id = ?"); binds.push(sourceId); }
  binds.push(limit);
  const result = await env.DB.prepare(`SELECT * FROM telemetry_readings WHERE ${clauses.join(" AND ")}
    ORDER BY COALESCE(cloud_ingested_at_utc, recorded_at) DESC, id DESC LIMIT ?`).bind(...binds).all();
  return { records: (result.results ?? []).map(telemetryRecord), count: (result.results ?? []).length, limit, sort: "cloud_ingested_at_utc_desc" };
}

async function eventHistory(env, deviceId, url) {
  const limit = finiteNumber(url.searchParams.get("limit"), { min: 1, max: 200, integer: true }) || 50;
  const result = await env.DB.prepare(`SELECT * FROM events WHERE device_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?`).bind(deviceId, limit).all();
  return { events: (result.results ?? []).map(eventRecord), count: (result.results ?? []).length, limit };
}

async function handleApi(request, env, url) {
  if (!env.DB) return json({ error: "Database binding is unavailable" }, 503);
  if (request.method === "POST" && url.pathname !== "/api/telemetry" && url.pathname !== "/api/events" && !sameOrigin(request, url)) {
    return json({ error: "Forbidden origin" }, 403);
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: true, service: "smart-cane-api", database: "connected", interface_contract: CONTRACT_VERSION, timestamp: new Date().toISOString() });
  }
  if (request.method === "GET" && url.pathname === "/api/session") {
    const user = await authenticatedUser(request, env);
    if (!user) return json({ error: "Sign in required" }, 401);
    await ensureCaregiver(env, user);
    return json({ user });
  }
  if (request.method === "GET" && url.pathname === "/api/people") {
    const user = await authenticatedUser(request, env);
    if (!user) return json({ error: "Sign in required" }, 401);
    return json({ people: await ensureCaregiver(env, user) });
  }
  if (request.method === "POST" && url.pathname === "/api/people") {
    const user = await authenticatedUser(request, env);
    if (!user) return json({ error: "Sign in required" }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON" }, 400); }
    const displayName = cleanText(body.display_name, null, 60);
    const relationship = cleanText(body.relationship, "Person in care", 60);
    const deviceId = cleanText(body.device_id, null, 64);
    if (!displayName || !deviceId || !/^[A-Za-z0-9_-]+$/.test(deviceId)) return json({ error: "Name and a valid device ID are required" }, 400);
    await ensureCaregiver(env, user);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO care_recipients (display_name, relationship, device_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET display_name = excluded.display_name,
      relationship = excluded.relationship, updated_at = excluded.updated_at`).bind(displayName, relationship, deviceId, now, now).run();
    const person = await env.DB.prepare("SELECT * FROM care_recipients WHERE device_id = ?").bind(deviceId).first();
    await env.DB.prepare(`INSERT INTO caregiver_recipients (caregiver_id, recipient_id, created_at)
      VALUES (?, ?, ?) ON CONFLICT(caregiver_id, recipient_id) DO NOTHING`).bind(user.id, person.id, now).run();
    return json({ person }, 201);
  }
  if (request.method === "GET" && url.pathname === "/api/dashboard") {
    const access = await requireDeviceAccess(request, env, url);
    return access.response || json(await dashboardData(env, access.deviceId));
  }
  if (request.method === "GET" && url.pathname === "/api/telemetry/latest") {
    const access = await requireDeviceAccess(request, env, url);
    return access.response || json({ record: telemetryRecord(await latestTelemetry(env, access.deviceId)) });
  }
  if (request.method === "GET" && url.pathname === "/api/telemetry/history") {
    const access = await requireDeviceAccess(request, env, url);
    return access.response || json(await telemetryHistory(env, access.deviceId, url));
  }
  if (request.method === "GET" && url.pathname === "/api/events") {
    const access = await requireDeviceAccess(request, env, url);
    return access.response || json(await eventHistory(env, access.deviceId, url));
  }
  if (request.method === "POST" && url.pathname === "/api/telemetry") {
    if (!(await authorizedGateway(request, env))) return json({ error: "Gateway authorization required" }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON" }, 400); }
    const result = await ingestTelemetry(env, body);
    if (result.error) return json({ error: result.error }, 400);
    return json({ ok: true, schema_version: CONTRACT_VERSION, record_id: result.data.recordId, duplicate: result.duplicate, accepted_at: result.timestamp, event: result.event }, result.duplicate ? 200 : 202);
  }
  if (request.method === "POST" && url.pathname === "/api/events") {
    if (!(await authorizedGateway(request, env))) return json({ error: "Gateway authorization required" }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON" }, 400); }
    const result = await recordEvent(env, body);
    if (result.error) return json({ error: result.error }, 400);
    return json({ ok: true, schema_version: CONTRACT_VERSION, ...result }, result.duplicate ? 200 : 202);
  }
  const acknowledgeMatch = url.pathname.match(/^\/api\/alerts\/(\d+)\/acknowledge$/);
  if (request.method === "POST" && acknowledgeMatch) {
    const user = await authenticatedUser(request, env);
    if (!user) return json({ error: "Sign in required" }, 401);
    const alertId = Number(acknowledgeMatch[1]);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`UPDATE alerts SET acknowledged = 1, acknowledged_at = ?, acknowledged_by = ?
      WHERE id = ? AND device_id IN (SELECT p.device_id FROM care_recipients p
        JOIN caregiver_recipients cp ON cp.recipient_id = p.id WHERE cp.caregiver_id = ?)`)
      .bind(now, user.id, alertId, user.id).run();
    if (!result.meta?.changes) return json({ error: "Alert not found" }, 404);
    return json({ ok: true, alert_id: alertId, acknowledged_at: now });
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    const url = new URL(request.url);
    try {
      if (!env.DB) return json({ error: "Database binding is unavailable" }, 503);
      if (request.method === "POST" && url.pathname.startsWith("/auth/")) return await handleAuth(request, env, url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      if (url.pathname === "/setup") {
        if (await env.DB.prepare("SELECT id FROM auth_users LIMIT 1").first()) return redirect("/");
        const legacy = legacyChatGPTUser(request);
        return legacy ? html(setupPage.replace("__USER_EMAIL__", escapeHtml(legacy.email))) : redirect("/");
      }
      if (url.pathname === "/" || url.pathname === "/login") {
        if (await authenticatedUser(request, env)) return redirect("/app");
        if (legacyChatGPTUser(request) && !(await env.DB.prepare("SELECT id FROM auth_users LIMIT 1").first())) return redirect("/setup");
        return html(loginPage);
      }
      if (url.pathname === "/app" || url.pathname === "/index.html") {
        return (await authenticatedUser(request, env)) ? html(page) : redirect("/");
      }
      if (url.pathname === "/styles.css") return asset(styles, "text/css; charset=utf-8");
      if (url.pathname === "/app.js") return asset(appScript, "text/javascript; charset=utf-8");
      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("Smart Cane request failed", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
};

#!/usr/bin/env node
// Compatibility probe: does the hosted Worker (dashboard/hosted-site/worker/index.js) understand a
// record in our Interface Contract v0.2 shape (IF-03 `cloud.telemetry`)?
//
//   node tools/compat/probe_worker_contract.mjs
//
// It reads the Worker source, makes a temporary copy that also exports `normalizeTelemetry`, and runs
// it on tools/compat/contract_record.json. The repo source is never modified and nothing is sent to
// any network. Exit code 1 while any check FAILs, so it turns green when the Worker follows the contract.
// This tests the repo source only; a deployed Worker could differ.

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workerSource = join(here, '..', '..', 'dashboard', 'hosted-site', 'worker', 'index.js');
const record = JSON.parse(readFileSync(join(here, 'contract_record.json'), 'utf8'));

const tmp = mkdtempSync(join(tmpdir(), 'probe-worker-'));
const copy = join(tmp, 'worker.mjs');
writeFileSync(copy, `${readFileSync(workerSource, 'utf8')}\nexport { normalizeTelemetry };\n`);
const { normalizeTelemetry } = await import(pathToFileURL(copy).href);

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

const asIs = normalizeTelemetry(record);
check('accepts a contract record as-is (no device_id)', !asIs.error, asIs.error || '');

// Evaluate the remaining checks even if the first one failed: add a device_id only for the probe.
const n = (asIs.error ? normalizeTelemetry({ ...record, device_id: 'PROBE-DEVICE' }) : asIs).value;

check('keeps source_seq, record_id, source_id, origin_kind',
  n.sourceSeq === 125 && n.recordId === record.record_id && n.sourceId === 'NODE_01' && n.originKind === 'physical',
  `seq=${n.sourceSeq} source=${n.sourceId} origin=${n.originKind}`);
check('keeps readings.distance_cm = 46.2', n.distanceCm === 46.2, `distanceCm=${n.distanceCm}`);
check('marks the ultrasonic reading valid (validity.distance = true)', n.ultrasonicValid === 1, `ultrasonicValid=${n.ultrasonicValid}`);
check('keeps accel_g / gyro_dps motion values',
  n.accelX !== null && n.gyroX !== null, `accelX=${n.accelX} gyroX=${n.gyroX}`);

const invalid = normalizeTelemetry({
  ...record, device_id: 'PROBE-DEVICE',
  readings: { ...record.readings, distance_cm: null },
  validity: { distance: false, motion: true },
}).value;
check('invalid distance is null/invalid, never 0', invalid.distanceCm === null && invalid.ultrasonicValid === 0,
  `distanceCm=${invalid.distanceCm} valid=${invalid.ultrasonicValid}`);

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);

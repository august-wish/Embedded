import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceText, normalizeSource, seqText, statusFor } from '../src/contract.js';

const sample = {
  source_id: 'NODE_01', gateway_id: 'GW_01', origin_kind: 'simulated',
  latest_record_id: 'GW_01:NODE_01:BOOT_A1:125', source_boot_id: 'BOOT_A1',
  source_seq: 125, source_sample_uptime_ms: 128500,
  cloud_ingested_at_utc: '2026-11-10T07:48:00Z',
  measurements: { distance_cm: 46.2 }, validity: { distance: true },
  freshness: 'fresh', age_s: 1.5,
};

test('shows the contract seq, node and distance unchanged', () => {
  const source = normalizeSource(sample);
  assert.equal(source.sourceId, 'NODE_01');
  assert.equal(seqText(source), '125');
  assert.equal(distanceText(source), '46.2');
});

test('invalid, missing and zero distances never appear as 0 cm', () => {
  for (const candidate of [null, 0, -1]) {
    assert.equal(distanceText(normalizeSource({ ...sample, measurements: { distance_cm: candidate } })), '—');
  }
  assert.equal(distanceText(normalizeSource({ ...sample, validity: { distance: false } })), '—');
});

test('stale, offline and disconnected states remain explicit', () => {
  assert.equal(statusFor(normalizeSource({ ...sample, freshness: 'stale' }), false), 'stale');
  assert.equal(statusFor(normalizeSource({ ...sample, freshness: 'offline' }), false), 'offline');
  assert.equal(statusFor(normalizeSource(sample), true), 'offline');
});

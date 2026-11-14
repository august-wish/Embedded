// IF-04 read-model adapter. The mock adds source_seq, validity and age_s to
// the proposed minimum envelope so the checkpoint can show the same seq.
const FRESHNESS = new Set(['fresh', 'stale', 'offline', 'unknown_clock']);

export function normalizeSource(input) {
  if (!input || typeof input !== 'object') return null;
  const seq = Number.isSafeInteger(input.source_seq) && input.source_seq >= 0
    ? input.source_seq
    : null;
  const rawDistance = input.measurements?.distance_cm;
  const distanceValid = input.validity?.distance !== false
    && typeof rawDistance === 'number'
    && Number.isFinite(rawDistance)
    && rawDistance > 0;
  const timestamp = input.cloud_ingested_at_utc;
  const ingestedAt = typeof timestamp === 'string' && !Number.isNaN(Date.parse(timestamp))
    ? timestamp
    : null;
  return {
    sourceId: typeof input.source_id === 'string' ? input.source_id : 'Unknown source',
    gatewayId: typeof input.gateway_id === 'string' ? input.gateway_id : 'Unknown gateway',
    originKind: input.origin_kind === 'physical' || input.origin_kind === 'simulated'
      ? input.origin_kind
      : 'unknown',
    recordId: typeof input.latest_record_id === 'string' ? input.latest_record_id : null,
    bootId: typeof input.source_boot_id === 'string' ? input.source_boot_id : null,
    seq,
    distanceCm: distanceValid ? rawDistance : null,
    ingestedAt,
    sampleUptimeMs: Number.isFinite(input.source_sample_uptime_ms) ? input.source_sample_uptime_ms : null,
    freshness: FRESHNESS.has(input.freshness) ? input.freshness : 'unknown_clock',
    ageSeconds: Number.isFinite(input.age_s) && input.age_s >= 0 ? input.age_s : null,
  };
}

export function statusFor(source, disconnected) {
  if (disconnected) return 'offline';
  return source?.freshness ?? 'waiting';
}

export function distanceText(source) {
  return source?.distanceCm == null ? '—' : source.distanceCm.toFixed(1);
}

export function seqText(source) {
  return source?.seq == null ? '—' : String(source.seq);
}

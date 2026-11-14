import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { distanceText, normalizeSource, seqText, statusFor } from './contract.js';
import './styles.css';

const API_BASE = (import.meta.env.VITE_CLOUD_BASE_URL || '').replace(/\/$/, '');
const POLL_MS = 2000; // Checkpoint UI choice; not a contract threshold.

function timeText(value) {
  return value ? new Date(value).toLocaleString() : 'Unavailable';
}

function App() {
  const [sources, setSources] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/sources`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Cloud returned ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload)) throw new Error('Invalid source list');
        if (!active) return;
        setSources(payload.map(normalizeSource).filter(Boolean));
        setDisconnected(false);
      } catch {
        if (active) setDisconnected(true);
      } finally {
        if (active) { setLoaded(true); setCheckedAt(new Date()); }
      }
    };
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const selected = sources.find((item) => item.sourceId === selectedId) || sources[0] || null;
  const status = statusFor(selected, disconnected);
  const sourceLabel = selected?.sourceId || 'Waiting for a source';
  const stale = status !== 'fresh';

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">⌁</div><div><strong>Smart Cane</strong><span>Caregiver monitoring</span></div></div>
      <div className="nav"><span className="nav-item active">▦ <span>Overview</span></span><span className="nav-item muted">⚠ <span>Emergency alerts</span></span></div>
      <div className="sidebar-foot"><span className="avatar">BU</span><div><strong>Boom Udomchok</strong><small>Dashboard owner</small></div></div>
    </aside>
    <main>
      <header className="topbar"><div><span className="eyebrow">CAREGIVER DASHBOARD</span><h1>Safety overview</h1></div><div className="top-status"><span className={`status-dot ${status}`} /><strong>{status === 'waiting' ? 'Waiting for data' : status.replace('_', ' ')}</strong><small>{checkedAt ? `Checked ${checkedAt.toLocaleTimeString()}` : 'Connecting'}</small></div></header>
      <div className="content">
        <section className="intro"><div><span className="eyebrow green">CHECKPOINT · 20 NOV 2026</span><h2>Distance telemetry</h2><p>Trace one reading from Node through Gateway and Cloud to this dashboard.</p></div><div className="mock-label">MOCK CLOUD · LOCAL TEST</div></section>
        <section className={`summary ${status}`} aria-live="polite"><span className="summary-icon">{status === 'fresh' ? '✓' : '!'}</span><div><span className="eyebrow">LATEST READING</span><h3>{status === 'fresh' ? 'Receiving current data' : status === 'stale' ? 'Reading is stale' : status === 'offline' ? 'Source is offline' : status === 'waiting' ? 'Waiting for first reading' : 'Clock status unknown'}</h3><p>{disconnected ? 'Cloud API cannot be reached. The values below are last known data.' : status === 'waiting' ? 'Start the mock Cloud and Node to see a reading.' : status === 'fresh' ? 'The mock Cloud marks this source as fresh.' : 'Last known values are shown for tracing only.'}</p></div></section>
        <div className="section-line"><div><span className="eyebrow">SOURCE</span><h3>Latest known telemetry</h3></div><label className="source-select">Monitor <select value={selected?.sourceId || ''} onChange={(event) => setSelectedId(event.target.value)} disabled={!sources.length}>{sources.length ? sources.map((item) => <option key={item.sourceId} value={item.sourceId}>{item.sourceId}</option>) : <option value="">No sources</option>}</select></label></div>
        <div className="metrics">
          <article className="card distance-card"><span className="metric-icon">⌁</span><div className="metric-title">Obstacle distance</div><div className="metric-value">{distanceText(selected)} <span>cm</span></div><p>{selected?.distanceCm == null ? 'Sensor reading missing or invalid' : stale ? 'Last known reading · not current' : 'HC-SR04 reading from selected Node'}</p></article>
          <article className="card"><span className="metric-icon green-bg">#</span><div className="metric-title">Sequence number</div><div className="metric-value">{seqText(selected)}</div><p>Match this <code>seq</code> with the Node, Gateway and Cloud logs.</p></article>
          <article className="card"><span className="metric-icon blue-bg">◷</span><div className="metric-title">Data freshness</div><div className={`state-word ${status}`}>{status.replace('_', ' ')}</div><p>{selected?.ageSeconds == null || disconnected ? 'Age unavailable' : `${selected.ageSeconds.toFixed(1)} s since Cloud ingestion`}</p></article>
        </div>
        <section className="details card"><div><span className="eyebrow">TRACE DETAILS</span><h3>Reading identity</h3></div><dl><div><dt>Source / node</dt><dd>{sourceLabel}</dd></div><div><dt>Gateway</dt><dd>{selected?.gatewayId || '—'}</dd></div><div><dt>Boot ID</dt><dd>{selected?.bootId || '—'}</dd></div><div><dt>Cloud received</dt><dd>{timeText(selected?.ingestedAt)}</dd></div><div><dt>Sample uptime</dt><dd>{selected?.sampleUptimeMs == null ? '—' : `${selected.sampleUptimeMs} ms`}</dd></div><div><dt>Origin</dt><dd>{selected?.originKind || '—'}</dd></div><div className="record-row"><dt>Record ID</dt><dd>{selected?.recordId || '—'}</dd></div></dl></section>
        <p className="note">The mock API and its 10 s stale / 60 s offline limits are test defaults. Cloud provider, read API and final freshness rule remain open under D-04 and D-03.</p>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import parse, { attributesToProps, domToReact } from 'html-react-parser';
import template from './dashboard-template.html';

const markup = template.match(/<body>([\s\S]*?)<script\s+src=/)?.[1];
if (!markup) throw new Error('Dashboard template body is missing');

const initialPerson = { display_name: 'Somchai', device_id: 'SC-ESP32-001', relationship: 'Family member' };
const demoBase = {
  status: 'Safe', state: 'safe', safetyMessage: 'No safety concerns detected. Smart Cane is monitoring normally.',
  connection: 'Demo', sync: 'Example data only', movement: 'Walking', movementChip: 'Normal',
  movementDetail: 'Steady movement pattern', heart: 76, light: 620, obstacle: 146,
  heartValid: true, lightValid: true, gpsValid: true, latitude: 13.7262, longitude: 100.5581,
  gpsAccuracy: 6, freshness: 'sample', schemaVersion: '0.2.1', sourceId: 'NODE_DEMO_01',
  gatewayId: 'GW_DEMO_01', originKind: 'simulated', sourceSeq: 125, nodeFreshness: 'sample', emergency: false, warningType: null,
  alertType: '', eventTime: 'Unavailable', recentEvents: [], ai: 'Clear path', aiDetail: 'No obstacle category detected',
};
const scenarios = {
  normal: {},
  high_heart: { status: 'Warning', state: 'warning', safetyMessage: 'Heart rate is higher than the expected resting range. Please check how the user is feeling.', heart: 132, light: 540, movement: 'Stationary', movementChip: 'Resting', movementDetail: 'Minimal movement detected', warningType: 'heart' },
  dark: { status: 'Caution', state: 'warning', safetyMessage: 'The user appears to be in a dark environment. Visibility may be limited.', heart: 75, light: 8, movementDetail: 'Steady movement in low light', warningType: 'dark' },
  obstacle: { status: 'Warning', state: 'warning', safetyMessage: 'A nearby obstacle was detected. The user is still moving normally.', obstacle: 34, heart: 78, ai: 'Person detected', aiDetail: '94% confidence' },
  fall: { status: 'Emergency', state: 'emergency', safetyMessage: 'Possible fall detected. Immediate caregiver attention is recommended.', movement: 'Possible fall', movementChip: 'Emergency', movementDetail: 'Fall-like motion pattern', heart: 91, emergency: true, alertType: 'Possible fall detected' },
  sos: { status: 'Emergency', state: 'emergency', safetyMessage: 'The SOS button was pressed. Contact the user and verify their location.', movement: 'Stationary', movementChip: 'Check user', movementDetail: 'No movement for 18 sec', heart: 88, emergency: true, alertType: 'SOS button pressed' },
  offline: { status: 'Offline', state: 'offline', safetyMessage: 'Live monitoring is unavailable. Displaying the last known readings from 4 minutes ago.', connection: 'Offline', sync: 'Last seen 4 min ago', movement: 'Unknown', movementChip: 'Offline', movementDetail: 'Live motion unavailable', heart: 74, gpsValid: false, freshness: 'offline', lastUpdatedLabel: '4 min ago' },
};
const emptyLive = { ...demoBase, status: 'Offline', state: 'offline', safetyMessage: 'Waiting for the first reading from Smart Cane.', connection: 'Offline', sync: 'No live data yet', heart: null, light: null, obstacle: null, sourceSeq: null, nodeFreshness: 'unknown_clock', movement: 'Unknown', movementChip: 'Waiting', movementDetail: 'Waiting for telemetry', heartValid: false, lightValid: false, gpsValid: false, latitude: null, longitude: null, freshness: 'unknown_clock', originKind: 'unknown', lastUpdatedLabel: 'No readings yet', sourceId: null, gatewayId: null };
const sampleLive = { ...demoBase, status: 'Example data', state: 'offline', safetyMessage: 'These are sample readings. Waiting for telemetry from the real device.', obstacle: 46.2, sourceId: 'NODE_01', gatewayId: 'GW_01', sourceSeq: 125, connection: 'Demo', sync: 'No live reading yet', freshness: 'sample', lastUpdatedLabel: 'No live reading yet', gpsValid: false, latitude: null, longitude: null, sampleTime: null, cloudTime: null, nodeCloudTime: null, recentEvents: [] };
const scenarioLabels = { live: 'Live database', normal: 'Normal operation', high_heart: 'High heart rate', dark: 'Dark environment', obstacle: 'Obstacle detected', fall: 'Fall detected', sos: 'SOS triggered', offline: 'Device offline' };

function Icon({ name }) { return <svg><use href={`#i-${name}`} /></svg>; }
function formatTime(value) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function eventLabel(type) {
  if (type === 'sos_pressed' || type === 'sos') return 'SOS button pressed';
  if (type === 'suspected_fall' || type === 'fall') return 'Possible fall detected';
  return String(type || 'Safety event').replaceAll('_', ' ');
}
function mapLive(payload) {
  const latest = payload.latest;
  const device = payload.device;
  if (!latest) {
    const firstAlert = payload.active_alerts?.[0];
    if (firstAlert) return { ...emptyLive, status: 'Emergency', state: 'emergency', safetyMessage: 'An emergency was reported. Contact the user and check the alert details.', emergency: true, alertType: eventLabel(firstAlert.event_type), eventTime: formatTime(firstAlert.occurred_at_utc), alertId: firstAlert.id, recentEvents: payload.recent_events || [] };
    return { ...sampleLive, schemaVersion: payload.contract?.schema_version || '0.2.1', recentEvents: payload.recent_events || [] };
  }
  const alert = payload.active_alerts?.[0];
  const readings = latest?.readings || {};
  const node = payload.node_latest || (latest.source_id !== latest.gateway_id ? latest : null);
  const nodeDistance = node?.readings?.hc_sr04;
  const heart = readings.max30102?.bpm ?? device?.heart_rate ?? null;
  const light = readings.ldr?.lux ?? device?.light_lux ?? null;
  const heartValid = readings.max30102 ? Boolean(readings.max30102.valid) : Boolean(device?.heart_rate_valid);
  const lightValid = readings.ldr ? Boolean(readings.ldr.valid) : Boolean(device?.light_valid);
  const offline = payload.connection !== 'online' || payload.freshness === 'unknown_clock';
  const stale = payload.freshness === 'stale';
  const highHeart = heartValid && Number(heart) >= 120;
  const lowLight = lightValid && Number(light) < 30;
  const gps = readings.gps;
  const gpsValid = Boolean(gps?.fix_valid) && Number.isFinite(Number(gps?.fix_age_ms)) && Number(gps.fix_age_ms) <= (payload.contract?.gps_current_after_ms ?? 90000) && payload.freshness === 'fresh';
  const seconds = payload.stale_seconds;
  const lastUpdatedLabel = seconds == null ? 'Unavailable' : seconds < 10 ? 'Just now' : `${seconds} sec ago`;
  return {
    ...demoBase, status: alert ? 'Emergency' : offline ? 'Offline' : stale ? 'Stale data' : highHeart ? 'Warning' : lowLight ? 'Caution' : 'Safe',
    state: alert ? 'emergency' : offline ? 'offline' : (stale || highHeart || lowLight) ? 'warning' : 'safe',
    safetyMessage: alert ? (eventLabel(alert.event_type) === 'SOS button pressed' ? 'The SOS button was pressed. Contact the user and verify their location.' : 'Possible fall detected. Immediate caregiver attention is recommended.') : offline ? `No telemetry received for ${seconds ?? 'an unknown number of'} seconds. Showing the last known reading.` : stale ? 'The latest record is stale and is not being presented as current data.' : highHeart ? 'Heart rate is higher than the expected resting range. Please check how the user is feeling.' : lowLight ? 'The user appears to be in a dark environment. Visibility may be limited.' : 'Live device data is connected. No safety concerns detected.',
    connection: offline ? 'Offline' : 'Live', sync: offline || stale ? `Last seen ${lastUpdatedLabel}` : 'Database synced',
    movement: readings.mpu6050?.valid ? readings.mpu6050.classification || 'Unknown' : device?.movement || 'Unknown',
    movementChip: alert ? 'Emergency' : offline ? 'Stale' : 'Live', movementDetail: offline ? 'Last known movement' : 'Live MPU6050 classification',
    heart, light, heartValid, lightValid, warningType: highHeart ? 'heart' : lowLight ? 'dark' : null,
    emergency: Boolean(alert), alertType: alert ? eventLabel(alert.event_type) : '', eventTime: formatTime(alert?.occurred_at_utc), alertId: alert?.id,
    acknowledged: Boolean(alert?.acknowledged), gpsValid, latitude: gpsValid ? gps.lat_deg : null, longitude: gpsValid ? gps.lon_deg : null, gpsAccuracy: gps?.accuracy_m,
    schemaVersion: latest?.schema_version || payload.contract?.schema_version || '0.2.1', sourceId: node?.source_id || latest?.source_id || device?.source_id,
    gatewayId: latest?.gateway_id || device?.gateway_id, originKind: latest?.origin_kind || device?.origin_kind || 'unknown',
    freshness: payload.freshness, sampleTime: latest?.times?.source_sample_at_utc, cloudTime: latest?.times?.cloud_ingested_at_utc,
    sourceSeq: node?.source_seq ?? null, distanceCm: nodeDistance?.valid && Number.isFinite(Number(nodeDistance.distance_cm)) ? Number(nodeDistance.distance_cm) : null,
    nodeCloudTime: node?.times?.cloud_ingested_at_utc || null, nodeFreshness: payload.node_freshness || 'unknown_clock',
    lastUpdatedLabel, recentEvents: payload.recent_events || [], ai: readings.ai?.valid ? readings.ai.classification : 'AI result unavailable',
    aiDetail: readings.ai?.valid ? `${readings.ai.model_name || 'Model'} ${readings.ai.model_version || ''}` : 'No valid AI metadata',
  };
}
function ActivityList({ scenario, data }) {
  const first = scenario === 'high_heart' ? ['heart', 'High heart rate', '132 BPM · check the user'] : scenario === 'dark' ? ['sun', 'Low light detected', '8 lux · visibility may be limited'] : scenario === 'fall' ? ['alert', 'Possible fall detected', 'Emergency event requires attention'] : scenario === 'sos' ? ['alert', 'SOS button pressed', 'Manual emergency triggered'] : scenario === 'obstacle' ? ['scan', 'Obstacle detected', 'Person detected at 34 cm'] : scenario === 'offline' ? ['wifi', 'Device connection lost', 'Last contact was 4 minutes ago'] : ['move', 'Walking detected', 'Movement pattern is normal'];
  const items = scenario === 'live'
    ? data.recentEvents?.length
      ? data.recentEvents.slice(0, 4).map((event) => [ 'alert', eventLabel(event.event_type), event.gps?.fix_valid ? 'Validated location attached' : 'Location unavailable', formatTime(event.occurred_at_utc) ])
      : [['wifi', 'No cloud activity yet', 'Waiting for Gateway events', '—']]
    : [ [...first, '10:41 AM'], ['pin', 'Location updated', 'Benjakitti Park, Bangkok', '10:40 AM'], ['scan', 'Obstacle avoided', 'Object detected at 42 cm', '10:36 AM'], ['wifi', 'Device synchronized', 'All sensor data received', '10:31 AM'] ];
  return items.map(([icon, title, detail, time], index) => <div className="activity-item" key={`${title}-${index}`}><span className={`activity-dot ${index ? ['','blue','amber','green'][index] : 'teal'}`}><Icon name={icon} /></span><div><strong>{title}</strong><p>{detail}</p><span>{time}</span></div></div>);
}
function AlertArea({ data, person, acknowledged, onDetails, onAcknowledge }) {
  if (!data.emergency) return <div className="empty-state"><span><Icon name={data.state === 'offline' ? 'wifi' : 'shield'} /></span><h3>{data.state === 'offline' ? 'Smart Cane is offline' : 'No active emergency alerts'}</h3><p>{data.state === 'offline' ? 'No recent sensor data has been received.' : 'No urgent safety events require attention.'}</p></div>;
  return <div className="active-alert-card"><div className="active-alert-head"><span><Icon name="alert" /></span><div><span className="alert-label">ACTIVE EMERGENCY</span><h3>{data.alertType}</h3><p>{data.alertType === 'SOS button pressed' ? 'Manual SOS was triggered by the user.' : 'TinyML motion analysis detected a fall-like event.'}</p></div><button className="btn btn-danger" onClick={onDetails}>View full details</button></div><div className="active-alert-details"><div><span>SOURCE</span><strong>{data.sourceId || person.device_id}</strong></div><div><span>EVENT TIME</span><strong>{data.eventTime || 'Unavailable'}</strong></div><div><span>GPS STATUS</span><strong>{data.gpsValid ? 'Validated GPS position available' : 'GPS unavailable or invalid'}</strong></div></div><div className="active-alert-actions">{data.gpsValid && <a className="btn btn-secondary" href={`https://www.google.com/maps?q=${data.latitude},${data.longitude}`} target="_blank" rel="noreferrer">Open validated location</a>}<button className={`btn ${acknowledged ? 'btn-secondary' : 'btn-danger'}`} onClick={onAcknowledge}>{acknowledged ? 'Acknowledged · emergency active' : 'Acknowledge alert'}</button></div></div>;
}

function App() {
  const [session, setSession] = useState(null);
  const [people, setPeople] = useState([]);
  const [personId, setPersonId] = useState(initialPerson.device_id);
  const [scenario, setScenario] = useState('live');
  const [liveData, setLiveData] = useState(sampleLive);
  const [page, setPage] = useState('overview');
  const [alertModal, setAlertModal] = useState(false);
  const [peopleModal, setPeopleModal] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [toast, setToast] = useState('');
  const person = people.find((item) => item.device_id === personId) || initialPerson;
  const data = useMemo(() => scenario === 'live' ? liveData : { ...demoBase, ...scenarios[scenario], sampleTime: null, cloudTime: null }, [scenario, liveData]);
  const heartValid = data.heartValid && data.heart != null;
  const lightValid = data.lightValid && data.light != null;
  const highHeart = heartValid && Number(data.heart) >= 120;
  const lowLight = lightValid && Number(data.light) < 30;
  const gpsValid = Boolean(data.gpsValid);
  const mapsHref = gpsValid ? `https://www.google.com/maps?q=${data.latitude},${data.longitude}` : undefined;
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const alertCount = data.emergency ? 1 : 0;

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/session', { cache: 'no-store' }), fetch('/api/people', { cache: 'no-store' })]).then(async ([sessionResponse, peopleResponse]) => {
      if (sessionResponse.status === 401 || peopleResponse.status === 401) { window.location.assign('/'); return; }
      if (!sessionResponse.ok || !peopleResponse.ok) throw new Error('Unable to load caregiver account');
      const [userPayload, peoplePayload] = await Promise.all([sessionResponse.json(), peopleResponse.json()]);
      if (!active) return;
      setSession(userPayload.user);
      const linked = peoplePayload.people || [];
      setPeople(linked);
      if (linked.length) setPersonId(linked[0].device_id);
    }).catch((error) => { if (active) setToast(error.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => { document.title = `${person.display_name} — Smart Cane Care`; }, [person.display_name]);
  useEffect(() => { document.body.style.overflow = alertModal || peopleModal ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [alertModal, peopleModal]);
  useEffect(() => {
    if (scenario !== 'live') return;
    let active = true;
    async function refresh() {
      try {
        const response = await fetch(`/api/dashboard?device_id=${encodeURIComponent(person.device_id)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`);
        const value = mapLive(await response.json());
        if (active) setLiveData(value);
      } catch {
        if (active) setLiveData({ ...emptyLive, safetyMessage: 'The live database could not be reached. Demo scenarios remain available.', sync: 'API unavailable' });
      }
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [scenario, person.device_id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(next) { setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function acknowledge() {
    if (scenario === 'live' && data.alertId) {
      try {
        const response = await fetch(`/api/alerts/${data.alertId}/acknowledge`, { method: 'POST' });
        if (!response.ok) throw new Error('Unable to acknowledge alert');
      } catch { setToast('Acknowledgment failed. Please check the connection and try again.'); return; }
    }
    setAcknowledged(true); setAlertModal(false); setToast('Alert acknowledged. Emergency remains active until safety is verified.');
  }
  async function addPerson(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormMessage('กำลังเชื่อมต่อ...');
    try {
      const response = await fetch('/api/people', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to add person');
      const refreshed = await fetch('/api/people', { cache: 'no-store' });
      const payload = await refreshed.json();
      setPeople(payload.people || []); setPersonId(result.person.device_id); form.reset();
      setFormMessage(`เชื่อมต่อ ${result.person.display_name} แล้ว`);
    } catch (error) { setFormMessage(error.message); }
  }
  async function logout() {
    try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
    finally { window.location.assign('/'); }
  }
  const overrides = {
    pageTitle: page === 'alerts' ? 'Emergency alerts' : 'Safety overview', currentDateLabel: day,
    welcomeTitle: `${greeting}, ${session?.name?.split(' ')[0] || 'Caregiver'}`, activePersonName: person.display_name,
    safetyStatus: data.state === 'safe' ? scenario === 'live' ? 'No active safety alerts' : 'Demo sample' : data.status,
    safetyMessage: data.state === 'safe' && scenario === 'live' ? `${person.display_name} is safe and being monitored normally.` : data.safetyMessage,
    activeDeviceId: person.device_id, lastStatusTime: data.lastUpdatedLabel || (data.state === 'offline' ? 'Unavailable' : 'Just now'), activeEmergencies: person.display_name,
    headerConnection: data.connection, syncTime: data.sync, lastSyncTop: data.cloudTime ? formatTime(data.cloudTime) : data.lastUpdatedLabel || 'Waiting for data',
    heartValue: heartValid ? data.heart : '—', heartChip: highHeart ? 'High' : !heartValid ? 'Invalid' : data.state === 'offline' ? 'Stale' : 'Normal', heartDetail: highHeart ? 'Above expected resting range' : !heartValid ? 'Sensor marked this reading invalid' : 'Within resting range',
    movementValue: data.movement, movementChip: data.movementChip, movementDetail: data.movementDetail,
    lightValue: lightValid ? data.light : '—', lightChip: lowLight ? 'Low light' : !lightValid ? 'Invalid' : 'Normal', lightDetail: lowLight ? 'Visibility may be limited' : !lightValid ? 'Sensor marked this reading invalid' : 'Comfortable lighting',
    contractVersion: `v${data.schemaVersion || '0.2'}`, sourceIdentity: `${data.sourceId || person.device_id} · ${data.gatewayId || person.device_id}`, originKind: data.originKind === 'physical' ? 'Physical device' : data.originKind === 'simulated' ? 'Simulated data' : 'Unknown origin', freshnessState: String(data.freshness || 'fresh').replaceAll('_', ' '), sampleTime: formatTime(data.sampleTime), cloudTime: formatTime(data.cloudTime),
    nodeTraceLabel: data.nodeFreshness === 'sample' ? 'NODE TELEMETRY · DEMO SAMPLE' : data.nodeFreshness === 'fresh' ? 'NODE TELEMETRY · LIVE' : data.nodeFreshness === 'stale' ? 'NODE TELEMETRY · STALE' : data.nodeFreshness === 'offline' ? 'NODE TELEMETRY · OFFLINE' : 'NODE TELEMETRY · WAITING',
    nodeTraceSource: data.sourceId || '—', nodeTraceSeq: data.sourceSeq ?? '—',
    nodeTraceDistance: (scenario === 'live' ? data.distanceCm ?? (data.nodeFreshness === 'sample' ? data.obstacle : null) : data.obstacle) ?? '—',
    nodeTraceTime: formatTime(data.nodeCloudTime),
    gpsAvailability: gpsValid ? '● GPS valid' : '● GPS unavailable', locationLabel: gpsValid ? 'Validated GPS position' : 'Waiting for a valid GPS fix', locationCoordinates: gpsValid ? `${Number(data.latitude).toFixed(6)}°, ${Number(data.longitude).toFixed(6)}°${data.gpsAccuracy != null ? ` · Accuracy ±${data.gpsAccuracy} m` : ''}` : 'Coordinates hidden because fix_valid is false or stale', gpsTimestamp: gpsValid ? formatTime(data.sampleTime || data.cloudTime) : 'Unavailable', markerStatus: gpsValid ? 'Updated just now' : 'No live GPS reading',
    bannerTitle: data.alertType, bannerCopy: data.alertType === 'SOS button pressed' ? 'The user triggered a manual SOS alert.' : 'TinyML motion analysis detected a fall-like event.', cautionLabel: highHeart ? 'HEART RATE CAUTION' : 'LOW LIGHT CAUTION', cautionTitle: highHeart ? `High heart rate: ${data.heart} BPM` : `Dark environment: ${data.light} lux`, cautionCopy: highHeart ? 'Please check how the user is feeling.' : 'Visibility may be limited. Please check the surroundings.',
    caregiverInitials: session?.name?.split(/\s+/).slice(0,2).map((x)=>x[0]).join('').toUpperCase() || 'CG', caregiverName: session?.name || 'Caregiver', caregiverEmail: session?.email || 'Signed in securely', navAlertCount: alertCount,
    alertPageStatus: data.emergency ? acknowledged ? '1 active · acknowledged' : '1 active emergency' : 'No active emergency',
    modalTitle: data.alertType, modalLead: data.alertType === 'SOS button pressed' ? 'The user manually triggered an SOS alert. Please contact them or verify their latest location.' : 'TinyML motion analysis detected a fall-like event. Please contact the user or verify their location.', modalDevice: `${person.device_id} · ${data.sourceId || person.device_id}`, modalTime: data.eventTime || 'Unavailable', modalLocation: gpsValid ? 'Validated GPS position available' : 'GPS unavailable or invalid', modalCoordinates: gpsValid ? `${Number(data.latitude).toFixed(6)}°, ${Number(data.longitude).toFixed(6)}°` : 'Coordinates are hidden because fix_valid is false or the fix is stale.',
    personFormMessage: formMessage,
  };
  const options = { replace(node) {
    if (node.type !== 'tag' || !node.attribs) return;
    const id = node.attribs.id;
    const attrs = attributesToProps(node.attribs);
    const render = (extra = {}, children = undefined) => React.createElement(node.name, { ...attrs, ...extra }, children === undefined ? domToReact(node.children, options) : children);
    if (node.attribs['data-page']) return render({ className: `${attrs.className || ''} ${node.attribs['data-page'] === page ? 'active' : ''}`.trim(), onClick: () => navigate(node.attribs['data-page']) });
    if (id === 'page-overview' || id === 'page-alerts') return render({ className: `page ${page === (id === 'page-overview' ? 'overview' : 'alerts') ? 'active' : ''}` });
    if (id === 'personSelect') return <select id={id} aria-label="เลือกผู้ที่อยู่ในการดูแล" value={personId} onChange={(event) => setPersonId(event.target.value)}>{(people.length ? people : [initialPerson]).map((item) => <option key={item.device_id} value={item.device_id}>{item.display_name}</option>)}</select>;
    if (id === 'scenarioSelect') return <select id={id} value={scenario} onChange={(event) => { setScenario(event.target.value); setAcknowledged(false); }}>{Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>;
    if (id === 'safetyCard') return render({ className: `safety-card state-${data.state}` });
    if (id === 'nodeTraceLabel') return render({ className: data.nodeFreshness === 'sample' ? 'sample-label' : '' }, overrides[id]);
    if (id === 'safetyStatusIcon') return render({}, <><Icon name={data.state === 'safe' ? 'shield' : data.state === 'offline' ? 'wifi' : 'alert'} /><span className="pulse-ring" /></>);
    if (id === 'emergencyBanner') return render({ hidden: !data.emergency });
    if (id === 'cautionBanner') return render({ hidden: !(data.state === 'warning' && (highHeart || lowLight)) });
    if (id === 'heartCard' || id === 'lightCard') return render({ className: `metric-card ${data.state === 'offline' ? 'stale' : ''} ${(id === 'heartCard' && highHeart) || (id === 'lightCard' && lowLight) ? 'warning-metric' : ''}` });
    if (id === 'heartChip' || id === 'lightChip') return render({ className: `status-chip ${id === 'heartChip' ? highHeart ? 'status-danger' : !heartValid ? 'status-muted' : 'status-normal' : lowLight ? 'status-warning' : !lightValid ? 'status-muted' : 'status-normal'}` }, overrides[id]);
    if (id === 'gpsAvailability') return render({ className: `gps-live ${gpsValid ? '' : 'gps-invalid'}` }, overrides[id]);
    if (id === 'overviewMapsLink' || (node.name === 'a' && attrs.className?.includes('maps-link'))) return render({ href: mapsHref, 'aria-disabled': !gpsValid, className: `${attrs.className || ''} ${gpsValid ? '' : 'disabled-link'}`.trim(), hidden: id !== 'overviewMapsLink' && !gpsValid });
    if (id === 'recentActivity') return render({}, <ActivityList scenario={scenario} data={data} />);
    if (id === 'activeAlertArea') return render({}, <AlertArea data={data} person={person} acknowledged={acknowledged} onDetails={() => setAlertModal(true)} onAcknowledge={acknowledge} />);
    if (id === 'alertHistoryBody') return render({}, data.recentEvents?.length ? data.recentEvents.slice(0,20).map((event) => <tr key={event.event_id}><td><span className="table-event danger"><Icon name="alert" />{eventLabel(event.event_type)}</span><small className="event-id">{event.event_id}</small></td><td>{event.source_id || event.device_id || 'Unknown'}</td><td>{formatTime(event.occurred_at_utc)}</td><td>{event.gps?.fix_valid ? `${Number(event.gps.lat_deg).toFixed(5)}, ${Number(event.gps.lon_deg).toFixed(5)}` : 'GPS unavailable'}</td><td><span className="status-chip status-muted">{event.delivery_state || 'unknown'}</span></td></tr>) : <tr><td colSpan="5">No alert records yet</td></tr>);
    if (id === 'peopleList') return render({}, (people.length ? people : [initialPerson]).map((item) => <button type="button" className={`person-list-item ${item.device_id === personId ? 'active' : ''}`} key={item.device_id} onClick={() => { setPersonId(item.device_id); setPeopleModal(false); }}><span>{item.display_name.slice(0,2).toUpperCase()}</span><div><strong>{item.display_name}</strong><small>{item.relationship || 'Person in care'} · {item.device_id}</small></div><i>{item.device_id === personId ? 'กำลังดู' : 'เลือก'}</i></button>));
    if (id === 'personForm') return render({ onSubmit: addPerson });
    if (id === 'alertModal' || id === 'peopleModal') return render({ hidden: id === 'alertModal' ? !alertModal : !peopleModal, onClick: (event) => { if (event.target === event.currentTarget) id === 'alertModal' ? setAlertModal(false) : setPeopleModal(false); } });
    if (id === 'toast') return render({ hidden: !toast }, <><Icon name="check" /><div><strong>{toast ? toast.split('.')[0] : ''}</strong><span>{toast?.includes('.') ? toast.slice(toast.indexOf('.')+1).trim() : ''}</span></div></>);
    if (id === 'mobileAlertDot' || id === 'notificationDot') return render({ hidden: !alertCount });
    if (id === 'bellButton') return render({ onClick: () => navigate('alerts') });
    if (id === 'managePeopleButton') return render({ onClick: () => setPeopleModal(true) });
    if (id === 'logoutButton') return render({ onClick: logout });
    if (id === 'closePeopleModal') return render({ onClick: () => setPeopleModal(false) });
    if (id === 'closeModal') return render({ onClick: () => setAlertModal(false) });
    if (id === 'viewAlertButton') return render({ onClick: () => setAlertModal(true) });
    if (id === 'acknowledgeButton') return render({ onClick: acknowledge });
    if (id === 'overviewMap') return render({ style: data.state === 'offline' ? { filter: 'saturate(.55)' } : undefined });
    if (id === 'alertPageStatus') return render({ className: `status-chip ${data.emergency ? 'status-danger' : 'status-normal'}` }, overrides[id]);
    if (id === 'locationMarker') return render({}, domToReact(node.children, { replace(child) { if (child.name === 'div' && child.attribs?.class === 'marker-label') return <div className="marker-label"><strong>{person.display_name}'s Smart Cane</strong><span>{overrides.markerStatus}</span></div>; } }));
    if (Object.hasOwn(overrides, id)) return render({}, overrides[id]);
  }};
  return parse(markup, options);
}

createRoot(document.getElementById('root')).render(<App />);

import { useEffect, useMemo, useState } from 'react';
import { Activity, BatteryCharging, BellRing, Gauge, Radio, Thermometer, Zap, Wifi, WifiOff } from 'lucide-react';
import { onValue, query, limitToLast, orderByChild, ref } from 'firebase/database';
import { db, ensureAnonymousAuth, firebaseConfigured } from './firebase';
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const nowLabel = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function generateReading(previous = {}, scenario = 'normal') {
  const t = Date.now();
  const wobble = (a) => (Math.random() - 0.5) * a;
  let voltage = 360 + wobble(8);
  let current = 42 + wobble(12);
  let temperature = 31 + wobble(4);
  let soc = previous.soc == null ? 78 : previous.soc - (0.012 + Math.random() * 0.02);
  if (scenario === 'hot') temperature = 57 + wobble(5);
  if (scenario === 'low_voltage') voltage = 292 + wobble(9);
  if (scenario === 'high_current') current = 112 + wobble(18);
  soc = clamp(soc, 10, 100);
  const power = voltage * current / 1000;
  const alerts = [];
  if (temperature >= 50) alerts.push('High battery temperature');
  if (voltage <= 310) alerts.push('Low battery voltage');
  if (current >= 100) alerts.push('High current');
  return { timestamp: t, voltage: +voltage.toFixed(1), current: +current.toFixed(1), temperature: +temperature.toFixed(1), power: +power.toFixed(2), soc: +soc.toFixed(1), alerts, scenario, simulated: true };
}

function MetricCard({ icon: Icon, label, value, unit, note, tone = 'blue' }) {
  return <section className={`metric-card ${tone}`}>
    <div className="metric-top"><span className="metric-icon"><Icon size={19} /></span><span className="metric-label">{label}</span></div>
    <div className="metric-value">{value}<small>{unit}</small></div>
    <div className="metric-note">{note}</div>
  </section>;
}

function ChartPanel({ title, subtitle, children, className = '' }) {
  return <section className={`panel chart-panel ${className}`}>
    <div className="panel-heading"><div><h3>{title}</h3><p>{subtitle}</p></div></div>
    {children}
  </section>;
}

export default function App() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [connection, setConnection] = useState(firebaseConfigured ? 'connecting' : 'demo');
  const [scenario, setScenario] = useState('normal');
  const [sourceError, setSourceError] = useState('');
  const [mode, setMode] = useState(firebaseConfigured ? 'firebase' : 'demo');
  const [activeSection, setActiveSection] = useState('overview');

  const navigateTo = (section) => {
    setActiveSection(section);
    const target = document.getElementById(section);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!firebaseConfigured || mode === 'demo') {
      setConnection('demo');
      const first = generateReading({}, scenario);
      setLatest(first);
      setHistory((h) => [...h.slice(-59), first]);
      const timer = window.setInterval(() => {
        setLatest((prev) => {
          const next = generateReading(prev || {}, scenario);
          setHistory((h) => [...h.slice(-59), next]);
          return next;
        });
      }, 2000);
      return () => window.clearInterval(timer);
    }

    let unsubLatest;
    let unsubHistory;
    let alive = true;
    setConnection('connecting');
    ensureAnonymousAuth().then(() => {
      if (!alive) return;
      unsubLatest = onValue(ref(db, 'evMonitor/latest'), (snap) => {
        if (!alive) return;
        if (snap.exists()) {
          setLatest(snap.val());
          setConnection('live');
          setSourceError('');
        }
      }, (error) => {
        if (alive) { setConnection('error'); setSourceError(error.message); }
      });
      const histQuery = query(ref(db, 'evMonitor/readings'), orderByChild('timestamp'), limitToLast(60));
      unsubHistory = onValue(histQuery, (snap) => {
        if (!alive) return;
        const arr = [];
        snap.forEach((child) => arr.push({ id: child.key, ...child.val() }));
        arr.sort((a, b) => a.timestamp - b.timestamp);
        if (arr.length) setHistory(arr);
      }, (error) => {
        if (alive) { setConnection('error'); setSourceError(error.message); }
      });
    }).catch((error) => {
      if (alive) { setConnection('error'); setSourceError(error.message); }
    });
    return () => {
      alive = false;
      if (unsubLatest) unsubLatest();
      if (unsubHistory) unsubHistory();
    };
  }, [mode, scenario]);

  const chartData = useMemo(() => history.map((x) => ({
    ...x, time: nowLabel(x.timestamp), voltage: Number(x.voltage || 0),
    current: Number(x.current || 0), temperature: Number(x.temperature || 0),
    soc: Number(x.soc || 0)
  })), [history]);

  const alerts = latest?.alerts || [];
  const status = connection === 'live' ? 'Connected to Firebase' : connection === 'demo' ? 'Local simulation' : connection === 'error' ? 'Connection issue' : 'Connecting…';
  const display = (n, digits = 1) => Number.isFinite(Number(n)) ? Number(n).toFixed(digits) : '—';

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BatteryCharging size={23} /></div><div><strong>VoltWatch</strong><span>EV TELEMETRY</span></div></div>
      <div className="side-section-label">WORKSPACE</div>
      <button type="button" className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`} onClick={() => navigateTo('overview')} aria-current={activeSection === 'overview' ? 'page' : undefined}><Gauge size={18} /> Overview</button>
      <button type="button" className={`nav-item ${activeSection === 'analytics' ? 'active' : ''}`} onClick={() => navigateTo('analytics')} aria-current={activeSection === 'analytics' ? 'page' : undefined}><Activity size={18} /> Battery analytics</button>
      <button type="button" className={`nav-item ${activeSection === 'alerts' ? 'active' : ''}`} onClick={() => navigateTo('alerts')} aria-current={activeSection === 'alerts' ? 'page' : undefined}><BellRing size={18} /> Alerts <span className="nav-count">{alerts.length}</span></button>
      <div className="sidebar-bottom"><div className="device-dot" /><div><b>EV-SIM-001</b><span>Simulated battery pack</span></div></div>
    </aside>

    <main className="main-content" id="overview">
      <header className="topbar">
        <div><div className="eyebrow">FLEET / BATTERY SYSTEMS</div><h1>EV Health Monitor</h1><p className="page-subtitle">Real-time battery telemetry and condition overview</p></div>
        <div className="topbar-right">
          <div className={`connection ${connection}`}><span className="status-dot" />{status}</div>
          <div className="avatar">EV</div>
        </div>
      </header>

      <div className="notice"><span className="notice-icon"><Activity size={17} /></span><div><b>Simulation environment</b><p>Measurements are generated by software for demonstration; they are not readings from a real EV.</p></div></div>

      <div className="section-title-row"><div><h2>Battery snapshot</h2><p>Latest available telemetry</p></div>
        <div className="control-group"><label htmlFor="mode">Data source</label><select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}><option value="firebase" disabled={!firebaseConfigured}>Firebase live</option><option value="demo">Browser demo</option></select>
        <label htmlFor="scenario">Scenario</label><select id="scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="normal">Normal</option><option value="hot">High temperature</option><option value="low_voltage">Low voltage</option><option value="high_current">High current</option></select></div>
      </div>

      {sourceError && <div className="error-banner"><WifiOff size={17} /> Firebase error: {sourceError}. Check Anonymous Authentication and Realtime Database rules.</div>}

      <div className="metrics-grid">
        <MetricCard icon={Zap} label="Pack voltage" value={display(latest?.voltage)} unit=" V" note="DC bus voltage" tone="blue" />
        <MetricCard icon={Activity} label="Pack current" value={display(latest?.current)} unit=" A" note="Instantaneous current" tone="purple" />
        <MetricCard icon={Gauge} label="Output power" value={display(latest?.power, 2)} unit=" kW" note="Voltage × current" tone="cyan" />
        <MetricCard icon={Thermometer} label="Battery temperature" value={display(latest?.temperature)} unit=" °C" note={Number(latest?.temperature) >= 50 ? 'Above demo threshold' : 'Within demo threshold'} tone={Number(latest?.temperature) >= 50 ? 'orange' : 'green'} />
      </div>

      <div className="content-grid" id="analytics">
        <ChartPanel title="Voltage & current" subtitle="Recent telemetry · last 60 readings">
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 5" stroke="#243047" /><XAxis dataKey="time" tick={{ fill: '#7f8da6', fontSize: 10 }} minTickGap={34} /><YAxis yAxisId="left" tick={{ fill: '#7f8da6', fontSize: 11 }} /><YAxis yAxisId="right" orientation="right" tick={{ fill: '#7f8da6', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#111a2d', border: '1px solid #2b3953', borderRadius: 10, color: '#e8eef9' }} /><Legend /><Line yAxisId="left" type="monotone" dataKey="voltage" name="Voltage (V)" stroke="#67a9ff" dot={false} strokeWidth={2} isAnimationActive={false} /><Line yAxisId="right" type="monotone" dataKey="current" name="Current (A)" stroke="#b18cff" dot={false} strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
        </ChartPanel>
        <ChartPanel title="Battery temperature" subtitle="Thermal trend · °C">
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff9b66" stopOpacity={0.3} /><stop offset="100%" stopColor="#ff9b66" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" stroke="#243047" /><XAxis dataKey="time" tick={{ fill: '#7f8da6', fontSize: 10 }} minTickGap={34} /><YAxis tick={{ fill: '#7f8da6', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#111a2d', border: '1px solid #2b3953', borderRadius: 10, color: '#e8eef9' }} /><Area type="monotone" dataKey="temperature" name="Temperature (°C)" stroke="#ff9b66" fill="url(#tempFill)" strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
        </ChartPanel>
      </div>

      <div className="lower-grid">
        <section className="panel soc-panel"><div className="panel-heading"><div><h3>State of charge</h3><p>Illustrative software estimate</p></div><BatteryCharging size={20} className="subtle-icon" /></div>
          <div className="soc-content"><div className="soc-ring" style={{ '--soc': `${clamp(Number(latest?.soc || 0), 0, 100)}%` }}><div><strong>{display(latest?.soc, 0)}<small>%</small></strong><span>Estimated SOC</span></div></div><div className="soc-details"><div><span>Battery profile</span><b>Demo · 60 Ah reference</b></div><div><span>Telemetry cadence</span><b>2 seconds</b></div><div><span>Last update</span><b>{latest?.timestamp ? new Date(latest.timestamp).toLocaleTimeString() : 'Waiting…'}</b></div></div></div>
        </section>
        <section className="panel alerts-panel" id="alerts"><div className="panel-heading"><div><h3>Active alerts</h3><p>Threshold-based demo notifications</p></div><span className={`alert-badge ${alerts.length ? 'warning' : 'ok'}`}>{alerts.length} active</span></div>
          {alerts.length ? <div className="alert-list">{alerts.map((a, i) => <div className="alert-row" key={`${a}-${i}`}><span className="alert-symbol"><BellRing size={16} /></span><div><b>{a}</b><span>Triggered by simulated telemetry</span></div><span className="alert-severity">WARNING</span></div>)}</div> : <div className="empty-alerts"><div className="check-circle">✓</div><div><b>No active alerts</b><span>Current simulated readings are within the demo thresholds.</span></div></div>}
        </section>
      </div>

      <section className="panel history-panel"><div className="panel-heading"><div><h3>Recent readings</h3><p>Most recent telemetry events</p></div><span className="history-count">{history.length} readings</span></div>
        <div className="table-scroll"><table><thead><tr><th>TIME</th><th>VOLTAGE</th><th>CURRENT</th><th>POWER</th><th>TEMP.</th><th>SOC</th><th>STATUS</th></tr></thead><tbody>{[...history].slice(-8).reverse().map((r, i) => <tr key={`${r.timestamp}-${i}`}><td>{nowLabel(r.timestamp)}</td><td>{display(r.voltage)} V</td><td>{display(r.current)} A</td><td>{display(r.power, 2)} kW</td><td>{display(r.temperature)} °C</td><td>{display(r.soc, 0)}%</td><td><span className={`table-status ${(r.alerts || []).length ? 'warn' : 'normal'}`}><span />{(r.alerts || []).length ? `${r.alerts.length} alert(s)` : 'Normal'}</span></td></tr>)}</tbody></table></div>
      </section>
      <footer><span><Radio size={14} /> VoltWatch telemetry dashboard</span><span>Simulation build · v1.0.0</span></footer>
    </main>
  </div>;
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import {
  fetchVitalsSummary, fetchPatientHistory, fetchPatientAlerts,
  fetchAlertTimeline, fetchAlertStats,
  fetchCernerPatientDetails, fetchCernerConditions, fetchCernerMedications,
  fetchCernerAllergies, fetchCernerLabs,
} from '../api';
import { useAppStore } from '../store/vitalsStore';
import { useUiStore } from '../store/uiStore';
import './PatientHistory.css';

type TabKey = 'overview' | '24h' | '12h' | 'explorer' | 'alerts' | 'clinical';

const VITAL_KEYS = ['heart_rate', 'spo2', 'temperature', 'respiratory_rate', 'systolic_bp', 'diastolic_bp'] as const;
const ALL_VITAL_KEYS = ['heart_rate', 'spo2', 'temperature', 'respiratory_rate', 'systolic_bp', 'diastolic_bp'] as const;

const VC: Record<string, string> = {
  heart_rate: '#ffb74a', spo2: '#5cc2e8', temperature: '#48e6a0',
  respiratory_rate: '#a78bfa', systolic_bp: '#ff5d72', diastolic_bp: '#5cc2e8',
};
const VL: Record<string, string> = {
  heart_rate: 'Heart Rate', spo2: 'SpO₂', temperature: 'Temperature',
  respiratory_rate: 'Resp. Rate', systolic_bp: 'Systolic BP', diastolic_bp: 'Diastolic BP',
};
const VU: Record<string, string> = {
  heart_rate: 'bpm', spo2: '%', temperature: '°F',
  respiratory_rate: 'br/min', systolic_bp: 'mmHg', diastolic_bp: 'mmHg',
};

const PIE_COLORS = ['#ffb74a', '#5cc2e8', '#48e6a0', '#a78bfa', '#ff5d72', '#f472b6'];

const tabAnim = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0, 0, 0.2, 1] as const } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
};
const cardAnim = { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, transition: { duration: 0.18 } };

// ── Helpers ──────────────────────────────────────────────
function Loading({ msg = 'Loading...' }: { msg?: string }) {
  return (
    <motion.div className="history-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="history-spinner" /><p>{msg}</p>
    </motion.div>
  );
}
function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <motion.div className="history-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12h6M12 9v6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
      <p>{title}</p>{sub && <p className="empty-sub">{sub}</p>}
    </motion.div>
  );
}
function Skeletons({ n = 5 }: { n?: number }) {
  return <div className="stat-cards">{Array.from({ length: n }).map((_, i) => <div key={i} className="skeleton-card skeleton" />)}</div>;
}
function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--line)', padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
      <div style={{ color: 'var(--ink-dim)', marginBottom: 4 }}>{typeof label === 'number' ? new Date(label).toLocaleString() : label}</div>
      {payload.map((p: any, i: number) => <div key={i} style={{ color: p.color || 'var(--ink)', fontWeight: 600 }}>{p.name}: {p.value ?? '--'}</div>)}
    </div>
  );
}
function fmtTime(ts: string) { return ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'; }
function fmtDateTime(ts: string) { return ts ? new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'; }

function groupAlerts(alerts: any[]): any[] {
  if (!alerts?.length) return [];
  const groups: any[] = [];
  let cur: any = null;

  for (const a of alerts) {
    const ts = a.created_at ? new Date(a.created_at).getTime() : 0;
    if (cur && cur.vital_type === a.vital_type && cur.severity === a.severity && Math.abs(ts - cur._lastTs) <= 5 * 60 * 1000) {
      cur.count++;
      cur._lastTs = ts;
      cur.end_at = a.created_at;
      cur.values.push(a.value);
      cur.points.push({ time: ts, value: a.value });
    } else {
      if (cur) groups.push(cur);
      cur = { ...a, count: 1, start_at: a.created_at, end_at: a.created_at, _lastTs: ts, values: [a.value], points: [{ time: ts, value: a.value }] };
    }
  }
  if (cur) groups.push(cur);
  return groups;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
export default function PatientHistory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const patients = useAppStore(state => state.patients);
  const patient = id ? patients[id] : null;

  const setDrawerOpen = useUiStore(state => state.setDrawerOpen);
  const setAlertsRailOpen = useUiStore(state => state.setAlertsRailOpen);

  useEffect(() => {
    setDrawerOpen(false);
    setAlertsRailOpen(false);
  }, [setDrawerOpen, setAlertsRailOpen]);

  const [tab, setTab] = useState<TabKey>('overview');

  // Data
  const [expandedAlert, setExpandedAlert] = useState<number | null>(null);
  const [s24, setS24] = useState<any[] | null>(null);
  const [s12, setS12] = useState<any[] | null>(null);
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [alertTL, setAlertTL] = useState<any[] | null>(null);
  const [alertSt, setAlertSt] = useState<any | null>(null);
  const [cernerDet, setCernerDet] = useState<any | null>(null);
  const [conditions, setConditions] = useState<any[] | null>(null);
  const [medications, setMedications] = useState<any[] | null>(null);
  const [allergies, setAllergies] = useState<any[] | null>(null);
  const [labs, setLabs] = useState<any[] | null>(null);

  // Loading
  const [ldSum, setLdSum] = useState(false);
  const [ldAlt, setLdAlt] = useState(false);
  const [ldCli, setLdCli] = useState(false);

  // Explorer
  const [exDate, setExDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [exHour, setExHour] = useState(() => new Date().getHours());
  const [exData, setExData] = useState<any[]>([]);
  const [exVital, setExVital] = useState('heart_rate');
  const [ldEx, setLdEx] = useState(false);

  // Alert filters
  const [sevFilter, setSevFilter] = useState('all');
  const [vitFilter, setVitFilter] = useState('all');

  // ── Loaders ──────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    if (!id) return; setLdSum(true);
    try { const [a, b] = await Promise.all([fetchVitalsSummary(id, 24), fetchVitalsSummary(id, 12)]); setS24(a); setS12(b); }
    catch (e) { console.error(e); } finally { setLdSum(false); }
  }, [id]);

  const loadAlerts = useCallback(async () => {
    if (!id) return; setLdAlt(true);
    try { const [a, t, s] = await Promise.all([fetchPatientAlerts(id, 24, 500), fetchAlertTimeline(id, 24), fetchAlertStats(id, 24)]); setAlerts(a); setAlertTL(t); setAlertSt(s); }
    catch (e) { console.error(e); } finally { setLdAlt(false); }
  }, [id]);

  const loadClinical = useCallback(async () => {
    if (!id) return; setLdCli(true);
    try {
      const [d, c, m, a, l] = await Promise.all([
        fetchCernerPatientDetails(id).catch(() => null), fetchCernerConditions(id).catch(() => []),
        fetchCernerMedications(id).catch(() => []), fetchCernerAllergies(id).catch(() => []),
        fetchCernerLabs(id).catch(() => []),
      ]);
      setCernerDet(d); setConditions(c); setMedications(m); setAllergies(a); setLabs(l);
    } catch (e) { console.error(e); } finally { setLdCli(false); }
  }, [id]);

  const loadExplorer = useCallback(async () => {
    if (!id) return; setLdEx(true);
    try {
      const data = await fetchPatientHistory(id, exDate, exHour);
      setExData(data.map((d: any) => ({ ...d, ts: new Date(d.recorded_at).getTime() })));
    } catch (e) { console.error(e); } finally { setLdEx(false); }
  }, [id, exDate, exHour]);

  useEffect(() => {
    if ((tab === 'overview' || tab === '24h' || tab === '12h') && !s24) loadSummary();
    if ((tab === 'overview' || tab === 'alerts') && !alerts) loadAlerts();
    if ((tab === 'overview' || tab === 'clinical') && !conditions) loadClinical();
    if (tab === 'explorer') loadExplorer();
  }, [tab, loadSummary, loadAlerts, loadClinical, loadExplorer, s24, alerts, conditions]);

  // ── Computed ─────────────────────────────────────────
  const groupedAlerts = useMemo(() => {
    if (!alerts) return [];
    let filtered = alerts;
    if (sevFilter !== 'all') filtered = filtered.filter(a => a.severity === sevFilter);
    if (vitFilter !== 'all') filtered = filtered.filter(a => a.vital_type === vitFilter);
    return groupAlerts(filtered);
  }, [alerts, sevFilter, vitFilter]);

  const alertTLChart = useMemo(() => {
    if (!alertTL) return [];
    
    // Generate 24 hourly buckets up to the current hour
    const now = new Date();
    now.setMinutes(0, 0, 0); // truncate to current hour
    
    const buckets: any[] = [];
    for (let i = 23; i >= 0; i--) {
      const ts = now.getTime() - (i * 3600000);
      buckets.push({ ts, total: 0 });
    }
    
    // Populate with actual alert counts
    alertTL.forEach((item: any) => {
      const itemTs = new Date(item.bucket).getTime();
      // Find closest bucket within an hour
      const bucket = buckets.find(b => Math.abs(b.ts - itemTs) <= 1800000);
      if (bucket) {
        bucket.total += item.count;
      }
    });
    
    return buckets;
  }, [alertTL]);

  const alertPieData = useMemo(() => {
    return alertSt?.by_vital?.map((v: any) => ({ name: VL[v.vital_type] || v.vital_type, value: v.count })) ?? [];
  }, [alertSt]);

  const sevPieData = useMemo(() => {
    if (!alertSt?.by_severity) return [];
    return Object.entries(alertSt.by_severity).map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v as number }));
  }, [alertSt]);

  // ── Tab Config ──────────────────────────────────────
  const tabs: { key: TabKey; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'overview', label: 'Overview', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg> },
    { key: '24h', label: '24h Summary', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
    { key: '12h', label: '12h Summary', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 8 14" /></svg> },
    { key: 'explorer', label: 'Vitals Explorer', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h4l2-7 4 14 3-9 2 4h5" /></svg> },
    { key: 'alerts', label: 'Alerts History', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" /></svg>, badge: alertSt?.total || undefined },
    { key: 'clinical', label: 'Clinical Records', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg> },
  ];

  // ═══════════════════════════════════════════════════
  // OVERVIEW
  // ═══════════════════════════════════════════════════
  const renderOverview = () => {
    if (ldSum && !s24) return <Skeletons />;
    const latest = s24?.length ? s24[s24.length - 1] : null;

    return (
      <motion.div {...tabAnim} className="overview-landing">
        {/* HERO CARD */}
        <div className="hero-patient-card">
          <div className="hpc-bg-mesh" />
          <div className="hpc-content">
            <div className="hpc-avatar">{patient?.name?.charAt(0) || cernerDet?.name?.charAt(0) || '?'}</div>
            <div className="hpc-details">
              <h2>{patient?.name || cernerDet?.name || 'Unknown Patient'}</h2>
              <div className="hpc-meta">
                <span>{patient?.age || cernerDet?.age || '?'}y</span>
                <span className="dot">•</span>
                <span style={{ textTransform: 'capitalize' }}>{cernerDet?.gender || 'Unknown'}</span>
                <span className="dot">•</span>
                <span className="condition">{patient?.condition || 'No condition'}</span>
                {id && (
                  <>
                    <span className="dot">•</span>
                    <span className="cerner-id">CERNER ID: {id}</span>
                  </>
                )}
              </div>
              
              {/* Extended Demographics */}
              {cernerDet && (
                <div className="hpc-extended">
                  {cernerDet.birth_date && cernerDet.birth_date !== 'unknown' && (
                    <div className="hpc-ext-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> {cernerDet.birth_date}</div>
                  )}
                  {cernerDet.telecoms?.length > 0 && (
                    <div className="hpc-ext-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> {cernerDet.telecoms[0]}</div>
                  )}
                  {cernerDet.addresses?.length > 0 && (
                    <div className="hpc-ext-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> {cernerDet.addresses[0]}</div>
                  )}
                </div>
              )}
            </div>
            {cernerDet?.has_active_encounter && (
              <div className="hpc-encounter-badge">
                <div className="pulse-dot" />
                Active Encounter
              </div>
            )}
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="history-section-title" style={{ marginTop: 16 }}>Dashboard Modules</div>
        <div className="action-cards-grid">
          <motion.div className="action-card" onClick={() => setTab('clinical')} whileHover={{ y: -6 }} whileTap={{ scale: 0.97 }}>
            <div className="ac-bg" style={{ background: 'linear-gradient(135deg, rgba(72,230,160,0.15) 0%, rgba(72,230,160,0.02) 100%)' }} />
            <div className="ac-icon" style={{ color: '#48e6a0' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
            <div className="ac-info">
              <h3>Clinical Records</h3>
              <p>Conditions, Meds, Labs & Allergies from Cerner EHR</p>
            </div>
          </motion.div>

          <motion.div className="action-card" onClick={() => setTab('alerts')} whileHover={{ y: -6 }} whileTap={{ scale: 0.97 }}>
            <div className="ac-bg" style={{ background: 'linear-gradient(135deg, rgba(255,93,114,0.15) 0%, rgba(255,93,114,0.02) 100%)' }} />
            <div className="ac-icon" style={{ color: '#ff5d72' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
            <div className="ac-info">
              <h3>Alerts History</h3>
              <p>Analyze past critical and warning severity events</p>
            </div>
          </motion.div>

          <motion.div className="action-card" onClick={() => setTab('explorer')} whileHover={{ y: -6 }} whileTap={{ scale: 0.97 }}>
            <div className="ac-bg" style={{ background: 'linear-gradient(135deg, rgba(92,194,232,0.15) 0%, rgba(92,194,232,0.02) 100%)' }} />
            <div className="ac-icon" style={{ color: '#5cc2e8' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
            <div className="ac-info">
              <h3>Vitals Explorer</h3>
              <p>Minute-by-minute precise telemetry search and analysis</p>
            </div>
          </motion.div>

          <motion.div className="action-card" onClick={() => setTab('24h')} whileHover={{ y: -6 }} whileTap={{ scale: 0.97 }}>
            <div className="ac-bg" style={{ background: 'linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(167,139,250,0.02) 100%)' }} />
            <div className="ac-icon" style={{ color: '#a78bfa' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
            <div className="ac-info">
              <h3>24h Summary</h3>
              <p>Daily averages, min/max ranges, and hourly breakdown</p>
            </div>
          </motion.div>
        </div>
      </motion.div>
    );
  };

  // ═══════════════════════════════════════════════════
  // SUMMARY (24h / 12h) — TABLE + CHARTS
  // ═══════════════════════════════════════════════════
  const renderSummary = (hours: number) => {
    const data = hours === 24 ? s24 : s12;
    if (ldSum && !data) return <Loading msg={`Loading ${hours}h summary...`} />;
    if (!data || !data.length) return <Empty title={`No data for the last ${hours} hours`} sub="Data will appear once telemetry is collected." />;

    // Overall stats
    const stats = VITAL_KEYS.map(v => {
      const avgs = data.map((b: any) => b[`${v}_avg`]).filter((x: any) => x != null);
      const mins = data.map((b: any) => b[`${v}_min`]).filter((x: any) => x != null);
      const maxs = data.map((b: any) => b[`${v}_max`]).filter((x: any) => x != null);
      return {
        vital: v, label: VL[v], unit: VU[v],
        avg: avgs.length ? (avgs.reduce((a: number, b: number) => a + b, 0) / avgs.length).toFixed(1) : '--',
        min: mins.length ? Math.min(...mins).toFixed(1) : '--',
        max: maxs.length ? Math.max(...maxs).toFixed(1) : '--',
      };
    });

    // Comparative bar chart data
    const barData = stats.filter(s => s.avg !== '--').map(s => ({
      name: s.label, avg: parseFloat(s.avg as string), min: parseFloat(s.min as string), max: parseFloat(s.max as string), fill: VC[s.vital],
    }));

    return (
      <motion.div {...tabAnim}>
        <div className="history-section-title">{hours}-Hour Vitals Report</div>
        <div className="history-section-subtitle">{data.length} hourly data points · Last {hours} hours</div>

        {/* Summary Stats Table */}
        <div className="history-section-title" style={{ fontSize: 13 }}>Summary Statistics</div>
        <div className="data-table-wrap" style={{ marginBottom: 20 }}>
          <table className="data-table">
            <thead><tr><th>Vital</th><th>Average</th><th>Min</th><th>Max</th><th>Range</th><th>Unit</th></tr></thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.vital}>
                  <td className="val-cell" style={{ color: VC[s.vital] }}>{s.label}</td>
                  <td className="val-cell">{s.avg}</td>
                  <td>{s.min}</td>
                  <td>{s.max}</td>
                  <td className="dim-cell">{s.min !== '--' && s.max !== '--' ? (parseFloat(s.max as string) - parseFloat(s.min as string)).toFixed(1) : '--'}</td>
                  <td className="dim-cell">{s.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Comparative Bar Chart */}
        {barData.length > 0 && (
          <motion.div className="chart-panel" {...cardAnim}>
            <div className="chart-panel-header"><span className="chart-panel-title">Vital Averages Comparison</span></div>
            <div className="chart-panel-body" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis type="number" stroke="var(--ink-faint)" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} />
                  <YAxis type="category" dataKey="name" stroke="var(--ink-faint)" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} width={90} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="avg" isAnimationActive={false} name="Average">{barData.map((d, i) => <Cell key={i} fill={d.fill} opacity={0.8} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* Hourly Readings Table */}
        <div className="history-section-title" style={{ fontSize: 13, marginTop: 8 }}>Hourly Readings</div>
        <div className="data-table-wrap" style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 20 }}>
          <table className="data-table">
            <thead><tr><th>Hour</th>{VITAL_KEYS.map(v => <th key={v} style={{ color: VC[v] }}>{VL[v]}</th>)}<th>Samples</th></tr></thead>
            <tbody>
              {data.map((row: any, i: number) => (
                <tr key={i}>
                  <td className="val-cell">{fmtTime(row.bucket)}</td>
                  {VITAL_KEYS.map(v => <td key={v}>{row[`${v}_avg`] != null ? `${row[`${v}_avg`]}` : '--'}</td>)}
                  <td className="dim-cell">{row.sample_count || '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Physiological Stability Index (PSI) */}
        {(() => {
          const psiData = data.map((b: any) => {
            const hr = b.heart_rate_avg;
            const spo2 = b.spo2_avg;
            const temp = b.temperature_avg;
            const resp = b.respiratory_rate_avg;
            const sys = b.systolic_bp_avg;
            const dia = b.diastolic_bp_avg;

            let stress = 0;
            let count = 0;

            if (hr != null) { stress += Math.abs(hr - 75) / 75; count++; }
            if (spo2 != null) { stress += Math.max(0, 98 - spo2) / 98 * 4; count++; } // SpO2 drops are heavily weighted
            if (temp != null) { stress += Math.abs(temp - 98.6) / 98.6; count++; }
            if (resp != null) { stress += Math.abs(resp - 16) / 16; count++; }
            if (sys != null) { stress += Math.abs(sys - 120) / 120; count++; }
            if (dia != null) { stress += Math.abs(dia - 80) / 80; count++; }

            const avgDev = count > 0 ? stress / count : 0;
            let score = 100 - (avgDev * 400); 
            if (score < 0) score = 0;
            if (score > 100) score = 100;

            return {
              t: new Date(b.bucket).getTime(),
              score: count > 0 ? Math.round(score) : null
            };
          }).filter((x: any) => x.score != null);

          if (!psiData.length) return null;

          const latestScore = psiData[psiData.length - 1].score;
          let color = '#48e6a0'; 
          let label = 'Stable';
          if (latestScore < 70) { color = '#ff5d72'; label = 'Critical'; }
          else if (latestScore < 85) { color = '#ffb74a'; label = 'Warning'; }

          return (
            <>
              <div className="history-section-title" style={{ fontSize: 13, marginTop: 16 }}>Physiological Stability Trend</div>
              <motion.div className="chart-panel" {...cardAnim} style={{ marginBottom: 32 }}>
                <div className="chart-panel-header" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="chart-panel-title" style={{ fontSize: 14 }}>Stability Index (PSI)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{latestScore}</div>
                    <div className={`sev-glow-badge ${label.toLowerCase()}`} style={{ padding: '4px 8px', fontSize: 10 }}>
                      <div className="glow-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                      {label}
                    </div>
                  </div>
                </div>
                <div className="chart-panel-body" style={{ height: 260, padding: '24px 12px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={psiData}>
                      <defs>
                        <linearGradient id={`psi-grad-${hours}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                      <XAxis 
                        dataKey="t" 
                        type="number" 
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                        stroke="var(--ink-faint)" 
                        tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} 
                        minTickGap={60} 
                        axisLine={false}
                        tickLine={false}
                        dy={10}
                      />
                      <YAxis 
                        stroke="var(--ink-faint)" 
                        tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} 
                        domain={[(dataMin: number) => Math.max(0, Math.floor(dataMin - 10)), (dataMax: number) => Math.min(100, Math.ceil(dataMax + 10))]} 
                        width={36} 
                        axisLine={false}
                        tickLine={false}
                        dx={-10}
                      />
                      <Tooltip content={<Tip />} cursor={{ stroke: 'var(--line-soft)', strokeWidth: 2 }} />
                      <Area 
                        type="monotone" 
                        dataKey="score" 
                        stroke={color} 
                        strokeWidth={3} 
                        fill={`url(#psi-grad-${hours})`}
                        dot={{ r: 4, fill: 'var(--bg-panel)', stroke: color, strokeWidth: 2 }} 
                        activeDot={{ r: 6, fill: color, stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={false} 
                        name="Stability Score" 
                        connectNulls={false} 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </>
          );
        })()}
      </motion.div>
    );
  };

  // ═══════════════════════════════════════════════════
  // EXPLORER
  // ═══════════════════════════════════════════════════
  const renderExplorer = () => {
    const hS = new Date(`${exDate}T${exHour.toString().padStart(2, '0')}:00:00`).getTime();
    const hE = hS + 3600000;
    return (
      <motion.div {...tabAnim}>
        <div className="history-section-title">Vitals Explorer</div>
        <div className="history-section-subtitle">1-minute resolution · Select date and hour</div>
        <div className="history-controls">
          <div className="history-control-group"><label>Date</label><input type="date" value={exDate} onChange={e => setExDate(e.target.value)} max={new Date().toISOString().split('T')[0]} /></div>
          <div className="history-control-group"><label>Hour</label>
            <select value={exHour} onChange={e => setExHour(Number(e.target.value))}>
              {Array.from({ length: 24 }).map((_, i) => { const today = exDate === new Date().toISOString().split('T')[0]; if (today && i > new Date().getHours()) return null; return <option key={i} value={i}>{`${i.toString().padStart(2, '0')}:00 — ${((i + 1) % 24).toString().padStart(2, '0')}:00`}</option>; })}
            </select>
          </div>
        </div>
        <div className="vital-toggle-bar" style={{ marginBottom: 14 }}>
          {ALL_VITAL_KEYS.map(v => <button key={v} className={`vital-toggle-btn ${exVital === v ? 'active' : ''}`} onClick={() => setExVital(v)}>{VL[v]}</button>)}
        </div>
        {ldEx ? <Loading msg="Fetching data..." /> : exData.length === 0 ? <Empty title="No data for this hour" sub="Try a different date or hour." /> : (
          <motion.div className="chart-panel" {...cardAnim}>
            <div className="chart-panel-header"><span className="chart-panel-title" style={{ color: VC[exVital] }}>{VL[exVital]}</span><span style={{ color: 'var(--ink-faint)' }}>{exData.length} points</span></div>
            <div className="chart-panel-body" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={exData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="ts" type="number" domain={[hS, hE]} tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} stroke="var(--ink-faint)" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} />
                  <YAxis stroke="var(--ink-faint)" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} domain={['auto', 'auto']} width={38} />
                  <Tooltip content={<Tip />} />
                  <Line type="monotone" dataKey={exVital} stroke={VC[exVital]} strokeWidth={2} dot={{ r: 2, fill: VC[exVital] }} isAnimationActive={false} connectNulls={false} name={`${VL[exVital]} (${VU[exVital]})`} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </motion.div>
    );
  };

  // ═══════════════════════════════════════════════════
  // ALERTS — grouped + pie + bar
  // ═══════════════════════════════════════════════════
  const renderAlerts = () => {
    if (ldAlt && !alerts) return <Loading msg="Loading alerts..." />;
    const vitalTypes = [...new Set(alerts?.map(a => a.vital_type) ?? [])];

    return (
      <motion.div {...tabAnim}>
        <div className="history-section-title">Alerts History</div>

        {/* Stats */}
        {alertSt && (
          <div className="alert-stats-grid">
            <motion.div className="alert-stat-card" {...cardAnim}><div className="asc-value">{alertSt.total}</div><div className="asc-label">Total (24h)</div></motion.div>
            <motion.div className="alert-stat-card" {...cardAnim}><div className="asc-value" style={{ color: '#ff5d72' }}>{alertSt.by_severity?.critical || 0}</div><div className="asc-label">Critical</div></motion.div>
            <motion.div className="alert-stat-card" {...cardAnim}><div className="asc-value" style={{ color: '#ffb74a' }}>{alertSt.by_severity?.warning || 0}</div><div className="asc-label">Warning</div></motion.div>
          </div>
        )}

        {/* Charts row — timeline bar + pie */}
        <div className="charts-row">
          {alertTLChart.length > 0 && (
            <motion.div className="chart-panel" {...cardAnim}>
              <div className="chart-panel-header"><span className="chart-panel-title">Alert Frequency</span><span style={{ color: 'var(--ink-faint)' }}>Per hour</span></div>
              <div className="chart-panel-body" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alertTLChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="ts" type="number" tickFormatter={t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} stroke="var(--ink-faint)" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} />
                    <YAxis stroke="var(--ink-faint)" tick={{ fontSize: 10, fill: 'var(--ink-faint)' }} allowDecimals={false} width={28} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="total" fill="#ff5d72" opacity={0.75} isAnimationActive={false} name="Alerts" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
          {alertPieData.length > 0 && (
            <motion.div className="chart-panel" {...cardAnim}>
              <div className="chart-panel-header"><span className="chart-panel-title">Distribution by Vital</span></div>
              <div className="chart-panel-body" style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={alertPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={2} dataKey="value" isAnimationActive={false} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} style={{ fontSize: 9 }}>
                    {alertPieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie></PieChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </div>

        {/* Filters */}
        <div className="filter-chips">
          <button className={`filter-chip ${sevFilter === 'all' ? 'active' : ''}`} onClick={() => setSevFilter('all')}>All</button>
          <button className={`filter-chip ${sevFilter === 'critical' ? 'critical-active' : ''}`} onClick={() => setSevFilter('critical')}>Critical</button>
          <button className={`filter-chip ${sevFilter === 'warning' ? 'warning-active' : ''}`} onClick={() => setSevFilter('warning')}>Warning</button>
          <span style={{ width: 1, height: 18, background: 'var(--line)', margin: '0 4px' }} />
          <button className={`filter-chip ${vitFilter === 'all' ? 'active' : ''}`} onClick={() => setVitFilter('all')}>All Vitals</button>
          {vitalTypes.map(v => <button key={v} className={`filter-chip ${vitFilter === v ? 'active' : ''}`} onClick={() => setVitFilter(v)}>{VL[v] || v}</button>)}
        </div>

        {/* Grouped Alert List (Glassmorphic Expanding Cards) */}
        {groupedAlerts.length === 0 ? <Empty title="No alerts found" sub="Adjust filters or check back later." /> : (
          <div className="alerts-list">
            {groupedAlerts.map((g, i) => {
              const isExpanded = expandedAlert === i;
              const color = VC[g.vital_type] || 'var(--ink)';
              
              return (
                <motion.div 
                  key={i} 
                  className="alert-group-card"
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: Math.min(i * 0.05, 0.4) }}
                >
                  <div className="alert-group-header" onClick={() => setExpandedAlert(isExpanded ? null : i)}>
                    <div className="alert-group-left">
                      <div className="alert-time-col">
                        <span className="alert-time-main">{fmtTime(g.start_at)}</span>
                        {g.count > 1 && <span className="alert-time-sub">to {fmtTime(g.end_at)}</span>}
                      </div>
                      <div className="sev-glow-badge 1 severity-badge" className={`sev-glow-badge ${g.severity}`}>
                        <div className="glow-dot" />
                        {g.severity}
                      </div>
                      <div className="alert-vital-col">
                        <span className="alert-vital-name" style={{ color }}>{VL[g.vital_type] || g.vital_type}</span>
                        <span className="alert-vital-msg">{g.message}</span>
                      </div>
                    </div>
                    
                    <div className="alert-group-right">
                      {g.count > 1 ? (
                        <div className="alert-count-badge">×{g.count} Events</div>
                      ) : (
                        <div className="alert-count-badge" style={{ background: 'transparent' }}>
                          Value: {g.value}
                        </div>
                      )}
                      <svg className={`expand-icon ${isExpanded ? 'expanded' : ''}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </div>
                  
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="alert-group-expanded">
                          <div className="alert-sparkline-wrap">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={g.points}>
                                <CartesianGrid strokeDasharray="2 2" stroke="var(--line-soft)" vertical={false} />
                                <XAxis dataKey="time" hide domain={['dataMin', 'dataMax']} type="number" />
                                <YAxis domain={['auto', 'auto']} hide />
                                <Tooltip content={<Tip />} cursor={{ stroke: 'var(--ink-faint)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Line type="stepAfter" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color, stroke: 'var(--bg-app)' }} isAnimationActive={true} name={VL[g.vital_type]} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          
                          <div className="alert-details-wrap">
                            <div className="detail-row">
                              <span className="detail-label">Status</span>
                              <span className="detail-val" style={{ color: g.severity === 'critical' ? 'var(--red)' : 'var(--amber)' }}>{g.severity.toUpperCase()}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Range Triggered</span>
                              <span className="detail-val">{g.count === 1 ? g.value : `${Math.min(...g.values)} — ${Math.max(...g.values)}`}</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Duration</span>
                              <span className="detail-val">{Math.round((new Date(g.end_at).getTime() - new Date(g.start_at).getTime()) / 60000)} mins</span>
                            </div>
                            <div className="detail-row">
                              <span className="detail-label">Patient ID</span>
                              <span className="detail-val" style={{ fontSize: 10 }}>{g.patient_id}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    );
  };

  // ═══════════════════════════════════════════════════
  // CLINICAL
  // ═══════════════════════════════════════════════════
  const renderClinical = () => {
    if (ldCli && !conditions) return <Loading msg="Loading Cerner records..." />;
    return (
      <motion.div {...tabAnim}>
        <div className="history-section-title">Clinical Records (Cerner EHR)</div>
        <div className="history-section-subtitle">Data sourced via Cerner FHIR R4 system integration</div>

        {/* Encounters */}
        {cernerDet?.encounters?.length > 0 && (
          <motion.div className="chart-panel" style={{ marginBottom: 16 }} {...cardAnim}>
            <div className="chart-panel-header"><span className="chart-panel-title">Encounters</span><span style={{ color: 'var(--ink-faint)' }}>{cernerDet.encounters.length}</span></div>
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {cernerDet.encounters.map((enc: any, i: number) => (
                <div key={enc.id || i} className="clinical-item">
                  <div className={`clinical-item-dot ${enc.status === 'in-progress' ? 'active' : 'inactive'}`} />
                  <div className="clinical-item-info">
                    <div className="clinical-item-name">{enc.type || 'Encounter'}</div>
                    <div className="clinical-item-detail">{enc.start ? new Date(enc.start).toLocaleDateString() : ''}{enc.class ? ` · ${enc.class}` : ''}</div>
                  </div>
                  <span className={`clinical-item-tag ${enc.status === 'in-progress' ? 'status-active' : enc.status === 'finished' ? 'status-completed' : 'status-other'}`}>{enc.status}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <div className="clinical-grid">
          {/* Conditions */}
          <motion.div className="clinical-panel" {...cardAnim}>
            <div className="clinical-panel-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>Conditions<span className="clinical-panel-count">{conditions?.length || 0}</span></div>
            <div className="clinical-panel-body">
              {!conditions?.length ? <Empty title="No conditions" /> : conditions.map((c: any, i: number) => (
                <div key={c.id || i} className="clinical-item"><div className={`clinical-item-dot ${c.clinical_status === 'active' ? 'active' : 'inactive'}`} /><div className="clinical-item-info"><div className="clinical-item-name">{c.name}</div><div className="clinical-item-detail">{c.onset ? `Onset: ${new Date(c.onset).toLocaleDateString()}` : ''}{c.category ? ` · ${c.category}` : ''}</div></div><span className={`clinical-item-tag ${c.clinical_status === 'active' ? 'status-active' : 'status-other'}`}>{c.clinical_status || '?'}</span></div>
              ))}
            </div>
          </motion.div>
          {/* Medications */}
          <motion.div className="clinical-panel" {...cardAnim}>
            <div className="clinical-panel-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>Medications<span className="clinical-panel-count">{medications?.length || 0}</span></div>
            <div className="clinical-panel-body">
              {!medications?.length ? <Empty title="No medications" /> : medications.map((m: any, i: number) => (
                <div key={m.id || i} className="clinical-item"><div className={`clinical-item-dot ${m.status === 'active' ? 'active' : 'inactive'}`} /><div className="clinical-item-info"><div className="clinical-item-name">{m.name}</div><div className="clinical-item-detail">{m.dosage || 'No dosage info'}{m.authored_on ? ` · ${new Date(m.authored_on).toLocaleDateString()}` : ''}</div></div><span className={`clinical-item-tag ${m.status === 'active' ? 'status-active' : 'status-other'}`}>{m.status || '?'}</span></div>
              ))}
            </div>
          </motion.div>
          {/* Allergies */}
          <motion.div className="clinical-panel" {...cardAnim}>
            <div className="clinical-panel-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>Allergies<span className="clinical-panel-count">{allergies?.length || 0}</span></div>
            <div className="clinical-panel-body">
              {!allergies?.length ? <Empty title="No allergies recorded" /> : allergies.map((a: any, i: number) => (
                <div key={a.id || i} className="clinical-item"><div className={`clinical-item-dot ${a.criticality === 'high' ? 'high' : a.criticality === 'low' ? 'low' : 'inactive'}`} /><div className="clinical-item-info"><div className="clinical-item-name">{a.name}</div><div className="clinical-item-detail">{a.reactions?.length ? `Reactions: ${a.reactions.join('; ')}` : 'No details'}{a.type ? ` · ${a.type}` : ''}</div></div>{a.criticality && <span className="clinical-item-tag" style={a.criticality === 'high' ? { background: 'var(--red-dim)', color: 'var(--red)' } : {}}>{a.criticality}</span>}</div>
              ))}
            </div>
          </motion.div>
          {/* Labs */}
          <motion.div className="clinical-panel" {...cardAnim}>
            <div className="clinical-panel-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>Lab Reports<span className="clinical-panel-count">{labs?.length || 0}</span></div>
            <div className="clinical-panel-body">
              {!labs?.length ? <Empty title="No lab reports" /> : labs.map((l: any, i: number) => (
                <div key={l.id || i} className="clinical-item"><div className={`clinical-item-dot ${l.status === 'final' ? 'active' : 'inactive'}`} /><div className="clinical-item-info"><div className="clinical-item-name">{l.name}</div><div className="clinical-item-detail">{l.effective_date ? new Date(l.effective_date).toLocaleDateString() : l.issued ? new Date(l.issued).toLocaleDateString() : ''}{l.conclusion ? ` · ${l.conclusion}` : ''}</div></div><span className={`clinical-item-tag ${l.status === 'final' ? 'status-completed' : 'status-other'}`}>{l.status || '?'}</span></div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    );
  };

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <div className="history-page">
      <div className="history-topbar">
        <button className="history-back-btn" onClick={() => navigate(`/patient/${id}`)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Back to Monitor
        </button>
        <div className="history-patient-info">
          <h1>{patient?.name || 'Loading...'}</h1>
          <span className="history-patient-meta">{patient?.age}y · {patient?.condition} · CERNER {id}</span>
        </div>
      </div>

      <div className="history-layout">
        <nav className="history-ribbon">
          <div className="ribbon-section-label">Analytics</div>
          {tabs.slice(0, 4).map(t => (
            <motion.div key={t.key} className={`ribbon-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
              {t.icon}{t.label}{t.badge != null && t.badge > 0 && <span className="ribbon-badge">{t.badge}</span>}
            </motion.div>
          ))}
          <div className="ribbon-section-label">Records</div>
          {tabs.slice(4).map(t => (
            <motion.div key={t.key} className={`ribbon-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)} whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
              {t.icon}{t.label}{t.badge != null && t.badge > 0 && <span className="ribbon-badge">{t.badge}</span>}
            </motion.div>
          ))}
        </nav>

        <div className="history-content">
          <AnimatePresence mode="wait">
            {tab === 'overview' && <motion.div key="ov">{renderOverview()}</motion.div>}
            {tab === '24h' && <motion.div key="24">{renderSummary(24)}</motion.div>}
            {tab === '12h' && <motion.div key="12">{renderSummary(12)}</motion.div>}
            {tab === 'explorer' && <motion.div key="ex">{renderExplorer()}</motion.div>}
            {tab === 'alerts' && <motion.div key="al">{renderAlerts()}</motion.div>}
            {tab === 'clinical' && <motion.div key="cl">{renderClinical()}</motion.div>}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

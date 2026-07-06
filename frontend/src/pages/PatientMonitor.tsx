import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAppStore } from '../store/vitalsStore';
import { fetchPatientVitals } from '../api';
import { isPatientActive } from '../types';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import EcgWaveform from '../components/EcgWaveform';
import '../components/EcgWaveform.css';
import HistoryModal from '../components/HistoryModal';
import ThresholdsModal from '../components/ThresholdsModal';
import CopyButton from '../components/CopyButton';

type VitalKey = 'heart_rate' | 'spo2' | 'temperature' | 'respiratory_rate' | 'blood_pressure';

export default function PatientMonitor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { patients, alerts } = useWebSocket();
  const [activeTab, setActiveTab] = useState<'vitals' | 'ecg' | 'ai'>('vitals');

  const [selectedVital, setSelectedVital] = useState<VitalKey>('heart_rate');
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [isEcgExpanded, setIsEcgExpanded] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'5' | '15' | '30' | '60' | 'manual'>('5');
  const [manualMinutes, setManualMinutes] = useState<number | ''>('');

  const patient = id ? patients[id] : null;
  const vitalsHistoryRaw = useAppStore(state => state.vitalsHistory[id || '']);
  const vitalsHistory = vitalsHistoryRaw || [];
  const storeEcg = useAppStore(state => state.latestEcg[id || '']);
  const ecg = storeEcg || patient?.ecg;
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [loadTime] = useState<number>(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (id) {
      fetchPatientVitals(id, 60).then(data => {
        setHistoricalData(data.map((v: any) => ({
          ...v,
          timestampMs: new Date(v.recorded_at).getTime()
        })));
      }).catch(err => console.error("Failed to fetch history:", err));
    }
  }, [id]);

  if (!patient) {
    return (
      <div className="content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--ink-dim)' }}>Patient not found or loading...</h2>
        <button className="ghost-btn" onClick={() => navigate('/')} style={{ marginTop: '20px' }}>Return to Floor</button>
      </div>
    );
  }

  if (!isPatientActive(patient, now)) {
    return (
      <div className="content">
        <div className="identity">
          <div>
            <h1 style={{ display: 'inline' }}>{patient.name}</h1>
            <span className="meta" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <span>{patient.age}y &middot; {patient.condition} &middot; CERNER {patient.id}</span>
              <CopyButton text={patient.id} />
            </span>
          </div>
          <div className="id-actions">
            <button className="ghost-btn icon-only" title="Settings" onClick={() => setShowSettings(true)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '50vh' }}>
          <h2 style={{ color: 'var(--ink-dim)' }}>No Data being transmitted at the moment</h2>
          <button className="ghost-btn" onClick={() => navigate('/')} style={{ marginTop: '20px' }}>Return to Floor</button>
        </div>
      </div>
    );
  }

  // Merge history with live
  const liveData = vitalsHistory.map(v => ({
    ...v,
    timestampMs: new Date(v.recorded_at).getTime()
  }));

  // Simple merge
  const allData = [...historicalData];
  const lastHistoryTime = allData.length > 0 ? allData[allData.length - 1].timestampMs : 0;
  for (const lv of liveData) {
    if (lv.timestampMs > lastHistoryTime) {
      allData.push(lv);
    }
  }

  // Filter based on selected time limit (sliding window: always the trailing
  // N minutes, shifting forward as new data arrives).
  // Point cap is sized for 60 min of live data at a ~2s update rate (~1800
  // points); the old 500 cap was tighter than that, so at higher zoom levels
  // it clipped old points before the selected window was reached -
  // reintroducing the "old data disappears" bug at a higher point count.
  const MAX_CHART_POINTS = 2000;
  const latestTimestamp = allData.length > 0 ? allData[allData.length - 1].timestampMs : Date.now();
  let filterMinutes = 60;
  if (timeFilter === 'manual') {
    filterMinutes = typeof manualMinutes === 'number' && manualMinutes > 0 ? manualMinutes : 60;
  } else {
    filterMinutes = parseInt(timeFilter, 10);
  }
  const filterMs = filterMinutes * 60 * 1000;
  const cutoff = latestTimestamp - filterMs;

  let startIndex = 0;
  while (startIndex < allData.length && allData[startIndex].timestampMs < cutoff) {
    startIndex++;
  }
  const filteredData = allData.slice(startIndex).slice(-MAX_CHART_POINTS);

  // Insert null-value break points (1m for DB history, 10s for live data)
  const baseChartData: any[] = [];
  for (let i = 0; i < filteredData.length; i++) {
    if (i > 0) {
      const gap = filteredData[i].timestampMs - filteredData[i - 1].timestampMs;
      const isHistorical = filteredData[i - 1].timestampMs <= loadTime;
      const gapLimit = isHistorical ? 60000 : 10000;
      if (gap > gapLimit) {
        baseChartData.push({
          timestampMs: filteredData[i - 1].timestampMs + 1000,
          heart_rate: null, spo2: null, temperature: null,
          respiratory_rate: null, systolic_bp: null, diastolic_bp: null,
        });
      }
    }
    baseChartData.push(filteredData[i]);
  }

  const chartData = baseChartData.map((d, index) => {
    const isHistorical = d.timestampMs <= loadTime;
    const nextIsLive = index < baseChartData.length - 1 && baseChartData[index + 1].timestampMs > loadTime;

    const mapped = { ...d };
    
    // Map all vitals for both historical and live rendering
    ['heart_rate', 'spo2', 'temperature', 'respiratory_rate'].forEach(key => {
      mapped[`${key}_historical`] = isHistorical ? d[key] : null;
      mapped[`${key}_live`] = (!isHistorical || nextIsLive) ? d[key] : null;
    });

    // Special case for blood pressure
    mapped.systolic_bp_historical = isHistorical ? d.systolic_bp : null;
    mapped.systolic_bp_live = (!isHistorical || nextIsLive) ? d.systolic_bp : null;
    mapped.diastolic_bp_historical = isHistorical ? d.diastolic_bp : null;
    mapped.diastolic_bp_live = (!isHistorical || nextIsLive) ? d.diastolic_bp : null;

    return mapped;
  });

  // X-axis domain: exactly the selected time window
  const xMax = latestTimestamp;
  const xMin = xMax - filterMs;

  const getLineColor = (key: string) => {
    switch (key) {
      case 'heart_rate': return 'var(--amber)';
      case 'spo2': return 'var(--blue)';
      case 'temperature': return 'var(--green)';
      case 'respiratory_rate': return 'var(--purple, #a855f7)';
      case 'blood_pressure': return 'var(--red)';
      default: return 'var(--accent)';
    }
  };

  // Dynamic Y-axis scaling: use standard clinical ranges as defaults,
  // but expand if real data exceeds those bounds.
  const getYAxisDomain = (): [number | string, number | string] => {
    const defaults: Record<string, [number, number]> = {
      heart_rate: [70, 120],
      spo2: [90, 100],
      temperature: [96.0, 101.0],
      respiratory_rate: [10, 25],
      blood_pressure: [60, 160],
    };
    const [defaultMin, defaultMax] = defaults[selectedVital] || [0, 200];
    const activeValues: number[] = [];
    chartData.forEach((d: any) => {
      if (selectedVital === 'blood_pressure') {
        if (typeof d.systolic_bp === 'number') activeValues.push(d.systolic_bp);
        if (typeof d.diastolic_bp === 'number') activeValues.push(d.diastolic_bp);
      } else {
        const val = d[selectedVital];
        if (typeof val === 'number') activeValues.push(val);
      }
    });
    if (activeValues.length === 0) return [defaultMin, defaultMax];
    const dataMin = Math.min(...activeValues);
    const dataMax = Math.max(...activeValues);
    let finalMin = dataMin < defaultMin ? Math.floor(dataMin - 5) : defaultMin;
    let finalMax = dataMax > defaultMax ? Math.ceil(dataMax + 5) : defaultMax;
    if (selectedVital === 'spo2') finalMax = Math.min(finalMax, 100);
    return [finalMin, finalMax];
  };

  const getStats = () => {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;

    let sysMin = Infinity, sysMax = -Infinity, sysSum = 0, sysCount = 0;
    let diaMin = Infinity, diaMax = -Infinity, diaSum = 0, diaCount = 0;

    chartData.forEach((d: any) => {
      if (selectedVital === 'blood_pressure') {
        const sys = d.systolic_bp_live ?? d.systolic_bp_historical;
        const dia = d.diastolic_bp_live ?? d.diastolic_bp_historical;

        if (typeof sys === 'number') {
          sysMin = Math.min(sysMin, sys);
          sysMax = Math.max(sysMax, sys);
          sysSum += sys;
          sysCount++;
        }
        if (typeof dia === 'number') {
          diaMin = Math.min(diaMin, dia);
          diaMax = Math.max(diaMax, dia);
          diaSum += dia;
          diaCount++;
        }
      } else {
        const val = d[`${selectedVital}_live`] ?? d[`${selectedVital}_historical`];
        if (typeof val === 'number') {
          min = Math.min(min, val);
          max = Math.max(max, val);
          sum += val;
          count++;
        }
      }
    });

    if (selectedVital === 'blood_pressure') {
      if (sysCount === 0 || diaCount === 0) return { min: '--', max: '--', avg: '--' };
      const avgSys = Math.round(sysSum / sysCount);
      const avgDia = Math.round(diaSum / diaCount);
      return {
        min: `${sysMin}/${diaMin}`,
        max: `${sysMax}/${diaMax}`,
        avg: `${avgSys}/${avgDia}`
      };
    } else {
      if (count === 0) return { min: '--', max: '--', avg: '--' };
      const avg = (sum / count).toFixed(1);
      return {
        min: min.toFixed(1),
        max: max.toFixed(1),
        avg
      };
    }
  };

  const stats = getStats();

  const vitalLabels: Record<VitalKey, string> = {
    'heart_rate': 'Heart Rate',
    'spo2': 'SpO2',
    'temperature': 'Temperature',
    'respiratory_rate': 'Respiratory Rate',
    'blood_pressure': 'Blood Pressure'
  };

  const getVitalAlertSeverity = (vitalKey: string): string | null => {
    if (!patient) return null;
    const alert = alerts.find(a => a.patient_id === patient.id && 
      (a.vital_type === vitalKey || (vitalKey === 'blood_pressure' && a.vital_type.endsWith('bp')))
    );
    return alert ? alert.severity : null;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', padding: '10px', borderRadius: '4px' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)' }}>
            {new Date(label).toLocaleTimeString()}
          </p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ margin: 0, color: entry.color, fontWeight: 'bold' }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderVitalChart = () => {
    if (chartData.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: 'var(--ink-dim)', fontSize: '18px', fontFamily: 'var(--font-mono)' }}>
          No Data being transmitted at the moment
        </div>
      );
    }

    return (
      <div style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis
              dataKey="timestampMs"
              type="number"
              domain={[xMin, xMax]}
              tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              stroke="var(--ink-dim)"
              tick={{ fontSize: 11, fill: 'var(--ink-dim)' }}
              minTickGap={100}
            />
            <YAxis
              stroke="var(--ink-dim)"
              tick={{ fontSize: 11, fill: 'var(--ink-dim)' }}
              domain={getYAxisDomain()}
              allowDataOverflow={true}
            />
            <RechartsTooltip content={<CustomTooltip />} />

            {selectedVital === 'blood_pressure' ? (
              <>
                {/* Historical (Dashed) */}
                <Line type="monotone" dataKey="systolic_bp_historical" stroke="var(--red)" strokeDasharray="5 5" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} name="Systolic (History)" />
                <Line type="monotone" dataKey="diastolic_bp_historical" stroke="var(--blue)" strokeDasharray="5 5" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} name="Diastolic (History)" />
                {/* Live (Solid) */}
                <Line type="monotone" dataKey="systolic_bp_live" stroke="var(--red)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} name="Systolic" />
                <Line type="monotone" dataKey="diastolic_bp_live" stroke="var(--blue)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} name="Diastolic" />
              </>
            ) : (
              <>
                {/* Historical (Dashed) */}
                <Line
                  type="monotone"
                  dataKey={`${selectedVital}_historical`}
                  stroke={getLineColor(selectedVital)}
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                  name={`${vitalLabels[selectedVital]} (History)`}
                />
                {/* Live (Solid) */}
                <Line
                  type="monotone"
                  dataKey={`${selectedVital}_live`}
                  stroke={getLineColor(selectedVital)}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                  name={vitalLabels[selectedVital]}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="content">
      <div className="segnav">
        <div className={`seg ${activeTab === 'vitals' ? 'active' : ''}`} onClick={() => setActiveTab('vitals')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M2 12h4l2-7 4 14 3-9 2 4h5" /></svg>
          Vitals
        </div>
        <div className={`seg ${activeTab === 'ecg' ? 'active' : ''}`} onClick={() => setActiveTab('ecg')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><rect x="3" y="4" width="18" height="13" rx="1" /><path d="M8 21h8M12 17v4" /></svg>
          ECG Monitor
        </div>
        {/*<div className={`seg ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
          AI Insights
        </div>*/}
      </div>

      <div className="identity">
        <div>
          <h1 style={{ display: 'inline' }}>{patient.name}</h1>
          <span className="meta" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span>{patient.age}y &middot; {patient.condition} &middot; CERNER {patient.id}</span>
            <CopyButton text={patient.id} />
          </span>
        </div>
        <div className="id-actions">
          <button className="ghost-btn" onClick={() => setShowHistory(true)}>View History</button>
          <button className="ghost-btn icon-only" title="Settings" onClick={() => setShowSettings(true)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
          </button>
        </div>
      </div>

      {activeTab === 'vitals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1 }}>
          <div className="vstrip">
            <div className={`vcell ${selectedVital === 'heart_rate' ? 'sel' : ''} ${getVitalAlertSeverity('heart_rate') ? 'glow-' + getVitalAlertSeverity('heart_rate') : ''}`} onClick={() => setSelectedVital('heart_rate')}>
              <div className="tag">HR</div><div className="label">Heart Rate</div><div className="num">{patient.heart_rate ?? '--'}</div><div className="unit">bpm</div><div className="ind" style={{ background: 'var(--amber)' }}></div>
            </div>
            <div className={`vcell ${selectedVital === 'spo2' ? 'sel' : ''} ${getVitalAlertSeverity('spo2') ? 'glow-' + getVitalAlertSeverity('spo2') : ''}`} onClick={() => setSelectedVital('spo2')}>
              <div className="tag">O2</div><div className="label">SpO₂</div><div className="num">{patient.spo2 ?? '--'}</div><div className="unit">%</div><div className="ind" style={{ background: 'var(--blue)' }}></div>
            </div>
            <div className={`vcell ${selectedVital === 'temperature' ? 'sel' : ''} ${getVitalAlertSeverity('temperature') ? 'glow-' + getVitalAlertSeverity('temperature') : ''}`} onClick={() => setSelectedVital('temperature')}>
              <div className="tag">TMP</div><div className="label">Temperature</div><div className="num">{patient.temperature ?? '--'}</div><div className="unit">&deg;F</div><div className="ind" style={{ background: 'var(--green)' }}></div>
            </div>
            <div className={`vcell ${selectedVital === 'respiratory_rate' ? 'sel' : ''} ${getVitalAlertSeverity('respiratory_rate') ? 'glow-' + getVitalAlertSeverity('respiratory_rate') : ''}`} onClick={() => setSelectedVital('respiratory_rate')}>
              <div className="tag">RR</div><div className="label">Resp. Rate</div><div className="num">{patient.respiratory_rate ?? '--'}</div><div className="unit">br/min</div><div className="ind" style={{ background: 'var(--purple, #a855f7)' }}></div>
            </div>
            <div className={`vcell ${selectedVital === 'blood_pressure' ? 'sel' : ''} ${getVitalAlertSeverity('blood_pressure') ? 'glow-' + getVitalAlertSeverity('blood_pressure') : ''}`} onClick={() => setSelectedVital('blood_pressure')}>
              <div className="tag">BP</div><div className="label">Blood Pressure</div><div className="num">{patient.systolic_bp ?? '--'}/{patient.diastolic_bp ?? '--'}</div><div className="unit">mmHg</div><div className="ind" style={{ background: 'var(--red)' }}></div>
            </div>
          </div>

          <div className={isGraphExpanded ? "scope-panel-fullscreen" : "scope-panel"}>
            <div className="scope-meta" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ color: getLineColor(selectedVital) }}>{vitalLabels[selectedVital].toUpperCase()} CHART LOGGING LIVE DATA</span>
                <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--ink-dim)', fontFamily: 'var(--font-mono)' }}>
                  <span>Min: <strong style={{ color: 'var(--ink)' }}>{stats.min}</strong></span>
                  <span>Avg: <strong style={{ color: 'var(--ink)' }}>{stats.avg}</strong></span>
                  <span>Max: <strong style={{ color: 'var(--ink)' }}>{stats.max}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                <div style={{ display: 'flex', gap: '4px', marginRight: '16px', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--ink-dim)' }}>TIME:</span>
                  {['5', '15', '30', '60'].map(t => (
                    <button
                      key={t}
                      className="ghost-btn"
                      style={{ padding: '2px 6px', fontSize: '10px', background: timeFilter === t ? 'var(--line)' : 'transparent' }}
                      onClick={() => setTimeFilter(t as any)}
                    >
                      {t}m
                    </button>
                  ))}
                  <button
                    className="ghost-btn"
                    style={{ padding: '2px 6px', fontSize: '10px', background: timeFilter === 'manual' ? 'var(--line)' : 'transparent' }}
                    onClick={() => setTimeFilter('manual')}
                  >
                    Custom
                  </button>
                  {timeFilter === 'manual' && (
                    <input
                      type="number"
                      placeholder="Min"
                      value={manualMinutes}
                      onChange={(e) => setManualMinutes(e.target.value === '' ? '' : Number(e.target.value))}
                      style={{ width: '40px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', marginLeft: '4px' }}
                    />
                  )}
                </div>
              </div>

              <button className="ghost-btn" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setIsGraphExpanded(!isGraphExpanded)}>
                {isGraphExpanded ? "CLOSE FULLSCREEN" : "EXPAND"}
              </button>
            </div>
            <div className="scope" style={{ display: 'flex', height: isGraphExpanded ? 'calc(100% - 40px)' : '300px' }}>
              {renderVitalChart()}
            </div>
          </div>

          {/* Composite Chart for HR, SpO2, and BP */}
          {!isGraphExpanded && (
            <div className="scope-panel" style={{ marginTop: '10px' }}>
              <div className="scope-meta" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ color: 'var(--ink)' }}>PATIENT HISTORY: LONGITUDINAL ANALYSIS</span>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--ink-dim)', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: getLineColor('heart_rate') }}>● Heart Rate</span>
                    <span style={{ color: getLineColor('spo2') }}>● SpO₂</span>
                    <span style={{ color: getLineColor('blood_pressure') }}>● Systolic BP</span>
                  </div>
                </div>
              </div>
              <div className="scope" style={{ display: 'flex', height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getLineColor('heart_rate')} stopOpacity={0.1}/>
                        <stop offset="95%" stopColor={getLineColor('heart_rate')} stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorSpo2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getLineColor('spo2')} stopOpacity={0.1}/>
                        <stop offset="95%" stopColor={getLineColor('spo2')} stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorBp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={getLineColor('blood_pressure')} stopOpacity={0.1}/>
                        <stop offset="95%" stopColor={getLineColor('blood_pressure')} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis
                      dataKey="timestampMs"
                      type="number"
                      domain={[xMin, xMax]}
                      tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      stroke="var(--ink-dim)"
                      tick={{ fontSize: 11, fill: 'var(--ink-dim)' }}
                      minTickGap={100}
                    />
                    <YAxis
                      stroke="var(--ink-dim)"
                      tick={{ fontSize: 11, fill: 'var(--ink-dim)' }}
                      domain={[0, 200]}
                      allowDataOverflow={true}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    
                    {/* Live data areas */}
                    <Area type="monotone" dataKey="heart_rate_live" stroke={getLineColor('heart_rate')} strokeWidth={2} fillOpacity={1} fill="url(#colorHr)" connectNulls={true} isAnimationActive={false} />
                    <Area type="monotone" dataKey="spo2_live" stroke={getLineColor('spo2')} strokeWidth={2} fillOpacity={1} fill="url(#colorSpo2)" connectNulls={true} isAnimationActive={false} />
                    <Area type="monotone" dataKey="systolic_bp_live" stroke={getLineColor('blood_pressure')} strokeWidth={2} fillOpacity={1} fill="url(#colorBp)" connectNulls={true} isAnimationActive={false} />
                    
                    {/* Historical data areas (dashed borders, no fill or light fill) */}
                    <Area type="monotone" dataKey="heart_rate_historical" stroke={getLineColor('heart_rate')} strokeWidth={2} strokeDasharray="5 5" fill="none" connectNulls={true} isAnimationActive={false} />
                    <Area type="monotone" dataKey="spo2_historical" stroke={getLineColor('spo2')} strokeWidth={2} strokeDasharray="5 5" fill="none" connectNulls={true} isAnimationActive={false} />
                    <Area type="monotone" dataKey="systolic_bp_historical" stroke={getLineColor('blood_pressure')} strokeWidth={2} strokeDasharray="5 5" fill="none" connectNulls={true} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'ecg' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
          <div className={isEcgExpanded ? "ecg-grid-layout-fullscreen" : "ecg-grid-layout"}>
            <div className="ecg-stats-col">
              <div className="ecg-stat-row"><div className="l">Rhythm</div><div className="v rhythm">{ecg?.rhythm || 'Normal Sinus Rhythm'}</div></div>
              <div className="ecg-stat-row"><div className="l">PR Interval</div><div className="v">{ecg?.pr_interval || '--'} <span className="u">ms</span></div></div>
              <div className="ecg-stat-row"><div className="l">QRS Duration</div><div className="v">{ecg?.qrs_duration || '--'} <span className="u">ms</span></div></div>
              <div className="ecg-stat-row"><div className="l">QT Interval</div><div className="v">{ecg?.qt_interval || '--'} <span className="u">ms</span></div></div>
              <div className="ecg-stat-row" style={{ display: 'flex', justifyContent: 'center', paddingTop: '20px', paddingBottom: '20px' }}>
                <button className="ghost-btn" style={{ padding: '4px 8px', fontSize: '10px', width: '100%', justifyContent: 'center' }} onClick={() => setIsEcgExpanded(!isEcgExpanded)}>
                  {isEcgExpanded ? "CLOSE FULLSCREEN" : "EXPAND"}
                </button>
              </div>
            </div>
            <div className="ecg-traces" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

              <div className="trace-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '280px' }}>
                <EcgWaveform ecg={ecg as any} patient={patient} waveType="ecg" lead="II" />
              </div>

              <div className="trace-row2">
                <div className="trace-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <EcgWaveform ecg={ecg as any} patient={patient} waveType="pleth" />
                </div>
                <div className="trace-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <EcgWaveform ecg={ecg as any} patient={patient} waveType="resp" />
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginTop: '10px' }}>
          <div className="terminal">
            <div className="tline">$ rpm-ai --patient {patient.id}</div>
            <div className="tline">&gt; initializing model context...</div>
            <div className="tline">&gt; awaiting telemetry...</div>
            <div className="tline"><b>READY</b> <span className="cursor"></span></div>
          </div>
        </div>
      )}

      {showHistory && (
        <HistoryModal
          patient={patient}
          selectedVital={selectedVital || "heart_rate"}
          onClose={() => setShowHistory(false)}
        />
      )}

      {showSettings && (
        <ThresholdsModal
          patientId={patient.id}
          patientName={patient.name}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

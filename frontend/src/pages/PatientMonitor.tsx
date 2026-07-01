import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAppStore } from '../store/vitalsStore';
import { fetchPatientVitals } from '../api';
import { isPatientActive } from '../types';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import EcgWaveform from '../components/EcgWaveform';
import '../components/EcgWaveform.css';
import HistoryModal from '../components/HistoryModal';
import ThresholdsModal from '../components/ThresholdsModal';

type VitalKey = 'heart_rate' | 'spo2' | 'temperature' | 'respiratory_rate' | 'blood_pressure';

export default function PatientMonitor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { patients } = useWebSocket();
  const [activeTab, setActiveTab] = useState<'vitals' | 'ecg' | 'ai'>('vitals');
  
  const [selectedVital, setSelectedVital] = useState<VitalKey>('heart_rate');
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [isEcgExpanded, setIsEcgExpanded] = useState(false);
  
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [yScaleMode, setYScaleMode] = useState<'auto'|'fixed'>('auto');
  const [yMin, setYMin] = useState<number | ''>('');
  const [yMax, setYMax] = useState<number | ''>('');
  
  const patient = id ? patients[id] : null;
  const vitalsHistoryRaw = useAppStore(state => state.vitalsHistory[id || '']);
  const vitalsHistory = vitalsHistoryRaw || [];
  const storeEcg = useAppStore(state => state.latestEcg[id || '']);
  const ecg = storeEcg || patient?.ecg;
  const [historicalData, setHistoricalData] = useState<any[]>([]);

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

  if (!isPatientActive(patient)) {
    return (
      <div className="content">
        <div className="identity" style={{ marginTop: '10px' }}>
          <div>
            <h1 style={{ display: 'inline' }}>{patient.name}</h1>
            <span className="meta">{patient.age}y &middot; {patient.condition} &middot; ID {patient.id} {patient.cerner_patient_id ? `· CERNER ${patient.cerner_patient_id}` : ''}</span>
          </div>
          <div className="id-actions">
            <button className="ghost-btn icon-only" title="Settings" onClick={() => setShowSettings(true)}>
               <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>
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

  // We limit to the last 200 points for performance
  const chartData = allData.slice(-200);

  const getLineColor = (key: string) => {
    switch(key) {
      case 'heart_rate': return 'var(--green)';
      case 'spo2': return 'var(--blue)';
      case 'temperature': return 'var(--amber)';
      case 'respiratory_rate': return 'var(--purple, #a855f7)';
      case 'blood_pressure': return 'var(--red)';
      default: return 'var(--accent)';
    }
  };

  const vitalLabels: Record<VitalKey, string> = {
    'heart_rate': 'Heart Rate',
    'spo2': 'SpO2',
    'temperature': 'Temperature',
    'respiratory_rate': 'Respiratory Rate',
    'blood_pressure': 'Blood Pressure'
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
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis 
            dataKey="timestampMs" 
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            stroke="var(--ink-dim)"
            tick={{ fontSize: 11, fill: 'var(--ink-dim)' }}
            minTickGap={100}
          />
          <YAxis 
            stroke="var(--ink-dim)" 
            tick={{ fontSize: 11, fill: 'var(--ink-dim)' }} 
            domain={yScaleMode === 'fixed' ? [yMin === '' ? 'auto' : yMin, yMax === '' ? 'auto' : yMax] : ['auto', 'auto']} 
          />
          <RechartsTooltip content={<CustomTooltip />} />
          
          {selectedVital === 'blood_pressure' ? (
            <>
              <Line type="monotone" dataKey="systolic_bp" stroke="var(--red)" strokeWidth={2} dot={false} isAnimationActive={false} name="Systolic" />
              <Line type="monotone" dataKey="diastolic_bp" stroke="var(--blue)" strokeWidth={2} dot={false} isAnimationActive={false} name="Diastolic" />
            </>
          ) : (
            <Line 
              type="monotone" 
              dataKey={selectedVital} 
              stroke={getLineColor(selectedVital)} 
              strokeWidth={2} 
              dot={false} 
              isAnimationActive={false} 
              name={vitalLabels[selectedVital]}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="content">
      <div className="segnav">
        <div className={`seg ${activeTab === 'vitals' ? 'active' : ''}`} onClick={() => setActiveTab('vitals')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M2 12h4l2-7 4 14 3-9 2 4h5"/></svg>
          Vitals
        </div>
        <div className={`seg ${activeTab === 'ecg' ? 'active' : ''}`} onClick={() => setActiveTab('ecg')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8M12 17v4"/></svg>
          ECG Monitor
        </div>
        <div className={`seg ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
          AI Insights
        </div>
      </div>

      <div className="identity" style={{ marginTop: '10px' }}>
        <div>
          <h1 style={{ display: 'inline' }}>{patient.name}</h1>
          <span className="meta">{patient.age}y &middot; {patient.condition} &middot; ID {patient.id} {patient.cerner_patient_id ? `· CERNER ${patient.cerner_patient_id}` : ''}</span>
        </div>
        <div className="id-actions">
          <button className="ghost-btn" onClick={() => setShowHistory(true)}>View History</button>
          <button className="ghost-btn icon-only" title="Settings" onClick={() => setShowSettings(true)}>
             <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>
          </button>
        </div>
      </div>

      {activeTab === 'vitals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, marginTop: '10px' }}>
          <div className="vstrip">
            <div className={`vcell ${selectedVital === 'heart_rate' ? 'sel' : ''}`} onClick={() => setSelectedVital('heart_rate')}>
              <div className="tag">HR</div><div className="label">Heart Rate</div><div className="num">{patient.heart_rate ?? '--'}</div><div className="unit">bpm</div><div className="ind" style={{background: 'var(--green)'}}></div>
            </div>
            <div className={`vcell ${selectedVital === 'spo2' ? 'sel' : ''}`} onClick={() => setSelectedVital('spo2')}>
              <div className="tag">O2</div><div className="label">SpO&₂</div><div className="num">{patient.spo2 ?? '--'}</div><div className="unit">%</div><div className="ind" style={{background: 'var(--blue)'}}></div>
            </div>
            <div className={`vcell ${selectedVital === 'temperature' ? 'sel' : ''}`} onClick={() => setSelectedVital('temperature')}>
              <div className="tag">TMP</div><div className="label">Temperature</div><div className="num">{patient.temperature ?? '--'}</div><div className="unit">&deg;C</div><div className="ind" style={{background: 'var(--amber)'}}></div>
            </div>
            <div className={`vcell ${selectedVital === 'respiratory_rate' ? 'sel' : ''}`} onClick={() => setSelectedVital('respiratory_rate')}>
              <div className="tag">RR</div><div className="label">Resp. Rate</div><div className="num">{patient.respiratory_rate ?? '--'}</div><div className="unit">br/min</div><div className="ind" style={{background: 'var(--purple, #a855f7)'}}></div>
            </div>
            <div className={`vcell ${selectedVital === 'blood_pressure' ? 'sel' : ''}`} onClick={() => setSelectedVital('blood_pressure')}>
              <div className="tag">BP</div><div className="label">Blood Pressure</div><div className="num">{patient.systolic_bp ?? '--'}/{patient.diastolic_bp ?? '--'}</div><div className="unit">mmHg</div><div className="ind" style={{background: 'var(--red)'}}></div>
            </div>
          </div>
          
          <div className={isGraphExpanded ? "scope-panel-fullscreen" : "scope-panel"}>
             <div className="scope-meta" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
               <span style={{ color: getLineColor(selectedVital) }}>{vitalLabels[selectedVital].toUpperCase()} CHART LOGGING LIVE DATA</span>
               
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                 <select 
                   value={yScaleMode} 
                   onChange={(e) => setYScaleMode(e.target.value as 'auto'|'fixed')}
                   style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}
                 >
                   <option value="auto">Auto Scale</option>
                   <option value="fixed">Fixed Scale</option>
                 </select>
                 {yScaleMode === 'fixed' && (
                   <>
                     <input 
                       type="number" 
                       placeholder="Min" 
                       value={yMin} 
                       onChange={(e) => setYMin(e.target.value === '' ? '' : Number(e.target.value))}
                       style={{ width: '60px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}
                     />
                     <input 
                       type="number" 
                       placeholder="Max" 
                       value={yMax} 
                       onChange={(e) => setYMax(e.target.value === '' ? '' : Number(e.target.value))}
                       style={{ width: '60px', background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}
                     />
                   </>
                 )}
               </div>

               <button className="ghost-btn" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setIsGraphExpanded(!isGraphExpanded)}>
                 {isGraphExpanded ? "CLOSE FULLSCREEN" : "EXPAND"}
               </button>
             </div>
             <div className="scope" style={{ display: 'flex', height: isGraphExpanded ? 'calc(100% - 40px)' : '100%' }}>
               {renderVitalChart()}
             </div>
          </div>
        </div>
      )}

      {activeTab === 'ecg' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, marginTop: '10px' }}>
          <div className={isEcgExpanded ? "ecg-grid-layout-fullscreen" : "ecg-grid-layout"}>
            <div className="ecg-stats-col">
              <div className="ecg-stat-row"><div className="l">Rhythm</div><div className="v rhythm">{ecg?.rhythm || 'Normal Sinus Rhythm'}</div></div>
              <div className="ecg-stat-row"><div className="l">PR Interval</div><div className="v">{ecg?.pr_interval || '--'} <span className="u">ms</span></div></div>
              <div className="ecg-stat-row"><div className="l">QRS Duration</div><div className="v">{ecg?.qrs_duration || '--'} <span className="u">ms</span></div></div>
              <div className="ecg-stat-row"><div className="l">QT Interval</div><div className="v">{ecg?.qt_interval || '--'} <span className="u">ms</span></div></div>
            </div>
            <div className="ecg-traces" style={{ display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                 <button className="ghost-btn" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setIsEcgExpanded(!isEcgExpanded)}>
                   {isEcgExpanded ? "CLOSE FULLSCREEN" : "EXPAND"}
                 </button>
              </div>

              <div className="trace-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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

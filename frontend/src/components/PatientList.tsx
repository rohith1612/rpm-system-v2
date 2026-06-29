/**
 * PatientList — sidebar showing all patients with status indicators.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Patient } from "../types";
import { VITAL_CONFIGS, getVitalStatus, isPatientActive, SYS_BP_CONFIG, DIA_BP_CONFIG } from "../types";
import { motion } from "framer-motion";
import "./PatientList.css";

interface Props {
  patients: Record<string, Patient>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isOpen: boolean;
  onToggle?: () => void;
}

// STALE_THRESHOLD_MS logic moved to types.ts

function getPatientOverallStatus(patient: Patient): "normal" | "warning" | "critical" {
  let worst: "normal" | "warning" | "critical" = "normal";
  for (const cfg of VITAL_CONFIGS) {
    let status: "normal" | "warning" | "critical" = "normal";
    if (cfg.key === "blood_pressure") {
      const sysStatus = getVitalStatus(SYS_BP_CONFIG, patient.systolic_bp);
      const diaStatus = getVitalStatus(DIA_BP_CONFIG, patient.diastolic_bp);
      if (sysStatus === "critical" || diaStatus === "critical") status = "critical";
      else if (sysStatus === "warning" || diaStatus === "warning") status = "warning";
    } else {
      const val = patient[cfg.key as keyof Patient] as number | null;
      status = getVitalStatus(cfg, val);
    }
    if (status === "critical") return "critical";
    if (status === "warning") worst = "warning";
  }
  return worst;
}

const Sparkline = ({ data }: { data?: number[] }) => {
  if (!data || data.length < 2) return <div className="patient-list__sparkline-placeholder"></div>;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  
  const width = 40;
  const height = 16;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  // H1: Use getVitalStatus instead of hardcoded thresholds
  const latest = data[data.length - 1];
  const hrConfig = VITAL_CONFIGS.find(c => c.key === "heart_rate")!;
  const hrStatus = getVitalStatus(hrConfig, latest);
  const color = hrStatus === "critical" ? "#cf222e" : hrStatus === "warning" ? "#d97706" : "#0366d6";

  return (
    <div className="patient-list__sparkline" title="Heart Rate Trend">
      <svg width={width} height={height}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={points}
        />
      </svg>
    </div>
  );
};

// Sort order for severity-first ranking
const STATUS_ORDER: Record<string, number> = { critical: 0, warning: 1, normal: 2 };

export default function PatientList({ patients, selectedId, onSelect, isOpen, onToggle }: Props) {
  const navigate = useNavigate();

  // Re-render every 5s so staleness checks stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  // Primary: active patients first, inactive at bottom
  // Secondary: severity (critical → warning → normal)
  // Tertiary: alphabetical
  const patientList = Object.values(patients).sort((a, b) => {
    const activeA = isPatientActive(a) ? 0 : 1;
    const activeB = isPatientActive(b) ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;

    const sA = STATUS_ORDER[getPatientOverallStatus(a)];
    const sB = STATUS_ORDER[getPatientOverallStatus(b)];
    if (sA !== sB) return sA - sB;

    return (a.id || "").localeCompare(b.id || "");
  });

  // H4: Compute worst severity across active patients only for collapsed rail
  const activePatients = patientList.filter(isPatientActive);
  const worstStatus = activePatients.reduce<"normal" | "warning" | "critical">(
    (worst, p) => {
      const s = getPatientOverallStatus(p);
      if (s === "critical") return "critical";
      if (s === "warning" && worst !== "critical") return "warning";
      return worst;
    },
    "normal"
  );

  return (
    <>
      {/* H4: Collapsed rail — visible when sidebar is hidden */}
      {!isOpen && (
        <div
          className="patient-list__collapsed-rail"
          onClick={onToggle}
          title="Open Patient List"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <span className={`patient-list__dot patient-list__dot--${worstStatus}`} />
          <span className="patient-list__collapsed-count">{patientList.length}</span>
          <div style={{ marginTop: 'auto', marginBottom: '16px', color: 'var(--slate-400)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>
      )}

      <aside className={`patient-list ${!isOpen ? "patient-list--closed" : ""}`} id="patient-list-sidebar">
        <div className="patient-list__header">
          <h2 className="patient-list__title">Patients</h2>
          {onToggle && (
            <button
              onClick={onToggle}
              className="patient-list__collapse-btn"
              title="Collapse Patient List"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--slate-500)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                borderRadius: '4px',
                transition: 'background 0.2s, color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--slate-150)';
                e.currentTarget.style.color = 'var(--slate-800)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = 'var(--slate-500)';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          )}
        </div>
        {patientList.length === 0 && (
          <p className="patient-list__empty">
            No patients yet. Start the simulator to begin streaming data.
          </p>
        )}
        {patientList.map((p) => {
          const status = getPatientOverallStatus(p);
          const active = isPatientActive(p);
          const isSelected = p.id === selectedId;
          return (
            <button
              key={p.id}
              id={`patient-btn-${p.id}`}
              className={`patient-list__item ${isSelected ? "patient-list__item--selected" : ""} ${!active ? "patient-list__item--inactive" : ""}`}
              onClick={() => onSelect(p.id)}
              style={{ position: 'relative' }}
            >
              {isSelected && (
                <motion.div
                  layoutId="active-patient"
                  className="patient-list__active-bg"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <div className="patient-list__item-content" style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', width: '100%', gap: '10px' }}>
                <span className={`patient-list__dot ${active ? `patient-list__dot--${status}` : "patient-list__dot--inactive"}`} />
                <div className="patient-list__info">
                  <span className="patient-list__name">{p.name || p.id}</span>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {p.id}
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(p.id);
                      }}
                      title="Copy Patient ID"
                      style={{ cursor: 'pointer', opacity: 0.6, display: 'flex' }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </div>
                  </div>
                  <span className="patient-list__meta">
                    {p.age ? <span className="patient-list__age-badge">{p.age}y</span> : null}
                    {p.condition || ""}
                  </span>
                  {p.cerner_patient_id && (
                    <div style={{ fontSize: '10px', color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                      Cerner ID: {p.cerner_patient_id}
                    </div>
                  )}
                </div>
                <Sparkline data={p.recent_hr || []} />
              </div>
            </button>
          );
        })}
        
        <div className="patient-list__footer" style={{ padding: '16px', marginTop: 'auto', borderTop: '1px solid var(--slate-200)' }}>
          <button 
            onClick={() => navigate("/register")}
            style={{ width: '100%', padding: '10px', background: 'var(--blue-600)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
          >
            + Add Patient
          </button>
        </div>
      </aside>
    </>
  );
}

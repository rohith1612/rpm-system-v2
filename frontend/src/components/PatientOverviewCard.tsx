import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Patient } from "../types";
import { VITAL_CONFIGS, getVitalStatus, isPatientActive, SYS_BP_CONFIG, DIA_BP_CONFIG } from "../types";
import "./PatientOverviewCard.css";

interface Props {
  bedId: string;
  patient: Patient | null;
  unassignedPatients: Patient[];
  onAssign: (patientId: string) => void;
  onUnassign: () => void;
}

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

export default function PatientOverviewCard({
  bedId,
  patient,
  unassignedPatients,
  onAssign,
  onUnassign
}: Props) {
  const navigate = useNavigate();
  const [showSelector, setShowSelector] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState("");

  const handleCardClick = () => {
    if (patient) {
      navigate(`/patient/${patient.id}`);
    }
  };

  const handleAssignClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSelector(true);
  };

  const handleConfirmAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPatientId) {
      onAssign(selectedPatientId);
      setShowSelector(false);
      setSelectedPatientId("");
    }
  };

  const handleCancelAssign = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSelector(false);
    setSelectedPatientId("");
  };

  const handleUnassignClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to release Bed ${bedId}?`)) {
      onUnassign();
    }
  };

  if (!patient) {
    return (
      <div className="bed-card bed-card--empty">
        <div className="bed-card__header">
          <span className="bed-card__bed-label">Bed {bedId}</span>
          <span className="bed-card__status-dot bed-card__status-dot--empty" />
        </div>
        <div className="bed-card__empty-body">
          {showSelector ? (
            <form onSubmit={handleConfirmAssign} className="bed-card__assign-form" onClick={e => e.stopPropagation()}>
              <select
                value={selectedPatientId}
                onChange={e => setSelectedPatientId(e.target.value)}
                className="bed-card__select"
                required
              >
                <option value="">Select a Patient...</option>
                {unassignedPatients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </select>
              <div className="bed-card__form-actions">
                <button type="button" className="btn-cancel btn-xs" onClick={handleCancelAssign}>
                  Cancel
                </button>
                <button type="submit" className="btn-save btn-xs" disabled={!selectedPatientId}>
                  Assign
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="bed-card__empty-text">Unassigned</p>
              {unassignedPatients.length > 0 ? (
                <button className="bed-card__assign-btn" onClick={handleAssignClick}>
                  + Assign Patient
                </button>
              ) : (
                <button className="bed-card__assign-btn bed-card__assign-btn--disabled" disabled title="No unassigned patients. Please register a new patient.">
                  No Patients Available
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const active = isPatientActive(patient);
  const status = getPatientOverallStatus(patient);
  const cardStatusClass = active ? `bed-card--${status}` : "bed-card--inactive";

  const getVitalStatusLocal = (key: string) => {
    if (!active || !patient) return "normal";
    if (key === "blood_pressure") {
      const sysStatus = getVitalStatus(SYS_BP_CONFIG, patient.systolic_bp);
      const diaStatus = getVitalStatus(DIA_BP_CONFIG, patient.diastolic_bp);
      if (sysStatus === "critical" || diaStatus === "critical") return "critical";
      if (sysStatus === "warning" || diaStatus === "warning") return "warning";
      return "normal";
    }
    const val = patient[key as keyof Patient] as number | null;
    const config = VITAL_CONFIGS.find(cfg => cfg.key === key);
    return config ? getVitalStatus(config, val) : "normal";
  };

  const vitalKeys = ["heart_rate", "spo2", "temperature", "respiratory_rate", "blood_pressure"];

  return (
    <div className={`bed-card ${cardStatusClass}`} onClick={handleCardClick} style={{ cursor: "pointer" }}>
      <div className="bed-card__header">
        <div className="bed-card__header-left">
          <span className="bed-card__bed-label">Bed {bedId}</span>
          <span className={`bed-card__status-dot ${active ? `bed-card__status-dot--${status}` : "bed-card__status-dot--inactive"}`} />
          <span className="bed-card__live-label">{active ? "LIVE" : "INACTIVE"}</span>
          {patient.cerner_patient_id && (
            <span className="bed-card__cerner-badge" title={`Connected to Cerner (ID: ${patient.cerner_patient_id})`}>
              FHIR
            </span>
          )}
        </div>
        <button className="bed-card__unassign-btn" onClick={handleUnassignClick} title="Release Bed">
          ✕
        </button>
      </div>

      <div className="bed-card__body">
        <h4 className="bed-card__patient-name">{patient.name}</h4>
        <div className="bed-card__patient-meta">
          <span>Age: {patient.age || "N/A"}</span>
          <span>•</span>
          <span className="bed-card__patient-condition" title={patient.condition || ""}>
            {patient.condition || "No Diagnosis"}
          </span>
        </div>
        {patient.cerner_patient_id && (
          <div className="bed-card__cerner-id" style={{ fontSize: '11px', color: 'var(--slate-500)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            Cerner ID: {patient.cerner_patient_id}
          </div>
        )}

        {/* Criticality Sparkline Strip */}
        <div className="bed-card__sparkline-strip">
          {vitalKeys.map(key => {
            const vStatus = getVitalStatusLocal(key);
            const colorMap = {
              critical: '#ef4444',
              warning: '#f59e0b',
              normal: '#10b981'
            };
            return (
              <div 
                key={key} 
                className={`sparkline-bar sparkline-bar--${vStatus}`} 
                style={{ backgroundColor: active ? colorMap[vStatus] : 'rgba(255,255,255,0.15)' }} 
                title={`${key.replace('_', ' ').toUpperCase()}: ${active ? vStatus.toUpperCase() : 'INACTIVE'}`}
              />
            );
          })}
        </div>

        <div className="bed-card__vitals-grid">
          {VITAL_CONFIGS.map(cfg => {
            if (cfg.key === "blood_pressure") {
              const systolicVal = patient.systolic_bp;
              const diastolicVal = patient.diastolic_bp;
              
              let displayValue = "--/--";
              if (active) {
                if (systolicVal !== null && diastolicVal !== null) {
                  displayValue = `${Math.round(systolicVal)}/${Math.round(diastolicVal)}`;
                } else if (systolicVal !== null) {
                  displayValue = `${Math.round(systolicVal)}/--`;
                } else if (diastolicVal !== null) {
                  displayValue = `--/${Math.round(diastolicVal)}`;
                }
              }
              
              const sysStatus = getVitalStatus(SYS_BP_CONFIG, systolicVal);
              const diaStatus = getVitalStatus(DIA_BP_CONFIG, diastolicVal);
              let vitalStatus: "normal" | "warning" | "critical" = "normal";
              if (sysStatus === "critical" || diaStatus === "critical") vitalStatus = "critical";
              else if (sysStatus === "warning" || diaStatus === "warning") vitalStatus = "warning";
              
              return (
                <div key={cfg.key} className={`bed-card__vital-item bed-card__vital-item--${active ? vitalStatus : 'inactive'}`}>
                  <span className="bed-card__vital-label">{cfg.icon}</span>
                  <span className="digital-display">
                    <span className="digital-display__bg">888/888</span>
                    <span 
                      key={displayValue}
                      className="digital-display__fg bed-card__vital-value--tick"
                    >
                      {displayValue}
                    </span>
                  </span>
                  <span className="bed-card__vital-unit">{cfg.unit}</span>
                </div>
              );
            }
            
            const val = patient[cfg.key as keyof Patient] as number | null;
            const vitalStatus = getVitalStatus(cfg, val);
            const displayValue = active && val !== null ? `${Math.round(val * 10) / 10}` : "--";
            const bgTemplate = cfg.key === "temperature" ? "88.8" : "888";
            
            return (
              <div key={cfg.key} className={`bed-card__vital-item bed-card__vital-item--${active ? vitalStatus : 'inactive'}`}>
                <span className="bed-card__vital-label">{cfg.icon}</span>
                <span className="digital-display">
                  <span className="digital-display__bg">{bgTemplate}</span>
                  <span 
                    key={displayValue}
                    className="digital-display__fg bed-card__vital-value--tick"
                  >
                    {displayValue}
                  </span>
                </span>
                <span className="bed-card__vital-unit">{cfg.unit}</span>
              </div>
            );
          })}
        </div>

        {/* Brutalist industrial metadata footer */}
        <div className="bed-card__brutalist-meta" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontFamily: 'monospace', color: 'var(--slate-400)', marginTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: '6px', letterSpacing: '0.5px' }}>
          <span>SYS_STAT: {active ? "ONLINE" : "IDLE"}</span>
          <span>RX_RATE: {active ? "1.0Hz" : "0.0Hz"}</span>
          <span>PKT_SEC: {active ? Math.floor(Math.random() * 5) + 5 : 0}</span>
        </div>
      </div>
    </div>
  );
}

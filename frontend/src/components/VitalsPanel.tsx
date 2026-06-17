/**
 * VitalsPanel — grid of all vital cards for the selected patient,
 * plus patient header and active alerts.
 */
import { useState } from "react";
import type { Patient, VitalKey } from "../types";
import { VITAL_CONFIGS } from "../types";
import { deletePatient } from "../api";
import VitalCard from "./VitalCard";
import HistoryModal from "./HistoryModal";
import ThresholdsModal from "./ThresholdsModal";
import PatientModal from "./PatientModal";
import "./VitalsPanel.css";

interface Props {
  patient: Patient | null;
  selectedVital: VitalKey;
  onSelectVital: (vital: VitalKey) => void;
  onPatientDeleted?: () => void;
  isDataStale: boolean;
}

export default function VitalsPanel({ patient, selectedVital, onSelectVital, onPatientDeleted, isDataStale }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  if (!patient) return null;

  return (
    <section className="vitals-panel" id="vitals-panel">
      {/* Header */}
      <div className="vitals-panel__top-bar" style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: 'var(--slate-800)', textTransform: 'capitalize' }}>
            {patient.name || patient.id}
          </h2>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
            {patient.id}
          </span>
        </div>
        {/* H3: History + Settings buttons accessible from Vitals tab */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowEdit(true)}
            title="Edit Patient"
            className="vitals-panel__action-btn vitals-panel__action-btn--icon"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button
            onClick={async () => {
              if (window.confirm(`Are you sure you want to delete ${patient.name}? This will permanently erase all associated history and alerts.`)) {
                try {
                  await deletePatient(patient.id);
                  if (onPatientDeleted) onPatientDeleted();
                } catch (e) {
                  alert("Failed to delete patient.");
                }
              }
            }}
            title="Delete Patient"
            className="vitals-panel__action-btn vitals-panel__action-btn--icon"
            style={{ color: '#ef4444' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="vitals-panel__action-btn"
          >
            View History
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Configure Alert Thresholds"
            className="vitals-panel__action-btn vitals-panel__action-btn--icon"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
        </div>
      </div>

      {/* Vital Cards Grid */}
      <div className="vitals-panel__grid">
        {VITAL_CONFIGS.map((cfg) => (
          <VitalCard
            key={cfg.key}
            patient={patient}
            vitalKey={cfg.key}
            isSelected={selectedVital === cfg.key}
            onClick={() => onSelectVital(cfg.key)}
            isDataStale={isDataStale}
          />
        ))}
      </div>

      {showHistory && (
        <HistoryModal
          patient={patient}
          selectedVital={selectedVital}
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

      {showEdit && (
        <PatientModal
          patientToEdit={patient}
          onClose={() => setShowEdit(false)}
          onSaved={() => setShowEdit(false)}
        />
      )}
    </section>
  );
}

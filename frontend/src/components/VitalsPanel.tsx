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
    <section className="bg-white dark:bg-transparent dark:border-white/10 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow" id="vitals-panel">
      {/* Patient Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4 select-none">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight capitalize">
            {patient.name || patient.id}
          </h2>
          <span className="text-xs font-semibold font-mono text-slate-400 dark:text-white">
            {patient.id}
          </span>
        </div>
        
        {/* Actions Menu */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowEdit(true)}
            title="Edit Patient Info"
            className="p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-white rounded-xl transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          
          <button
            onClick={() => setShowSettings(true)}
            title="Configure Alert Thresholds"
            className="p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-500 dark:text-white rounded-xl transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>

          <button
            onClick={() => setShowHistory(true)}
            className="text-xs px-3 py-2 font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all"
          >
            View History
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
            className="p-2 bg-red-50 border border-red-100 hover:bg-red-100 text-red-500 rounded-xl transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      </div>

      {/* Vital Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {VITAL_CONFIGS.filter(c => c.key !== 'diastolic_bp').map((cfg) => (
          <VitalCard
            key={cfg.key}
            patient={patient}
            vitalKey={cfg.key}
            isSelected={selectedVital === cfg.key || (selectedVital === 'diastolic_bp' && cfg.key === 'systolic_bp')}
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


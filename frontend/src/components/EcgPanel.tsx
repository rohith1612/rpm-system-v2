/**
 * EcgPanel — displays ECG parameters and the real-time waveform in Argon Dashboard style.
 */
import { useState, useEffect } from "react";
import type { Patient, VitalKey } from "../types";
import { VITAL_CONFIGS } from "../types";
import EcgWaveform from "./EcgWaveform";
import VitalCard from "./VitalCard";
import HistoryModal from "./HistoryModal";
import ThresholdsModal from "./ThresholdsModal";

interface Props {
  patient: Patient;
  selectedVital: VitalKey;
  onSelectVital: (vital: VitalKey) => void;
  onExpand: (expanded: boolean) => void;
  isDataStale: boolean;
}

const PARAM_LABELS: { key: string; label: string; unit: string; format?: (v: number) => string }[] = [
  { key: "pr_interval", label: "PR Interval", unit: "ms", format: (v) => (v * 1000).toFixed(0) },
  { key: "qrs_duration", label: "QRS Duration", unit: "ms", format: (v) => (v * 1000).toFixed(0) },
  { key: "qt_interval", label: "QT Interval", unit: "ms", format: (v) => (v * 1000).toFixed(0) },
  { key: "qtc_interval", label: "QTc (Bazett)", unit: "ms", format: (v) => (v * 1000).toFixed(0) },
  { key: "st_offset", label: "ST Offset", unit: "mV", format: (v) => v.toFixed(2) },
];

export default function EcgPanel({ patient, selectedVital, onSelectVital, onExpand, isDataStale }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const ecg = patient.ecg;

  const handleToggleExpand = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (onExpand) {
      onExpand(newExpanded);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showHistory || showSettings) {
          setShowHistory(false);
          setShowSettings(false);
        } else if (isExpanded) {
          setIsExpanded(false);
          if (onExpand) onExpand(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, showHistory, showSettings, onExpand]);

  return (
    <div className={`flex flex-col gap-4 flex-1 ${isExpanded ? "fixed inset-4 z-50 bg-slate-50 dark:bg-slate-900 p-6 rounded-2xl shadow-2xl overflow-y-auto" : ""}`} id="ecg-panel">
      {/* Header and Expand Button */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 select-none">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight capitalize">
            {patient.name || patient.id}
          </h2>
          <span className="text-xs font-semibold font-mono text-slate-400 dark:text-white">
            {patient.id}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {isExpanded && (
            <>
              <button 
                onClick={() => setShowSettings(true)}
                title="Configure Alert Thresholds"
                className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl transition-all"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </button>
              
              <button 
                onClick={() => setShowHistory(true)}
                className="text-xs px-3 py-2 font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl transition-all"
              >
                View History
              </button>
            </>
          )}
          
          <button 
            className="text-xs px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl transition-all flex items-center gap-1"
            onClick={handleToggleExpand}
          >
            {isExpanded ? (
              <>
                <span>✕</span> Collapse
              </>
            ) : (
              <>
                <span>⛶</span> Expand
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Vitals panel (visible only when in fullscreen ECG) */}
      {isExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-2 select-none">
          {VITAL_CONFIGS.map((cfg) => (
            <VitalCard
              key={cfg.key}
              patient={patient}
              vitalKey={cfg.key}
              isSelected={selectedVital === cfg.key}
              onClick={() => onSelectVital && onSelectVital(cfg.key)}
            />
          ))}
        </div>
      )}

      {/* Parameters Row (Grid of ECG variables) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-2">
        {/* Rhythm Block */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100/50 dark:border-indigo-500/20 rounded-2xl p-4 flex flex-col justify-between shadow-sm select-none">
          <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">Rhythm Status</span>
          <span className="text-sm font-extrabold text-indigo-800 dark:text-indigo-300 mt-1 truncate">
            {isDataStale ? "--" : patient.ecg?.rhythm || "NSR"}
          </span>
        </div>

        {/* Regular parameters */}
        {PARAM_LABELS.map(({ key, label, unit, format }) => {
          const raw = ecg ? (ecg as unknown as Record<string, unknown>)[key] : null;
          const value = !isDataStale && typeof raw === "number" && format ? format(raw) : "--";
          return (
            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 flex flex-col justify-between shadow-sm select-none" key={key}>
              <span className="text-[10px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">{label}</span>
              <span className="text-sm font-extrabold text-slate-700 dark:text-white mt-1 flex items-baseline gap-0.5">
                {value}
                {value !== "--" && <span className="text-[10px] font-normal text-slate-400 dark:text-white ml-0.5">{unit}</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Waveforms Render Area */}
      <div className="flex flex-col gap-4">
        {/* Lead II (Main Waveform) */}
        <div className="min-h-[280px] bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden relative">
          <EcgWaveform ecg={ecg} patient={patient} waveType="ecg" lead="II" isDataStale={isDataStale} />
        </div>
        
        {/* Sub-waveforms (Pleth and Resp) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
          <div className="h-32 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden relative">
            <EcgWaveform ecg={ecg} patient={patient} waveType="pleth" isDataStale={isDataStale} />
          </div>
          <div className="h-32 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden relative">
            <EcgWaveform ecg={ecg} patient={patient} waveType="resp" isDataStale={isDataStale} />
          </div>
        </div>
      </div>

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


/**
 * EcgPanel — displays ECG parameters and the real-time waveform.
 */
import { useState, useEffect } from "react";
import type { Patient, VitalKey } from "../types";
import { VITAL_CONFIGS } from "../types";
import EcgWaveform from "./EcgWaveform";
import VitalCard from "./VitalCard";
import HistoryModal from "./HistoryModal";
import ThresholdsModal from "./ThresholdsModal";
import "./EcgPanel.css";

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
    <div className={`ecg-panel ${isExpanded ? "ecg-panel--expanded" : ""}`} id="ecg-panel">
      {/* Header and Expand Button */}
      <div className="ecg-panel__top-bar" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h2 className="ecg-panel__patient-name" style={{ margin: 0 }}>
            {patient.name || patient.id}
          </h2>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
            {patient.id}
          </span>
        </div>
        {isExpanded && (
          <div style={{ display: 'flex', gap: '8px', marginRight: '16px' }}>
            <button 
              onClick={() => setShowHistory(true)}
              className="ecg-panel__action-btn"
            >
              View History
            </button>
            <button
              onClick={() => setShowSettings(true)}
              title="Configure Alert Thresholds"
              className="ecg-panel__action-btn ecg-panel__action-btn--icon"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
          </div>
        )}
        <button 
           className="ecg-panel__expand-btn"
           onClick={handleToggleExpand}
        >
          {isExpanded ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
              Collapse
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>
              Expand
            </>
          )}
        </button>
      </div>

      {/* Expanded Vitals */}
      {isExpanded && (
        <div className="vitals-panel__grid" style={{ marginBottom: '16px' }}>
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

      {/* Content Row for Side-by-Side layout */}
      <div className="ecg-panel__content-row">
        {/* Parameter Cards */}
        <div className="ecg-panel__params">
          <div className="ecg-panel__rhythm">
            <span className="ecg-panel__rhythm-label">Rhythm</span>
            <span className="ecg-panel__rhythm-value" style={{ color: isDataStale ? 'var(--slate-400)' : undefined }}>
              {isDataStale ? "--" : patient.ecg?.rhythm || "NSR"}
            </span>
          </div>
          {PARAM_LABELS.map(({ key, label, unit, format }) => {
            const raw = ecg ? (ecg as unknown as Record<string, unknown>)[key] : null;
            const value = !isDataStale && typeof raw === "number" && format ? format(raw) : "--";
            return (
              <div className="ecg-panel__param glass-card" key={key}>
                <span className="ecg-panel__param-label">{label}</span>
                <span className="ecg-panel__param-value">
                  {value}
                  <span className="ecg-panel__param-unit">{unit}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Waveform Canvas Area */}
        <div className="ecg-panel__waveforms">
          <div className="ecg-panel__waveform-main glass-card">
            <EcgWaveform ecg={ecg} patient={patient} waveType="ecg" lead="II" isDataStale={isDataStale} />
          </div>
          <div className="ecg-panel__waveform-row">
            <div className="ecg-panel__waveform-sub glass-card">
              <EcgWaveform ecg={ecg} patient={patient} waveType="pleth" isDataStale={isDataStale} />
            </div>
            <div className="ecg-panel__waveform-sub glass-card">
              <EcgWaveform ecg={ecg} patient={patient} waveType="resp" isDataStale={isDataStale} />
            </div>
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

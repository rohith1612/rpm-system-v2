import { motion, AnimatePresence } from "framer-motion";
import VitalsPanel from "./VitalsPanel";
import VitalChart from "./VitalChart";
import EcgPanel from "./EcgPanel";
import AiInsightsPanel from "./AiInsightsPanel";
import type { Patient, VitalKey } from "../types";

type TabKey = "vitals" | "ecg" | "insights";

interface Props {
  patient: Patient | null;
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  selectedVital: VitalKey;
  setSelectedVital: (vital: VitalKey) => void;
  onExpandECG: (expanded: boolean) => void;
  onPatientDeleted?: () => void;
  isDataStale: boolean;
}

export default function CentralWorkspace({
  patient,
  activeTab,
  setActiveTab,
  selectedVital,
  setSelectedVital,
  onExpandECG,
  onPatientDeleted,
  isDataStale
}: Props) {
  if (!patient) {
    return (
      <motion.div 
        className="dashboard__empty"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="dashboard__empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <h2>Select a Patient</h2>
        <p>Choose a patient from the sidebar to view their real-time vitals and ECG.</p>
      </motion.div>
    );
  }

  return (
    <div className="dashboard__center">
      {/* Toggle Button Box */}
      <div className="dashboard__tabs">
        <button
          className={`dashboard__tab ${activeTab === "vitals" ? "dashboard__tab--active" : ""}`}
          onClick={() => setActiveTab("vitals")}
          id="tab-vitals"
        >
          {activeTab === "vitals" && (
            <motion.div
              layoutId="dashboard-active-tab"
              className="dashboard__tab-active-bg"
              initial={false}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="dashboard__tab-content-inner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Vitals
          </span>
        </button>
        <button
          className={`dashboard__tab ${activeTab === "ecg" ? "dashboard__tab--active" : ""}`}
          onClick={() => setActiveTab("ecg")}
          id="tab-ecg"
        >
          {activeTab === "ecg" && (
            <motion.div
              layoutId="dashboard-active-tab"
              className="dashboard__tab-active-bg"
              initial={false}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="dashboard__tab-content-inner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
            ECG Monitor
          </span>
        </button>
        <button
          className={`dashboard__tab ${activeTab === "insights" ? "dashboard__tab--active" : ""}`}
          onClick={() => setActiveTab("insights")}
          id="tab-insights"
        >
          {activeTab === "insights" && (
            <motion.div
              layoutId="dashboard-active-tab"
              className="dashboard__tab-active-bg"
              initial={false}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="dashboard__tab-content-inner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <circle cx="12" cy="12" r="4" />
            </svg>
            AI Insights
          </span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="dashboard__tab-content relative">
        <AnimatePresence mode="wait">
          {activeTab === "vitals" && (
            <motion.div
              key="vitals"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}
            >
              <VitalsPanel
                patient={patient}
                selectedVital={selectedVital}
                onSelectVital={setSelectedVital}
                onPatientDeleted={onPatientDeleted}
                isDataStale={isDataStale}
              />
              <div className="dashboard__chart-wrapper">
                <VitalChart
                  patient={patient}
                  selectedVital={selectedVital}
                  onSelectVital={setSelectedVital}
                />
              </div>
            </motion.div>
          )}
          {activeTab === "ecg" && (
            <motion.div
              key="ecg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{ display: "flex", flexDirection: "column", flex: 1 }}
            >
              <EcgPanel 
                patient={patient} 
                selectedVital={selectedVital}
                onSelectVital={setSelectedVital}
                onExpand={onExpandECG}
                isDataStale={isDataStale}
              />
            </motion.div>
          )}
          {activeTab === "insights" && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{ display: "flex", flexDirection: "column", flex: 1 }}
            >
              <AiInsightsPanel patient={patient} isDataStale={isDataStale} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

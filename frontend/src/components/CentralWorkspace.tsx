import { motion, AnimatePresence } from "framer-motion";
import VitalsPanel from "./VitalsPanel";
import VitalChart from "./VitalChart";
import EcgPanel from "./EcgPanel";
import type { Patient, VitalKey } from "../types";

type TabKey = "vitals" | "ecg";

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
        className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-3xl shadow-sm mb-4">
          👋
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Select a Patient</h2>
        <p className="text-sm text-slate-500 dark:text-white max-w-sm">Choose a patient from the sidebar to view their real-time telemetry, vitals, and ECG monitor.</p>
      </motion.div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-5 min-h-0">
      {/* Toggle Tab Pill Header */}
      <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl self-start shrink-0 shadow-sm border border-slate-200/40 dark:border-slate-700">
        <button
          className={`relative flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "vitals" ? "text-slate-800 dark:text-white" : "text-slate-400 dark:text-white hover:text-slate-600 dark:text-white"
          }`}
          onClick={() => setActiveTab("vitals")}
          id="tab-vitals"
        >
          {activeTab === "vitals" && (
            <motion.div
              layoutId="dashboard-active-tab"
              className="absolute inset-0 bg-white rounded-xl shadow-sm -z-10 dark:bg-slate-700"
              initial={false}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="flex items-center gap-1.5 z-10 select-none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Vitals Panel
          </span>
        </button>
        
        <button
          className={`relative flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "ecg" ? "text-slate-800 dark:text-white" : "text-slate-400 dark:text-white hover:text-slate-600 dark:text-white"
          }`}
          onClick={() => setActiveTab("ecg")}
          id="tab-ecg"
        >
          {activeTab === "ecg" && (
            <motion.div
              layoutId="dashboard-active-tab"
              className="absolute inset-0 bg-white rounded-xl shadow-sm -z-10 dark:bg-slate-700"
              initial={false}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="flex items-center gap-1.5 z-10 select-none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <path d="M8 21h8" />
              <path d="M12 17v4" />
            </svg>
            ECG Monitor
          </span>
        </button>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        <AnimatePresence mode="wait">
          {activeTab === "vitals" && (
            <motion.div
              key="vitals"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col gap-4 flex-1 min-h-0"
            >
              <VitalsPanel
                patient={patient}
                selectedVital={selectedVital}
                onSelectVital={setSelectedVital}
                onPatientDeleted={onPatientDeleted}
                isDataStale={isDataStale}
              />
              <div className="flex-1 min-h-0">
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
              className="flex flex-col flex-1 min-h-0"
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
        </AnimatePresence>
      </div>
    </div>
  );
}


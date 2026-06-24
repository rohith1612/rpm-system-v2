/**
 * PatientList — sidebar showing all patients with status indicators in Argon Dashboard style.
 */
import { useState, useEffect, useMemo } from "react";
import type { Patient } from "../types";
import { VITAL_CONFIGS, getVitalStatus, isPatientActive } from "../types";
import { motion } from "framer-motion";

interface Props {
  patients: Record<string, Patient>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

function getPatientOverallStatus(patient: Patient): "normal" | "warning" | "critical" {
  let worst: "normal" | "warning" | "critical" = "normal";
  for (const cfg of VITAL_CONFIGS) {
    const val = patient[cfg.key] as number | null;
    const status = getVitalStatus(cfg, val);
    if (status === "critical") return "critical";
    if (status === "warning") worst = "warning";
  }
  return worst;
}

const Sparkline = ({ data }: { data?: number[] }) => {
  if (!data || data.length < 2) return <div className="w-10 h-4 bg-white/5 rounded dark:bg-transparent dark:border-white/10"></div>;

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

  const latest = data[data.length - 1];
  const hrConfig = VITAL_CONFIGS.find(c => c.key === "heart_rate")!;
  const hrStatus = getVitalStatus(hrConfig, latest);
  const color = hrStatus === "critical" ? "#ef4444" : hrStatus === "warning" ? "#f59e0b" : "#6366f1";

  return (
    <div className="flex items-center" title="Heart Rate Trend">
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

const STATUS_ORDER: Record<string, number> = { critical: 0, warning: 1, normal: 2 };

export default function PatientList({ patients, selectedId, onSelect, isOpen, onToggle }: Props) {
  const [searchTerm, setSearchTerm] = useState("");

  // Re-render every 5s so staleness checks stay fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  // Filter patients based on search term
  const filteredPatientsList = useMemo(() => {
    const rawList = Object.values(patients);
    if (!searchTerm.trim()) return rawList;
    const term = searchTerm.toLowerCase();
    return rawList.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      p.id?.toLowerCase().includes(term) ||
      p.condition?.toLowerCase().includes(term)
    );
  }, [patients, searchTerm]);

  // Sort: active first, then severity, then alphabetical ID
  const patientList = useMemo(() => {
    return [...filteredPatientsList].sort((a, b) => {
      const activeA = isPatientActive(a) ? 0 : 1;
      const activeB = isPatientActive(b) ? 0 : 1;
      if (activeA !== activeB) return activeA - activeB;

      const sA = STATUS_ORDER[getPatientOverallStatus(a)];
      const sB = STATUS_ORDER[getPatientOverallStatus(b)];
      if (sA !== sB) return sA - sB;

      return (a.id || "").localeCompare(b.id || "");
    });
  }, [filteredPatientsList]);

  // Worst severity across active patients only
  const worstStatus = useMemo(() => {
    const activePatients = Object.values(patients).filter(isPatientActive);
    return activePatients.reduce<"normal" | "warning" | "critical">(
      (worst, p) => {
        const s = getPatientOverallStatus(p);
        if (s === "critical") return "critical";
        if (s === "warning" && worst !== "critical") return "warning";
        return worst;
      },
      "normal"
    );
  }, [patients]);

  return (
    <>
      {/* Collapsed rail (used if sidebar is closed) */}
      {!isOpen && (
        <div
          className="w-16 h-full bg-gradient-to-b from-slate-800 to-slate-900 flex flex-col items-center py-6 gap-6 cursor-pointer border-r border-slate-700/30 transition-colors hover:bg-slate-800"
          onClick={onToggle}
          title="Click to expand sidebar"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-lg flex items-center justify-center text-white text-base font-bold">
            A
          </div>
          <div className="flex flex-col items-center gap-2 mt-4">
            <span className={`w-3 h-3 rounded-full ${worstStatus === "critical"
              ? "bg-red-500 animate-pulse"
              : worstStatus === "warning"
                ? "bg-amber-500"
                : "bg-emerald-500"
              }`} />
            <span className="text-[10px] text-slate-400 dark:text-white font-bold font-mono">
              {Object.keys(patients).length}
            </span>
          </div>
        </div>
      )}

      {/* Main Sidebar Aside */}
      <aside className={`w-64 h-full flex flex-col bg-gradient-to-b from-slate-800 to-slate-900 border-r border-slate-700/30 shrink-0 ${!isOpen ? "hidden" : ""}`}>
        {/* Search Filter */}
        <div className="px-4 pt-4 shrink-0">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-3 pr-8 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all dark:bg-transparent dark:border-white/10"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 text-slate-400 dark:text-white hover:text-white text-sm"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Section Title */}
        <div className="text-slate-400 dark:text-white text-[10px] font-semibold uppercase tracking-widest px-6 mb-2 mt-4 shrink-0">
          Patients ({patientList.length})
        </div>

        {/* Scrollable Patient List */}
        <div className="flex-1 px-3 py-1 space-y-1 overflow-y-auto min-h-0 select-none">
          {patientList.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-white px-3 py-4 italic text-center">
              {searchTerm ? "No matching patients." : "No patients yet. Start the simulator."}
            </p>
          )}

          {patientList.map((p) => {
            const status = getPatientOverallStatus(p);
            const active = isPatientActive(p);
            const isSelected = p.id === selectedId;

            let dotClass = "bg-slate-500";
            if (active) {
              if (status === "critical") dotClass = "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]";
              else if (status === "warning") dotClass = "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]";
              else dotClass = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
            }

            return (
              <button
                key={p.id}
                id={`patient-btn-${p.id}`}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-all group ${isSelected
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-slate-400 dark:text-white hover:bg-white/5 hover:text-white"
                  }`}
                onClick={() => onSelect(p.id)}
                style={{ position: "relative" }}
              >
                {isSelected && (
                  <motion.div
                    layoutId="active-patient"
                    className="absolute inset-0 bg-white/5 rounded-lg -z-10 dark:bg-transparent dark:border-white/10"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}

                <div className="flex items-center gap-2.5 min-w-0 z-10">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass} ${active && status === "critical" ? "animate-pulse" : ""}`} />
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white truncate">{p.name || p.id}</div>
                    <div className="text-[10px] text-slate-400 dark:text-white font-mono flex items-center gap-1 mt-0.5">
                      {p.id}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(p.id);
                        }}
                        title="Copy Patient ID"
                        className="cursor-pointer opacity-40 hover:opacity-100 transition-opacity ml-0.5"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                      </span>
                    </div>
                    {p.condition && (
                      <span className="inline-block text-[9px] text-slate-400 dark:text-white truncate max-w-full">
                        {p.condition}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 z-10">
                  {p.age && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-slate-300 dark:text-white dark:bg-transparent dark:border-white/10">
                      {p.age}y
                    </span>
                  )}
                  <Sparkline data={p.recent_hr || []} />
                </div>
              </button>
            );
          })}
        </div>

      </aside>
    </>
  );
}


/**
 * Dashboard — Flashcard-based patient vitals viewing system with real-time telemetry.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import PatientList from "../components/PatientList";
import CentralWorkspace from "../components/CentralWorkspace";
import AlertsSidebar from "../components/AlertsSidebar";
import CernerSearch from "../components/CernerSearch";
import EcgWaveform from "../components/EcgWaveform";
import { isPatientActive, VITAL_CONFIGS, getVitalStatus } from "../types";
import type { VitalKey, Patient } from "../types";
import { cn } from "../lib/utils";

type TabKey = "vitals" | "ecg";

// Helper to determine worst severity for a patient
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

// Removed ECGSparkline as it was unused


export default function Dashboard() {
  const { patients, alerts } = useWebSocket();

  // Flashcard States
  const [pinnedPatients, setPinnedPatients] = useState<string[]>([]);
  const [view, setView] = useState<"flashcard" | "list">("flashcard");

  // Modal & Workspace States
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVital, setSelectedVital] = useState<VitalKey>("heart_rate");
  const [activeTab, setActiveTab] = useState<TabKey>("vitals"); // Default modal to Vitals Tab

  // Search & Navigation States
  const [toast, setToast] = useState<string | null>(null);
  const [showAllInList, setShowAllInList] = useState(false);

  // Drawers
  const isMobile = window.innerWidth <= 768;
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);

  // Theme Toggle State
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Real-time loop
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Restore Pinned Patients from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem("dashboard_pinned_patients");
    if (saved) {
      setPinnedPatients(JSON.parse(saved));
    }
  }, []);

  // Save Pinned Patients on change
  const updatePinnedPatients = (updated: string[]) => {
    setPinnedPatients(updated);
    localStorage.setItem("dashboard_pinned_patients", JSON.stringify(updated));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Keyboard navigation for Modal
  useEffect(() => {
    if (!selectedId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
      } else if (e.key === "ArrowLeft") {
        const idx = pinnedPatients.indexOf(selectedId);
        if (idx > 0) setSelectedId(pinnedPatients[idx - 1]);
        else if (pinnedPatients.length > 0) setSelectedId(pinnedPatients[pinnedPatients.length - 1]);
      } else if (e.key === "ArrowRight") {
        const idx = pinnedPatients.indexOf(selectedId);
        if (idx >= 0 && idx < pinnedPatients.length - 1) setSelectedId(pinnedPatients[idx + 1]);
        else if (pinnedPatients.length > 0) setSelectedId(pinnedPatients[0]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, pinnedPatients]);

  // Drag-and-Drop State
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => setDraggedIdx(idx);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (idx: number) => {
    if (draggedIdx === null) return;
    const next = [...pinnedPatients];
    const temp = next[draggedIdx];
    next[draggedIdx] = next[idx];
    next[idx] = temp;
    updatePinnedPatients(next);
    setDraggedIdx(null);
  };

  // List Filtering
  const patientsList = useMemo(() => Object.values(patients), [patients]);

  // Actions
  const handleAddPatient = (pid: string) => {
    if (!pinnedPatients.includes(pid)) {
      updatePinnedPatients([...pinnedPatients, pid]);
      showToast(`${patients[pid]?.name || pid} added to dashboard`);
    } else {
      showToast(`${patients[pid]?.name || pid} is already on dashboard`);
      // Scroll to existing card if possible
      document.getElementById(`flashcard-${pid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleSelectAlert = (pid: string, vitalType: string) => {
    if (!pinnedPatients.includes(pid)) {
      updatePinnedPatients([...pinnedPatients, pid]);
    }
    setSelectedId(pid);
    setSelectedVital(vitalType as VitalKey);
    setActiveTab("vitals");
    setIsAlertsOpen(false); // Close slide-over drawer
  };

  const selectedPatient = selectedId ? patients[selectedId] || null : null;

  const pinnedPatientsData = Object.values(patients);
  const listPatients = patientsList;

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-900 font-sans overflow-hidden select-none relative transition-colors duration-300">

      {/* Mobile Sidebar Drawer Overlay */}
      {isSidebarOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden cursor-pointer"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar Pane (PatientList) */}
      <div className={`fixed lg:static top-0 left-0 h-full z-30 transition-all duration-300 ${isSidebarOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-16"
        }`}>
        <PatientList
          patients={patients}
          selectedId={selectedId}
          onSelect={(pid) => handleAddPatient(pid)} // Instead of selecting directly, we pin them.
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />
      </div>

      {/* Main Container Shell */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300`}>

        {/* Sticky Topbar */}
        <header className="bg-white dark:bg-transparent dark:border-white/10 border-b border-slate-100 dark:border-slate-700 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shrink-0 select-none transition-colors duration-300">
          {/* Left: Breadcrumbs & Hamburger */}
          <div className="flex items-center gap-4">
            <button
              className="text-slate-500 dark:text-white hover:text-slate-700 dark:text-white text-xl cursor-pointer p-1.5 rounded hover:bg-slate-50 transition-colors"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Toggle Patient Sidebar"
            >
              ☰
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 dark:text-white font-bold uppercase tracking-wider">Dashboard / Monitor</span>
              <span className="text-slate-800 dark:text-white font-extrabold text-sm">Patient Monitor</span>
            </div>
          </div>

          {/* Cerner Sandbox Search Component */}
          <div className="flex-1 max-w-3xl mx-6 flex justify-center">
            <CernerSearch />
          </div>

          {/* Right: View Toggle, Notifications Badge, Avatar */}
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 p-1 rounded-xl">
              <button
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${view === "flashcard" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  }`}
                onClick={() => setView("flashcard")}
                title="Flashcards Grid View"
              >
                Cards
              </button>
              <button
                className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${view === "list" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  }`}
                onClick={() => setView("list")}
                title="Directory Table View"
              >
                List
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="relative w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 text-slate-500 dark:text-white"
              title="Toggle Dark Mode"
            >
              {isDarkMode ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
              )}
            </button>

            {/* Notification bell */}
            <button
              onClick={() => setIsAlertsOpen(!isAlertsOpen)}
              className="relative w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
              title="Toggle System Alerts"
            >
              🔔
              {alerts.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full animate-bounce">
                  {alerts.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-900/50 transition-colors duration-300">

          {view === "flashcard" ? (
            // Mini Flashcard View Grid
            pinnedPatients.length === 0 ? (
              // Empty State
              <div className="flex flex-col items-center justify-center text-center py-20 select-none h-full">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-3xl shadow-sm mb-4">
                  🗂
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">No patients on your dashboard</h3>
                <p className="text-xs text-slate-500 dark:text-white max-w-xs">Use the search bar above to add patients, or select a patient from the left sidebar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 pb-20">


                {pinnedPatientsData.map((p, index) => {
                  const active = isPatientActive(p, now);
                  const status = getPatientOverallStatus(p);
                  const dotClass = status === "critical" ? "bg-red-500 animate-pulse" : status === "warning" ? "bg-amber-500" : "bg-emerald-500";
                  return (
                    <div
                      key={p.id}
                      id={`flashcard-${p.id}`}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(index)}
                      onClick={() => {
                        setSelectedId(p.id);
                        setActiveTab("vitals");
                      }}
                      className={cn(
                        "relative flex flex-col backdrop-blur-xl bg-white/70 dark:bg-slate-900/60 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 dark:border-white/10 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl",
                        draggedIdx === index ? "opacity-40" : "opacity-100",
                        !active ? "border-slate-200 dark:border-slate-700 opacity-60"
                          : status === "critical" ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                            : status === "warning" ? "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                              : "border-emerald-500/30"
                      )}
                    >
                      {/* Card Content */}
                      <div className="p-5 flex-1 flex flex-col">
                        {/* Header: Name, Room, Status Dot */}
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900 dark:to-blue-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold uppercase text-lg border border-indigo-200 dark:border-indigo-800">
                              {p.name ? p.name.charAt(0) : "P"}
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-800 dark:text-white text-lg leading-tight tracking-tight">{p.name || p.id}</h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Room {p.room || "—"} • ID: {p.id}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border", 
                              status === "critical" ? "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400" :
                              status === "warning" ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400" :
                              "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                            )}>
                              {status}
                            </span>
                            <span className={cn("w-3 h-3 rounded-full", active ? dotClass : "bg-slate-300")} />
                          </div>
                        </div>

                      {/* Vitals metrics */}
                      <div className="space-y-4 mb-5">

                        <div className="flex justify-between items-center text-lg font-medium text-slate-700 dark:text-white">
                          <span className="flex items-center gap-2">
                            HR
                          </span>

                          <span className="font-bold text-2xl monitor-display tracking-widest text-indigo-500 dark:text-indigo-400">
                            {active && p.heart_rate !== null
                              ? `${Math.round(p.heart_rate)} bpm`
                              : "—"}
                          </span>
                        </div>


                        <div className="flex justify-between items-center text-lg font-medium text-slate-700 dark:text-white">
                          <span className="flex items-center gap-2">
                            SpO₂
                          </span>

                          <span className="font-bold text-2xl monitor-display tracking-widest text-cyan-500 dark:text-cyan-400">
                            {active && p.spo2 !== null
                              ? `${Math.round(p.spo2)}%`
                              : "—"}
                          </span>
                        </div>


                        <div className="flex justify-between items-center text-lg font-medium text-slate-700 dark:text-white">
                          <span className="flex items-center gap-2">
                            BP
                          </span>

                          <span className="font-bold text-2xl monitor-display tracking-widest text-pink-500 dark:text-pink-400">
                            {active &&
                              p.systolic_bp !== null &&
                              p.diastolic_bp !== null
                              ? `${Math.round(p.systolic_bp)}/${Math.round(
                                p.diastolic_bp
                              )}`
                              : "—"}
                          </span>
                        </div>


                        <div className="flex justify-between items-center text-lg font-medium text-slate-700 dark:text-white">
                          <span className="flex items-center gap-2">
                            RR
                          </span>

                          <span className="font-bold text-2xl monitor-display tracking-widest text-emerald-500 dark:text-emerald-400">
                            {active && p.respiratory_rate !== null
                              ? `${Math.round(
                                p.respiratory_rate
                              )} /min`
                              : "—"}
                          </span>
                        </div>

                      </div>

                      {/* Small ECG Waveform Canvas */}
                      <div className="h-[90px] bg-slate-900 rounded-xl overflow-hidden mb-3 relative shadow-inner">
                         <EcgWaveform ecg={p.ecg} patient={p} waveType="ecg" lead="II" isDataStale={!active} />
                      </div>
                      
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            // Telemetry Directory Table (List View)
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden dark:bg-transparent dark:border-white/10">
              {/* Directory Filter controls */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between select-none">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Patient Directory</h3>
                  <p className="text-xs text-slate-400 dark:text-white mt-0.5">Telemetry directory summary table</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-white font-semibold">Show all patients</span>
                  <button
                    onClick={() => setShowAllInList(!showAllInList)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${showAllInList ? "bg-indigo-600" : "bg-slate-300"
                      }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform ${showAllInList ? "right-0.5" : "left-0.5"
                      }`} />
                  </button>
                </div>
              </div>

              {/* Table details */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 select-none">
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">Room</th>
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">HR</th>
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">SpO₂</th>
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">BP</th>
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">RR</th>
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">Temp</th>
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-[9px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans text-xs">
                    {listPatients.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-6 py-8 text-center text-slate-400 dark:text-white italic">
                          No patients to show. Add some to dashboard or use 'Show all'.
                        </td>
                      </tr>
                    ) : (
                      listPatients.map((p) => {
                        const active = isPatientActive(p, now);
                        const status = getPatientOverallStatus(p);
                        const rowBorder = !active
                          ? "border-l-slate-400"
                          : status === "critical"
                            ? "border-l-red-500 bg-red-50/5"
                            : status === "warning"
                              ? "border-l-amber-500"
                              : "border-l-emerald-500";

                        return (
                          <tr
                            key={p.id}
                            onClick={() => {
                              setSelectedId(p.id);
                              setActiveTab("vitals");
                            }}
                            className={`border-l-4 hover:bg-slate-50/50 transition-colors cursor-pointer ${rowBorder}`}
                          >
                            <td className="px-6 py-3.5 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                                {p.name ? p.name.charAt(0).toUpperCase() : "P"}
                              </div>
                              <span className="font-bold text-slate-700 dark:text-white">{p.name || p.id}</span>
                            </td>
                            <td className="px-6 py-3.5 font-semibold text-slate-500 dark:text-white">Room {p.room || "—"}</td>
                            <td className="px-6 py-3.5 font-bold text-slate-700 dark:text-white">{active && p.heart_rate !== null ? `${Math.round(p.heart_rate)} bpm` : "—"}</td>
                            <td className="px-6 py-3.5 font-bold text-slate-700 dark:text-white">{active && p.spo2 !== null ? `${Math.round(p.spo2)}%` : "—"}</td>
                            <td className="px-6 py-3.5 font-bold text-slate-700 dark:text-white">
                              {active && p.systolic_bp !== null && p.diastolic_bp !== null
                                ? `${Math.round(p.systolic_bp)}/${Math.round(p.diastolic_bp)}`
                                : "—"
                              }
                            </td>
                            <td className="px-6 py-3.5 font-bold text-slate-700 dark:text-white">{active && p.respiratory_rate !== null ? `${Math.round(p.respiratory_rate)} /min` : "—"}</td>
                            <td className="px-6 py-3.5 font-bold text-slate-700 dark:text-white">{active && p.temperature !== null ? `${p.temperature.toFixed(1)} °C` : "—"}</td>
                            <td className="px-6 py-3.5 font-bold">
                              <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold ${!active ? "bg-slate-100 text-slate-400 dark:text-white"
                                : status === "critical" ? "bg-red-50 text-red-500 animate-pulse border border-red-100"
                                  : status === "warning" ? "bg-amber-50 text-amber-500 border border-amber-100"
                                    : "bg-emerald-50 text-emerald-500 border border-emerald-100"
                                }`}>
                                {!active ? "inactive" : status}
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedId(p.id);
                                  setActiveTab("vitals");
                                }}
                                className="text-slate-400 dark:text-white hover:text-slate-600 dark:text-white text-xs font-semibold px-2 py-1 rounded border border-slate-200"
                              >
                                View Detailed
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </main>
      </div>

      {/* Right Slide-over Alerts Drawer */}
      <AlertsSidebar
        alerts={alerts}
        patients={patients}
        onSelectPatient={handleSelectAlert}
        isOpen={isAlertsOpen}
        onToggle={() => setIsAlertsOpen(!isAlertsOpen)}
      />

      {/* Expanded Patient Modal Popup (Preserving the exact CentralWorkspace UI) */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl w-[95vw] h-[95vh] max-w-none flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-slate-100 shrink-0 select-none dark:bg-transparent dark:border-white/10">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors font-bold text-slate-500 dark:text-white flex items-center gap-1 dark:bg-transparent dark:border-white/10"
                >
                  ← Back
                </button>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-xs font-bold flex items-center justify-center shadow-sm">
                  {selectedPatient.name ? selectedPatient.name.charAt(0).toUpperCase() : "P"}
                </div>
                <div className="flex flex-col">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{selectedPatient.name || "Unknown Patient"}</h2>
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-white leading-none mt-0.5">
                    Room {selectedPatient.room || "—"} • ID: {selectedPatient.id}
                  </span>
                </div>
                <span className={`ml-2 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-extrabold ${!isPatientActive(selectedPatient, now) ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300"
                  : getPatientOverallStatus(selectedPatient) === "critical" ? "bg-red-50 text-red-500 animate-pulse border border-red-100 dark:bg-red-500/10 dark:border-red-500/20"
                    : getPatientOverallStatus(selectedPatient) === "warning" ? "bg-amber-50 text-amber-500 border border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20"
                      : "bg-emerald-50 text-emerald-500 border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20"
                  }`}>
                  {!isPatientActive(selectedPatient, now) ? "Stale" : getPatientOverallStatus(selectedPatient)}
                </span>
              </div>

              {/* Prev/Next arrows & Close in header */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const idx = pinnedPatients.indexOf(selectedId || "");
                    if (idx > 0) setSelectedId(pinnedPatients[idx - 1]);
                    else if (pinnedPatients.length > 0) setSelectedId(pinnedPatients[pinnedPatients.length - 1]);
                  }}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center shadow-xs transition-colors"
                  title="Previous Patient (Arrow Left)"
                >
                  ‹
                </button>
                <button
                  onClick={() => {
                    const idx = pinnedPatients.indexOf(selectedId || "");
                    if (idx >= 0 && idx < pinnedPatients.length - 1) setSelectedId(pinnedPatients[idx + 1]);
                    else if (pinnedPatients.length > 0) setSelectedId(pinnedPatients[0]);
                  }}
                  className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center shadow-xs transition-colors"
                  title="Next Patient (Arrow Right)"
                >
                  ›
                </button>
                <div className="w-px h-6 bg-slate-200 mx-2" />
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-slate-400 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 font-bold text-sm p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors border border-transparent dark:border-slate-700 dark:hover:border-red-500/30"
                  title="Close (Escape)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: The exact CentralWorkspace UI preserved untouched! */}
            <div className="flex-1 overflow-y-auto p-6">
              <CentralWorkspace
                patient={selectedPatient}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                selectedVital={selectedVital}
                setSelectedVital={setSelectedVital}
                onExpandECG={() => { /* Optional handler */ }}
                onPatientDeleted={() => setSelectedId(null)}
                isDataStale={!isPatientActive(selectedPatient, now)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Alerts */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg z-50 select-none animate-bounce">
          {toast}
        </div>
      )}

    </div>
  );
}

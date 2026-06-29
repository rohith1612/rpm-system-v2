/**
 * Dashboard — main page layout with patient list sidebar, tabbed content, and alerts.
 */
import { useState, useEffect } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import PatientList from "../components/PatientList";
import CentralWorkspace from "../components/CentralWorkspace";
import AlertsSidebar from "../components/AlertsSidebar";
import { isPatientActive } from "../types";
import type { VitalKey } from "../types";
import "./Dashboard.css";

type TabKey = "vitals" | "ecg" | "insights";

export default function Dashboard() {
  const { patients, alerts, connected, lastMessageAt } = useWebSocket();
  const [selectedId, setSelectedId] = useState<string | null>(() => sessionStorage.getItem("rpm_selected_patient"));
  const [selectedVital, setSelectedVital] = useState<VitalKey>("heart_rate");
  const [activeTab, setActiveTab] = useState<TabKey>("vitals");
  
  // L6: Responsive sidebar states
  const isMobile = window.innerWidth <= 768;
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile);
  const [isAlertsOpen, setIsAlertsOpen] = useState(!isMobile);

  const selectedPatient = selectedId ? patients[selectedId] || null : null;

  // L6: Auto-collapse on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
        setIsAlertsOpen(false);
      } else {
        setIsSidebarOpen(true);
        setIsAlertsOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isDataStale = !isPatientActive(selectedPatient, now);

  const handleSelectAlert = (pid: string, vitalType: string) => {
    sessionStorage.setItem("rpm_selected_patient", pid);
    setSelectedId(pid);
    setSelectedVital(vitalType as VitalKey);
    setActiveTab("vitals");
    if (window.innerWidth <= 768) setIsSidebarOpen(false); // auto-close on mobile
  };

  const handlePatientSelect = (pid: string) => {
    sessionStorage.setItem("rpm_selected_patient", pid);
    setSelectedId(pid);
    if (window.innerWidth <= 768) setIsSidebarOpen(false); // auto-close on mobile
  };

  const handlePatientDeleted = () => {
    sessionStorage.removeItem("rpm_selected_patient");
    setSelectedId(null);
  };

  const handleExpandECG = (_expanded: boolean) => {
    // Note: implementation details for expand behavior
  };

  return (
    <div className="dashboard" id="dashboard-page">
      {/* Header */}
      <header className="dashboard__header">
        <div className="dashboard__brand">
          <button
            className="dashboard__menu-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title="Toggle Patient List"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div className="dashboard__logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 className="dashboard__title">Clinical RPM Monitor</h1>
        </div>
        <div className="dashboard__status">
          {selectedPatient && connected && (
            <span className="dashboard__timer">
              {new Date(now).toLocaleTimeString()}
            </span>
          )}
          <div className={`dashboard__live-indicator ${isDataStale ? "dashboard__live-indicator--stale" : ""}`}
            title={isDataStale ? `No data received for ${Math.round((now - lastMessageAt) / 1000)}s` : ""}
          >
            <span
              className={`dashboard__ws-dot ${
                !connected ? "dashboard__ws-dot--off"
                : isDataStale ? "dashboard__ws-dot--off"
                : "dashboard__ws-dot--on"
              }`}
            />
            <span className="dashboard__ws-text">
              {!connected ? "Connecting..." : isDataStale ? "Data Stale" : "Live"}
            </span>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="dashboard__body">
        <PatientList
          patients={patients}
          selectedId={selectedId}
          onSelect={handlePatientSelect}
          isOpen={isSidebarOpen}
        />
        <main className="dashboard__main">
          <CentralWorkspace
            patient={selectedPatient}
            activeTab={activeTab}
            setActiveTab={(tab) => setActiveTab(tab)}
            selectedVital={selectedVital}
            setSelectedVital={setSelectedVital}
            onExpandECG={handleExpandECG}
            onPatientDeleted={handlePatientDeleted}
            isDataStale={isDataStale}
          />
        </main>
        <AlertsSidebar 
          alerts={alerts} 
          patients={patients} 
          onSelectPatient={handleSelectAlert} 
          isOpen={isAlertsOpen}
          onToggle={() => setIsAlertsOpen(!isAlertsOpen)}
        />
      </div>
    </div>
  );
}

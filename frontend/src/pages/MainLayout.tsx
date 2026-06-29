/**
 * Main Layout — wraps the dashboard content with patient list sidebar and alerts sidebar.
 */
import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useWebSocket } from "../hooks/useWebSocket";
import PatientList from "../components/PatientList";
import AlertsSidebar from "../components/AlertsSidebar";
import { isPatientActive } from "../types";
import "./Dashboard.css"; // Reuse existing styles

export default function MainLayout() {
  const { patients, alerts, connected, lastMessageAt } = useWebSocket();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Extract patient ID from path if present (/patient/:id)
  const pathParts = location.pathname.split("/");
  const isPatientRoute = pathParts[1] === "patient" && pathParts[2];
  const selectedId = isPatientRoute ? pathParts[2] : null;

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

  // Redirect to root on manual page reload
  useEffect(() => {
    if (location.pathname !== "/" && location.pathname !== "/callback") {
      navigate("/");
    }
  }, []);

  const [now, setNow] = useState(Date.now());
  const [tokenRemaining, setTokenRemaining] = useState<number>(0);
  const [tokenPercentage, setTokenPercentage] = useState<number>(100);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const expiresAtStr = sessionStorage.getItem("smart_expires_at");
    const expiresInStr = sessionStorage.getItem("smart_expires_in");
    
    if (!expiresAtStr || !expiresInStr) {
      // Fallback if not set by callback (e.g. legacy/testing sandbox)
      const mockExpiresIn = 3600;
      const mockExpiresAt = Date.now() + mockExpiresIn * 1000;
      sessionStorage.setItem("smart_expires_in", mockExpiresIn.toString());
      sessionStorage.setItem("smart_expires_at", mockExpiresAt.toString());
    }
  }, []);

  useEffect(() => {
    if (selectedId) {
      sessionStorage.setItem("smart_patient_context", selectedId);
    } else if (location.pathname === "/" || location.pathname === "/register") {
      sessionStorage.removeItem("smart_patient_context");
    }
  }, [selectedId, location.pathname]);

  useEffect(() => {
    const timer = setInterval(() => {
      const expiresAt = parseInt(sessionStorage.getItem("smart_expires_at") || "0", 10);
      const expiresIn = parseInt(sessionStorage.getItem("smart_expires_in") || "3600", 10);
      
      if (expiresAt > 0) {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          clearInterval(timer);
          // Token expired! Reauthenticate.
          const savedContext = sessionStorage.getItem("smart_patient_context");
          const smartIss = sessionStorage.getItem("smart_iss");
          const smartLaunch = sessionStorage.getItem("smart_launch");
          
          sessionStorage.clear();
          
          if (savedContext) {
            sessionStorage.setItem("smart_patient_context", savedContext);
          }
          if (smartIss) {
            sessionStorage.setItem("smart_iss", smartIss);
          }
          if (smartLaunch) {
            sessionStorage.setItem("smart_launch", smartLaunch);
          }
          sessionStorage.setItem("smart_auto_launch", "true");
          
          window.location.href = "/launch";
          return;
        }
        const pct = Math.max(0, Math.min(100, (remaining / (expiresIn * 1000)) * 100));
        setTokenRemaining(Math.ceil(remaining / 1000));
        setTokenPercentage(pct);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTokenTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isDataStale = !isPatientActive(selectedPatient, now);

  const handleSelectAlert = (pid: string, _vitalType: string) => {
    navigate(`/patient/${pid}`);
    if (window.innerWidth <= 768) setIsSidebarOpen(false); // auto-close on mobile
  };

  const handlePatientSelect = (pid: string) => {
    navigate(`/patient/${pid}`);
    if (window.innerWidth <= 768) setIsSidebarOpen(false); // auto-close on mobile
  };

  return (
    <div className="dashboard" id="dashboard-page">
      {/* Header */}
      <header className="dashboard__header">
        <div className="dashboard__brand">
          <button 
            className="dashboard__home-btn" 
            onClick={() => navigate("/")}
            title="Home Bed Dashboard"
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--slate-400)', 
              cursor: 'pointer', 
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.2s',
              marginRight: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--blue-500)';
              e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--slate-400)';
              e.currentTarget.style.background = 'none';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>

          <div className="dashboard__logo" onClick={() => navigate("/")} style={{cursor: "pointer", display: 'flex', alignItems: 'center'}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1 className="dashboard__title" onClick={() => navigate("/")} style={{cursor: "pointer"}}>
            <span className="dashboard__title-word">Clinical</span>{" "}
            <span className="dashboard__title-word">RPM</span>{" "}
            <span className="dashboard__title-word">Monitor</span>
          </h1>
        </div>
        <div className="dashboard__status" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {sessionStorage.getItem("smart_access_token") && (
            <div className="dashboard__cerner-status-wrapper" style={{
              display: 'inline-flex',
              padding: '1.5px',
              borderRadius: '20px',
              background: `conic-gradient(#10b981 ${tokenPercentage}%, rgba(255, 255, 255, 0.12) ${tokenPercentage}% 100%)`,
              transition: 'background 0.5s ease'
            }}
            title={`Token expires in ${formatTokenTime(tokenRemaining)} (auto-reauthenticating)`}
            >
              <div style={{
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                padding: '5px 12px',
                borderRadius: '18.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)'
              }}>
                <span className="dashboard__cerner-text" style={{ fontSize: '11px', fontWeight: 700, color: '#0077c8', letterSpacing: '0.5px', display: 'flex', alignItems: 'center' }}>
                  <span className="dashboard__cerner-text-full">CONNECTED | CERNER MILLENNIUM</span>
                  <span className="dashboard__cerner-text-short">CERNER</span>
                </span>
                <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                  ({Math.ceil(tokenRemaining / 60)}m)
                </span>
              </div>
            </div>
          )}

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
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        />
        <main className="dashboard__main" style={{ overflowY: "auto" }}>
          {/* Render child routes here */}
          <Outlet context={{ patients, connected, isDataStale }} />
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

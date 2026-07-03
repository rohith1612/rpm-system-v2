import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import PatientDrawer from './PatientDrawer';
import StatusBar from './StatusBar';
import AlertsRail from './AlertsRail';
import { useUiStore } from '../store/uiStore';
import './Shell.css';

export default function Shell() {
  const { theme } = useUiStore();
  const navigate = useNavigate();
  const token = sessionStorage.getItem("smart_access_token");

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleDemoLaunch = () => {
    const mockExpiresIn = 3600;
    const mockExpiresAt = Date.now() + mockExpiresIn * 1000;
    sessionStorage.setItem("smart_access_token", "mock_offline_demo_token");
    sessionStorage.setItem("smart_patient_id", "12724066");
    sessionStorage.setItem("smart_fhir_base_url", "https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d");
    sessionStorage.setItem("smart_expires_in", mockExpiresIn.toString());
    sessionStorage.setItem("smart_expires_at", mockExpiresAt.toString());
    window.location.reload();
  };

  if (!token) {
    return (
      <div className="gate-screen">
        <div className="gate-container">
          <div className="gate-icon-container">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <circle cx="12" cy="11" r="3" />
              <path d="M12 14v4" />
            </svg>
          </div>
          <h1 className="gate-title disp">SESSIONS OFFLINE</h1>
          <p className="gate-description">
            The Remote Patient Monitoring dashboard is disconnected. Interfacing with active ICU telemetry feeds requires an active Cerner EHR session context.
          </p>
          <div className="gate-actions">
            <button className="solid-btn accent" onClick={() => navigate("/launch")}>
              Launch SMART on FHIR Handshake
            </button>
            <button className="ghost-btn" onClick={handleDemoLaunch}>
              Bypass / Offline Demo Mode
            </button>
          </div>
          <div className="gate-meta mono">
            STATUS_CODE: ERR_AUTH_REQUIRED &middot; FHIR_VERSION: R4
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell-wrapper" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <StatusBar />
      
      <div className="shell" style={{ flex: 1, minHeight: 0 }}>
        <Sidebar />
        <PatientDrawer />
        
        <div className="main">
          <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
            {/* Outlet renders either IcuFloor or PatientMonitor */}
            <Outlet />
            
            <AlertsRail />
          </div>
        </div>
      </div>
    </div>
  );
}

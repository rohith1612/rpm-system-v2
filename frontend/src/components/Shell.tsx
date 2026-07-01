import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import PatientDrawer from './PatientDrawer';
import StatusBar from './StatusBar';
import AlertsRail from './AlertsRail';
import { useUiStore } from '../store/uiStore';

export default function Shell() {
  const { theme } = useUiStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="shell">
      <Sidebar />
      <PatientDrawer />
      
      <div className="main">
        <StatusBar />
        
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Outlet renders either IcuFloor or PatientMonitor */}
          <Outlet />
          
          <AlertsRail />
        </div>
      </div>
    </div>
  );
}

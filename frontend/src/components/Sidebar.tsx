import { useLocation, useNavigate } from 'react-router-dom';
import { useUiStore } from '../store/uiStore';
import { useWebSocket } from '../hooks/useWebSocket';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme, toggleDrawer, toggleAlertsRail } = useUiStore();
  const { alerts } = useWebSocket();

  const isFloor = location.pathname === '/';

  return (
    <div className="rail">
      <div 
        className={`rail-logo ${isFloor ? 'rail-active' : ''}`} 
        title="ICU floor"
        onClick={() => navigate('/')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
      <div className="rail-divider"></div>
      <div 
        className={`rail-icon ${!isFloor ? 'active' : ''}`} 
        title="Patients"
        onClick={toggleDrawer}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      </div>
      <div 
        className="rail-icon" 
        style={{ position: 'relative' }}
        title="Alerts"
        onClick={toggleAlertsRail}
      >
        {alerts.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: 'var(--red)',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 'bold',
            borderRadius: '50%',
            width: '14px',
            height: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {alerts.length}
          </div>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </div>
      <div className="rail-bottom">
        <div className="theme-switch" title="Toggle theme" onClick={toggleTheme}>
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

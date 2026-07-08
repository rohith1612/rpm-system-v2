import { useEffect, useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { refreshAccessToken } from '../utils/fhir';
import { isDemoMode } from '../api';

export default function StatusBar() {
  const { theme, toggleTheme } = useUiStore();
  const { connected } = useWebSocket();
  const [timeStr, setTimeStr] = useState('');
  const [expiryMins, setExpiryMins] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      let h = d.getHours();
      const m = d.getMinutes();
      const s = d.getSeconds();
      const ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      setTimeStr(`${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} ${ap}`);

      // Calculate token expiration
      const expiresAtStr = sessionStorage.getItem("smart_expires_at");
      if (expiresAtStr) {
        const expiresAt = parseInt(expiresAtStr, 10);
        const diffMs = expiresAt - Date.now();
        
        if (diffMs <= 0) {
          // Token has expired! Clean context and trigger auto-relaunch
          sessionStorage.removeItem("smart_access_token");
          sessionStorage.removeItem("smart_refresh_in_progress");
          sessionStorage.setItem("smart_auto_launch", "true");
          window.location.href = "/launch";
          return;
        }

        // Refresh token if about to expire (less than 5 minutes / 300000ms remaining)
        if (diffMs <= 300000 && !sessionStorage.getItem("smart_refresh_in_progress")) {
          sessionStorage.setItem("smart_refresh_in_progress", "true");
          const token = sessionStorage.getItem("smart_access_token");
          const refreshToken = sessionStorage.getItem("smart_refresh_token");
          
          if (token === "mock_offline_demo_token") {
            // Offline demo mode: silently auto-extend mock token
            const mockExpiresIn = 3600;
            const mockExpiresAt = Date.now() + mockExpiresIn * 1000;
            sessionStorage.setItem("smart_expires_at", mockExpiresAt.toString());
            sessionStorage.removeItem("smart_refresh_in_progress");
            console.log("[Auth] Mock token auto-extended.");
          } else if (refreshToken) {
            refreshAccessToken(refreshToken).then((newTokens) => {
              sessionStorage.setItem("smart_access_token", newTokens.access_token);
              if (newTokens.refresh_token) {
                sessionStorage.setItem("smart_refresh_token", newTokens.refresh_token);
              }
              const newExpiresIn = newTokens.expires_in || 3600;
              const newExpiresAt = Date.now() + newExpiresIn * 1000;
              sessionStorage.setItem("smart_expires_in", newExpiresIn.toString());
              sessionStorage.setItem("smart_expires_at", newExpiresAt.toString());
              sessionStorage.removeItem("smart_refresh_in_progress");
              console.log("[Auth] Session token refreshed successfully.");
            }).catch((err) => {
              console.error("[Auth] Token refresh failed:", err);
              sessionStorage.removeItem("smart_refresh_in_progress");
            });
          } else {
            sessionStorage.removeItem("smart_refresh_in_progress");
          }
        }
        
        const diffMins = Math.max(0, Math.ceil(diffMs / 60000));
        setExpiryMins(diffMins);
      } else {
        setExpiryMins(null);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <img className="cerner-brand-logo" src="/favicon.svg" alt="Oracle Cerner Logo" />
        <span className="brand-word">RPM MONITOR</span>
        {isDemoMode() ? (
          <span className="sb-item conn-bad">
            CERNER MILLENNIUM <span className="v">DEMO MODE</span>
          </span>
        ) : connected ? (
          <span className="sb-item conn-ok">
            <span className="blip"></span> CERNER MILLENNIUM <span className="v">CONNECTED</span>
          </span>
        ) : (
          <span className="sb-item conn-bad">
            CERNER MILLENNIUM <span className="v">DISCONNECTED</span>
          </span>
        )}
      </div>
      <div className="statusbar-right">
        <span className="sb-item">
          {timeStr}
          {expiryMins !== null && (
            <span className="token-expiry-badge" title="OAuth Session Remaining Time">
              {expiryMins}m
            </span>
          )}
        </span>
        {connected ? (
          <span className="live-tag">
            <span className="blip"></span>LIVE
          </span>
        ) : (
          <span className="live-tag stale-tag">
            OFFLINE
          </span>
        )}
        <div className="mode-switch" title="Switch DAY / NIGHT mode" onClick={toggleTheme}>
          <span className={`mode-label ${theme === 'light' ? 'on' : ''}`}>DAY</span>
          <span className="mode-track">
            <span className="mode-knob">
              {theme === 'light' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              )}
            </span>
          </span>
          <span className={`mode-label ${theme === 'dark' ? 'on' : ''}`}>NIGHT</span>
        </div>
      </div>
    </div>
  );
}

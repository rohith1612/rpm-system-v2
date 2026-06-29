import { useState, useEffect, useMemo } from "react";
import type { ActiveAlert, Patient } from "../types";
import { getVitalLabel } from "../types";
import "./AlertsSidebar.css";

interface Props {
  alerts: ActiveAlert[];
  patients: Record<string, Patient>;
  onSelectPatient: (patientId: string, vitalType: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function AlertsSidebar({ alerts, patients, onSelectPatient, isOpen, onToggle }: Props) {
  const [now, setNow] = useState(Date.now());

  // Update "now" every second so durations tick live
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (startedAt: number) => {
    const diff = Math.floor((now - startedAt) / 1000);
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getLabel = (key: string) => getVitalLabel(key);
  const getFirstName = (pid: string) => {
    const fullName = patients[pid]?.name;
    if (!fullName) return "";
    return fullName.split(" ")[0];
  };

  const groupedAlerts = useMemo(() => {
    const groups: Record<string, ActiveAlert[]> = {};
    alerts.forEach(a => {
      if (!groups[a.patient_id]) groups[a.patient_id] = [];
      groups[a.patient_id].push(a);
    });
    // Sort patients: critical patients first, then by longest active alert
    return Object.entries(groups).sort(([, a], [, b]) => {
      const aCrit = a.some(x => x.severity === "critical");
      const bCrit = b.some(x => x.severity === "critical");
      if (aCrit && !bCrit) return -1;
      if (!aCrit && bCrit) return 1;
      
      const aMaxDur = Math.min(...a.map(x => x.started_at));
      const bMaxDur = Math.min(...b.map(x => x.started_at));
      return aMaxDur - bMaxDur;
    });
  }, [alerts]);

  const highestSeverity = useMemo(() => {
    if (alerts.length === 0) return null;
    return alerts.some(a => a.severity === "critical") ? "critical" : "warning";
  }, [alerts]);

  return (
    <div className="alerts-sidebar-container">
      {!isOpen && (
        <button 
          className={`alerts-sidebar__toggle ${highestSeverity ? `alerts-sidebar__toggle--pulse-${highestSeverity}` : ""}`}
          onClick={onToggle}
          title="Open Alerts Panel"
        >
          {alerts.length > 0 && (
            <span className="alerts-sidebar__badge">{alerts.length}</span>
          )}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      )}

      <aside className={`alerts-sidebar ${!isOpen ? "alerts-sidebar--closed" : ""}`}>
        <div className="alerts-sidebar__header">
          <h2 className="alerts-sidebar__title">System Alerts</h2>
          <button 
            onClick={onToggle}
            className="alerts-sidebar__close-btn"
            title="Collapse Alerts Panel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
        {alerts.length === 0 ? (
          <p className="alerts-sidebar__empty">No active alerts.</p>
        ) : (
          <div className="alerts-sidebar__list">
            {groupedAlerts.map(([patientId, patientAlerts]) => {
              const firstName = getFirstName(patientId);
              const isCritical = patientAlerts.some(a => a.severity === "critical");

              return (
                <div 
                  key={patientId}
                  className={`alerts-sidebar__group alerts-sidebar__group--${isCritical ? "critical" : "warning"}`}
                >
                  <div className="alerts-sidebar__group-header">
                    <span className="alerts-sidebar__group-pid">{firstName} ({patientId})</span>
                  </div>
                  
                  <div className="alerts-sidebar__group-alerts">
                    {patientAlerts.map(alert => {
                      const vals = alert.recent_values || [];
                      const min = vals.length ? Math.min(...vals) : 0;
                      const max = vals.length ? Math.max(...vals) : 0;
                      const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;

                      return (
                        <div
                          key={alert.vital_type}
                          className={`alerts-sidebar__item alerts-sidebar__item--${alert.severity}`}
                          onClick={() => onSelectPatient(alert.patient_id, alert.vital_type)}
                        >
                          <div className="alerts-sidebar__item-main">
                            <div className="alerts-sidebar__item-vital">
                              {getLabel(alert.vital_type)}
                            </div>
                            <div className="alerts-sidebar__item-msg">
                              {alert.message}
                            </div>
                          </div>

                          <div className="alerts-sidebar__item-duration">
                            {formatDuration(alert.started_at)}
                          </div>

                          {/* Hover Details */}
                          <div className="alerts-sidebar__item-details">
                            <div className="alerts-sidebar__stats">
                              <span>Min: {min % 1 === 0 ? min : min.toFixed(1)}</span>
                              <span>Max: {max % 1 === 0 ? max : max.toFixed(1)}</span>
                              <span>Avg: {avg.toFixed(1)}</span>
                            </div>
                            <div className="alerts-sidebar__recent-list">
                              Recent: {alert.recent_values.join(" → ")}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}

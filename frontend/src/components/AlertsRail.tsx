import { useUiStore } from '../store/uiStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAppStore } from '../store/vitalsStore';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';

export default function AlertsRail() {
  const { alertsRailOpen } = useUiStore();
  const { alerts } = useWebSocket();
  const patients = useAppStore(state => state.patients);
  const navigate = useNavigate();

  const groupedAlerts = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const alert of alerts) {
      if (!groups[alert.patient_id]) groups[alert.patient_id] = [];
      groups[alert.patient_id].push(alert);
    }
    return groups;
  }, [alerts]);

  if (!alertsRailOpen) return null;

  return (
    <div className="alerts-rail">
      <div className="alerts-rail-head">System Alerts <span>&rsaquo;</span></div>
      
      {Object.keys(groupedAlerts).length === 0 ? (
        <div className="alert-empty">NO ACTIVE ALERTS</div>
      ) : (
        Object.keys(groupedAlerts).map(patientId => {
          const patientAlerts = groupedAlerts[patientId];
          const patientName = patients[patientId]?.name || `Patient ${patientId}`;
          const isCritical = patientAlerts.some(a => a.severity === 'critical');
          
          return (
            <div 
              key={patientId} 
              className="alert-row"
              style={{
                borderLeftColor: isCritical ? 'var(--red)' : 'var(--amber)',
                backgroundColor: isCritical ? 'var(--red-dim)' : 'var(--amber-dim)',
                cursor: 'pointer'
              }}
              onClick={() => navigate(`/patient/${patientId}`)}
            >
              <div className="t" style={{ fontSize: '13px', fontWeight: 'bold' }}>{patientName}</div>
              
              {patientAlerts.map(alert => (
                <div key={alert.vital_type} style={{ marginTop: '8px' }}>
                  <div className="d" style={{ fontWeight: 600, color: alert.severity === 'warning' ? 'var(--amber)' : 'var(--red)' }}>
                    {alert.vital_type.replace('_', ' ').toUpperCase()} - {alert.severity.toUpperCase()}
                  </div>
                  <div className="d" style={{ color: alert.severity === 'warning' ? 'var(--amber)' : 'var(--red)', marginTop: '2px' }}>
                    {alert.message}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

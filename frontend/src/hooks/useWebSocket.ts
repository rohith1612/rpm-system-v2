/**
 * WebSocket hook for real-time vitals streaming.
 * Auto-reconnects on disconnect.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import type { Patient, ActiveAlert, WebSocketMessage } from "../types";
import { VITAL_CONFIGS, getVitalStatus, SYS_BP_CONFIG, DIA_BP_CONFIG, isPatientActive } from "../types";
import { fetchPatients } from "../api";
import { addLocalVitalPoint } from "../utils/localHistory";
import { useAppStore } from "../store/vitalsStore";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";
const RECONNECT_DELAY = 3000;

export function useWebSocket() {
  const [patients, setPatients] = useState<Record<string, Patient>>({});
  const [alertsMap, setAlertsMap] = useState<Record<string, ActiveAlert>>({});
  const [connected, setConnected] = useState(false);
  const [lastMessageAt, setLastMessageAt] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const patientsRef = useRef<Record<string, Patient>>({});

  useEffect(() => {
    patientsRef.current = patients;
  }, [patients]);

  // Seed patients list from database on mount to prevent loading state on hot reload/refresh
  useEffect(() => {
    fetchPatients()
      .then((data) => {
        setPatients((prev) => {
          const dict = { ...prev };
          if (Array.isArray(data)) {
            data.forEach((p: Patient) => {
              if (!dict[p.id]) {
                dict[p.id] = {
                  ...p,
                  recent_hr: []
                };
              } else {
                dict[p.id] = {
                  ...p,
                  ...dict[p.id]
                };
              }
            });
          }
          return dict;
        });
      })
      .catch((err) => console.error("Failed to seed initial patients:", err));
  }, []);

  useEffect(() => {
    // Automatically clear alerts for patients who have gone offline (30s buffer)
    const cleanupTimer = setInterval(() => {
      setAlertsMap((prev) => {
        let changed = false;
        const next = { ...prev };
        const now = Date.now();
        
        for (const [key, alert] of Object.entries(next)) {
          const p = patientsRef.current[alert.patient_id];
          if (!p) continue;
          
          const lastRecorded = p.recorded_at ? new Date(p.recorded_at).getTime() : 0;
            
          if (now - lastRecorded > 30000) { // 30 seconds buffer
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(cleanupTimer);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        return;
      }
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setLastMessageAt(Date.now());
      console.log("[WS] Connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data);
        // M3: Track last message time for stale-data detection
        setLastMessageAt(Date.now());

        if (msg.type === "snapshot") {
          setPatients(msg.data);
        } else if (msg.type === "vitals") {
          // Always use browser local time for live updates to guarantee sync with Date.now() and avoid clock drift
          const recorded_at = new Date().toISOString();

          // Log in-memory browser cache for charts
          addLocalVitalPoint(msg.patient_id, {
            heart_rate: msg.heart_rate,
            spo2: msg.spo2,
            temperature: msg.temperature,
            respiratory_rate: msg.respiratory_rate,
            systolic_bp: msg.systolic_bp,
            diastolic_bp: msg.diastolic_bp,
            recorded_at,
          });

          setPatients((prev) => {
            const existing = prev[msg.patient_id];
            const prevHr = existing?.recent_hr || [];
            const newHr = msg.heart_rate !== null ? [...prevHr, msg.heart_rate].slice(-30) : prevHr;

            return {
              ...prev,
              [msg.patient_id]: {
                ...existing,
                id: msg.patient_id,
                name: existing?.name || `Patient ${msg.patient_id}`,
                heart_rate: msg.heart_rate,
                spo2: msg.spo2,
                temperature: msg.temperature,
                respiratory_rate: msg.respiratory_rate,
                systolic_bp: msg.systolic_bp,
                diastolic_bp: msg.diastolic_bp,
                recorded_at,
                recent_hr: newHr,
              },
            };
          });
          
          useAppStore.getState().addVitalReading(msg.patient_id, {
            heart_rate: msg.heart_rate,
            spo2: msg.spo2,
            temperature: msg.temperature,
            respiratory_rate: msg.respiratory_rate,
            systolic_bp: msg.systolic_bp,
            diastolic_bp: msg.diastolic_bp,
            recorded_at,
          });

          // Auto-clear alerts if vitals return to normal
          setAlertsMap((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const cfg of VITAL_CONFIGS) {
              if (cfg.key === "blood_pressure") {
                const sysVal = msg.systolic_bp;
                if (sysVal !== null && sysVal !== undefined) {
                  const status = getVitalStatus(SYS_BP_CONFIG, sysVal);
                  const alertKey = `${msg.patient_id}-systolic_bp`;
                  if (status === "normal" && next[alertKey]) {
                    delete next[alertKey];
                    changed = true;
                  }
                }
                const diaVal = msg.diastolic_bp;
                if (diaVal !== null && diaVal !== undefined) {
                  const status = getVitalStatus(DIA_BP_CONFIG, diaVal);
                  const alertKey = `${msg.patient_id}-diastolic_bp`;
                  if (status === "normal" && next[alertKey]) {
                    delete next[alertKey];
                    changed = true;
                  }
                }
              } else {
                const val = (msg as any)[cfg.key];
                if (val !== null && val !== undefined) {
                  const status = getVitalStatus(cfg, val);
                  const alertKey = `${msg.patient_id}-${cfg.key}`;
                  if (status === "normal" && next[alertKey]) {
                    delete next[alertKey];
                    changed = true;
                  }
                }
              }
            }
            return changed ? next : prev;
          });
        } else if (msg.type === "alert") {
          setAlertsMap((prev) => {
            const key = `${msg.patient_id}-${msg.vital_type}`;
            const existing = prev[key];
            return {
              ...prev,
              [key]: {
                patient_id: msg.patient_id,
                vital_type: msg.vital_type,
                severity: msg.severity,
                message: msg.message,
                started_at: existing ? existing.started_at : Date.now(),
                recent_values: existing
                  ? [...existing.recent_values, msg.value].slice(-5)
                  : [msg.value]
              }
            };
          });
          
          useAppStore.getState().addAlert({
            patient_id: msg.patient_id,
            vital_type: msg.vital_type,
            severity: msg.severity,
            message: msg.message,
            value: msg.value,
            created_at: new Date().toISOString()
          });
        } else if (msg.type === "ecg") {
          setPatients((prev) => {
            const existing = prev[msg.patient_id];
            if (!existing) return prev;
            return {
              ...prev,
              [msg.patient_id]: {
                ...existing,
                ecg: {
                  heart_rate: msg.heart_rate,
                  pr_interval: msg.pr_interval,
                  qrs_duration: msg.qrs_duration,
                  qt_interval: msg.qt_interval,
                  qtc_interval: msg.qtc_interval,
                  st_offset: msg.st_offset,
                  rhythm: msg.rhythm,
                },
              },
            };
          });
          
          useAppStore.getState().setLatestEcg(msg.patient_id, {
            heart_rate: msg.heart_rate,
            pr_interval: msg.pr_interval,
            qrs_duration: msg.qrs_duration,
            qt_interval: msg.qt_interval,
            qtc_interval: msg.qtc_interval,
            st_offset: msg.st_offset,
            rhythm: msg.rhythm,
          });
        }
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("[WS] Disconnected, reconnecting...");
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(connect, RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Monitor connection health to detect and recover from hung sockets
  useEffect(() => {
    const healthCheck = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const hasActivePatients = Object.values(patientsRef.current).some(p => isPatientActive(p));
        const now = Date.now();
        if (hasActivePatients && lastMessageAt > 0 && (now - lastMessageAt) > 15000) {
          console.warn("[WS] Connection hung (no messages for 15s), forcing reconnect...");
          wsRef.current.close();
        }
      }
    }, 5000);
    return () => clearInterval(healthCheck);
  }, [lastMessageAt]);

  const activeAlerts = Object.values(alertsMap).sort((a, b) => {
    if (a.severity === "critical" && b.severity === "warning") return -1;
    if (a.severity === "warning" && b.severity === "critical") return 1;
    return b.started_at - a.started_at;
  });

  return { patients, alerts: activeAlerts, connected, lastMessageAt };
}

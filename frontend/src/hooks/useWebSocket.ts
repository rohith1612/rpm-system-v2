/**
 * WebSocket hook for real-time vitals streaming.
 * Auto-reconnects on disconnect.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import type { Patient, ActiveAlert, WebSocketMessage } from "../types";
import { VITAL_CONFIGS, getVitalStatus } from "../types";

const WS_URL = "ws://localhost:8000/ws";
const RECONNECT_DELAY = 3000;

export function useWebSocket() {
  const [patients, setPatients] = useState<Record<string, Patient>>({});
  const [alertsMap, setAlertsMap] = useState<Record<string, ActiveAlert>>({});
  const [connected, setConnected] = useState(false);
  const [lastMessageAt, setLastMessageAt] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
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
                recorded_at: msg.recorded_at
                  ? new Date(msg.recorded_at * 1000).toISOString()
                  : new Date().toISOString(),
                recent_hr: newHr,
              },
            };
          });

          // Auto-clear alerts if vitals return to normal
          setAlertsMap((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const cfg of VITAL_CONFIGS) {
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
        }
      } catch (e) {
        console.error("[WS] Parse error:", e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log("[WS] Disconnected, reconnecting...");
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
      wsRef.current?.close();
    };
  }, [connect]);

  const activeAlerts = Object.values(alertsMap).sort((a, b) => {
    if (a.severity === "critical" && b.severity === "warning") return -1;
    if (a.severity === "warning" && b.severity === "critical") return 1;
    return b.started_at - a.started_at;
  });

  return { patients, alerts: activeAlerts, connected, lastMessageAt };
}

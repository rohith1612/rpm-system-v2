import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Patient, VitalKey } from "../types";
import { VITAL_CONFIGS } from "../types";
import { fetchPatientHistory } from "../api";
import "./HistoryModal.css";

interface Props {
  patient: Patient;
  selectedVital: VitalKey;
  onClose: () => void;
}

const LINE_COLORS: Record<string, string> = {
  heart_rate: "#d73a49",
  spo2: "#0366d6",
  temperature: "#f66a0a",
  respiratory_rate: "#28a745",
  systolic_bp: "#d73a49",
  diastolic_bp: "#0366d6",
};

export default function HistoryModal({ patient, selectedVital: initialVital, onClose }: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [activeVital, setActiveVital] = useState<VitalKey>(initialVital);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isActive = true;
    async function loadData() {
      setLoading(true);
      try {
        const result = await fetchPatientHistory(patient.id, date, hour);
        if (isActive) {
          const rawData = result.map((d: any) => ({
            ...d,
            timestampMs: new Date(d.recorded_at).getTime()
          }));

          const processedData: any[] = [];
          for (let i = 0; i < rawData.length; i++) {
            const current = rawData[i];
            if (i > 0) {
              const prev = rawData[i - 1];
              // 1-minute resolution, so any gap > 65s means missing data
              if (current.timestampMs - prev.timestampMs > 65000) {
                processedData.push({
                  timestampMs: prev.timestampMs + 1000,
                  heart_rate: null,
                  spo2: null,
                  temperature: null,
                  respiratory_rate: null,
                  systolic_bp: null,
                  diastolic_bp: null
                });
              }
            }
            processedData.push(current);
          }
          setData(processedData);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isActive) setLoading(false);
      }
    }
    loadData();
    return () => { isActive = false; };
  }, [patient.id, date, hour]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const config = VITAL_CONFIGS.find((c) => c.key === activeVital);

  // Fixed domain: always show the full hour on the X-axis
  const hourStart = new Date(`${date}T${hour.toString().padStart(2, "0")}:00:00`).getTime();
  const hourEnd = hourStart + 60 * 60 * 1000;

  return (
    <div className="history-modal-backdrop">
      <div className="history-modal">
        <div className="history-modal__header">
          <div>
            <h2>Historical Analysis: {patient.name}</h2>
            <p>1-Hour Aggregated View (1-minute resolution)</p>
          </div>
          <button className="history-modal__close" onClick={onClose}>&times;</button>
        </div>

        <div className="history-modal__controls">
          <div className="history-modal__control-group">
            <label>Date</label>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
            />
          </div>
          <div className="history-modal__control-group">
            <label>Hour</label>
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }).map((_, i) => {
                // M6: Hide future hours when today is selected
                const isToday = date === new Date().toISOString().split("T")[0];
                if (isToday && i > new Date().getHours()) return null;
                return (
                  <option key={i} value={i}>
                    {i.toString().padStart(2, "0")}:00 - {((i + 1) % 24).toString().padStart(2, "0")}:00
                  </option>
                );
              })}
            </select>
          </div>

          {/* Vital Sign Toggle */}
          <div className="history-modal__vital-toggle">
            <label>Vital Sign</label>
            <div className="history-modal__vital-btns">
              {VITAL_CONFIGS.map((cfg) => (
                <button
                  key={cfg.key}
                  className={`history-modal__vital-btn ${activeVital === cfg.key ? "history-modal__vital-btn--active" : ""}`}
                  onClick={() => setActiveVital(cfg.key)}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="history-modal__body">
          {loading ? (
            <div className="history-modal__status">
              <div className="history-modal__spinner"></div>
              <p>Fetching aggregated history...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="history-modal__status">
              <p>No telemetry data available for this hour.</p>
            </div>
          ) : (
            <div style={{ width: '100%', height: '400px', minWidth: 0, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e1e4e8" />
                  <XAxis
                    dataKey="timestampMs"
                    type="number"
                    domain={[hourStart, hourEnd]}
                    tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    stroke="#6a737d"
                    tick={{ fill: "#586069", fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#6a737d"
                    tick={{ fill: "#586069", fontSize: 11 }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    labelFormatter={(unixTime) => new Date(unixTime as number).toLocaleTimeString()}
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e1e4e8",
                      borderRadius: 6,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                    }}
                  />
                  {activeVital === "blood_pressure" ? (
                    <>
                      <Line
                        type="monotone"
                        dataKey="systolic_bp"
                        stroke={LINE_COLORS.systolic_bp || "#d73a49"}
                        strokeWidth={2}
                        dot={true}
                        connectNulls={false}
                        name="Systolic BP"
                      />
                      <Line
                        type="monotone"
                        dataKey="diastolic_bp"
                        stroke={LINE_COLORS.diastolic_bp || "#0366d6"}
                        strokeWidth={2}
                        dot={true}
                        connectNulls={false}
                        name="Diastolic BP"
                      />
                    </>
                  ) : (
                    <Line
                      type="monotone"
                      dataKey={activeVital}
                      stroke={LINE_COLORS[activeVital] || "#0366d6"}
                      strokeWidth={2}
                      dot={true}
                      connectNulls={false}
                      name={`${config?.label || ""} (${config?.unit || ""})`}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

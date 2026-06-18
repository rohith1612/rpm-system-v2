/**
 * VitalChart — historical line chart for a selected vital sign.
 * Uses recharts for rendering with smooth live WebSocket updates.
 */
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchPatientVitals } from "../api";
import type { Patient, VitalKey } from "../types";
import { VITAL_CONFIGS } from "../types";
import "./VitalChart.css";

interface Props {
  patient: Patient | null;
  selectedVital: VitalKey;
  onSelectVital: (vital: VitalKey) => void;
}

const TIME_RANGES = [
  { label: "5m", minutes: 5 },
  { label: "15m", minutes: 15 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
];

const LINE_COLORS: Record<string, string> = {
  heart_rate: "#d73a49",
  spo2: "#0366d6",
  temperature: "#f66a0a",
  respiratory_rate: "#28a745",
  systolic_bp: "#d73a49",
  diastolic_bp: "#0366d6",
};

export default function VitalChart({ patient, selectedVital, onSelectVital }: Props) {
  const [timeRange, setTimeRange] = useState(5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const patientId = patient?.id;

  // H5: Escape key closes fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  useEffect(() => {
    if (!patientId) return;

    let isActive = true;
    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const history = await fetchPatientVitals(patientId!, timeRange, null);
        if (isActive) {
          setData(history.map((d: any) => ({
            ...d,
            timestampMs: new Date(d.recorded_at).getTime()
          })));
        }
      } catch {
        // Backend may not be ready yet
      } finally {
        if (isActive) setLoadingHistory(false);
      }
    }

    loadHistory();
    return () => { isActive = false; };
  }, [patientId, timeRange]);

  useEffect(() => {
    if (!patient || !patient.recorded_at) return;

    const newTimestampMs = new Date(patient.recorded_at).getTime();

    setData(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.timestampMs < newTimestampMs) {
        return [...prev, {
          heart_rate: patient.heart_rate,
          spo2: patient.spo2,
          temperature: patient.temperature,
          respiratory_rate: patient.respiratory_rate,
          systolic_bp: patient.systolic_bp,
          diastolic_bp: patient.diastolic_bp,
          recorded_at: patient.recorded_at,
          timestampMs: newTimestampMs
        }];
      }
      return prev;
    });
  }, [patient]);

  if (!patient) return null;

  const config = VITAL_CONFIGS.find((c) => c.key === selectedVital);

  // Time window calculation
  const now = Date.now();
  const domainMax = now;
  const domainMin = domainMax - timeRange * 60 * 1000;

  // Filter data to the visible window
  const rawVisibleData = data.filter(d => d.timestampMs >= domainMin && d.timestampMs <= domainMax);

  // Inject null points for gaps > 5 seconds to break the line
  const visibleData: any[] = [];
  for (let i = 0; i < rawVisibleData.length; i++) {
    const current = rawVisibleData[i];
    if (i > 0) {
      const prev = rawVisibleData[i - 1];
      if (current.timestampMs - prev.timestampMs > 5000) {
        visibleData.push({
          timestampMs: prev.timestampMs + 1000,
          [selectedVital]: null
        });
      }
    }
    visibleData.push(current);
  }

  // Calculate statistics over visible data (ignoring nulls)
  const visibleValues = visibleData.map(d => d[selectedVital]).filter(v => v !== null && v !== undefined);
  let minVal = 0, maxVal = 0, avgVal = 0;
  if (visibleValues.length > 0) {
    minVal = Math.min(...visibleValues);
    maxVal = Math.max(...visibleValues);
    avgVal = visibleValues.reduce((sum, val) => sum + val, 0) / visibleValues.length;
  }

  // Custom tooltip to show all vitals at the hovered timestamp
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pointData = payload[0].payload;
      return (
        <div className="vital-chart__tooltip">
          <p className="vital-chart__tooltip-time">{new Date(label).toLocaleTimeString()}</p>
          <div className="vital-chart__tooltip-grid">
            {VITAL_CONFIGS.map(cfg => {
              const val = pointData[cfg.key];
              if (val === undefined || val === null) return null;
              const isSelected = cfg.key === selectedVital;
              return (
                <div key={cfg.key} className="vital-chart__tooltip-item">
                  <span className="vital-chart__tooltip-label" style={{ color: isSelected ? LINE_COLORS[cfg.key] : undefined }}>
                    {cfg.label}
                  </span>
                  <span className="vital-chart__tooltip-value">{val} {cfg.unit}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`vital-chart ${isFullscreen ? 'vital-chart--fullscreen' : ''}`} id="vital-chart-section">
      {/* Controls */}
      <div className="vital-chart__controls">
        <div className="vital-chart__vital-select">
          {VITAL_CONFIGS.map((cfg) => (
            <button
              key={cfg.key}
              className={`vital-chart__btn ${selectedVital === cfg.key ? "vital-chart__btn--active" : ""}`}
              onClick={() => onSelectVital(cfg.key)}
            >
              {cfg.label}
            </button>
          ))}
        </div>
        <div className="vital-chart__time-select">

          {TIME_RANGES.map((tr) => (
            <button
              key={tr.minutes}
              className={`vital-chart__time-btn ${timeRange === tr.minutes ? "vital-chart__time-btn--active" : ""}`}
              onClick={() => setTimeRange(tr.minutes)}
            >
              {tr.label}
            </button>
          ))}
          <button
            className="vital-chart__time-btn vital-chart__time-btn--expand"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? "Close" : "Expand"}
          </button>
        </div>
      </div>

      {/* Time Window Context */}
      <div className="vital-chart__time-window">
        Viewing: {new Date(domainMin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        {" \u2014 "}
        {new Date(domainMax).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        <span className="vital-chart__live-badge"> (Live)</span>
      </div>

      {/* Stats Summary */}
      {visibleValues.length > 0 && (
        <div className="vital-chart__stats">
          <div className="vital-chart__stat">
            <span className="vital-chart__stat-label">Min:</span>
            <span className="vital-chart__stat-value">{minVal % 1 === 0 ? minVal : minVal.toFixed(1)} {config?.unit}</span>
          </div>
          <div className="vital-chart__stat">
            <span className="vital-chart__stat-label">Max:</span>
            <span className="vital-chart__stat-value">{maxVal % 1 === 0 ? maxVal : maxVal.toFixed(1)} {config?.unit}</span>
          </div>
          <div className="vital-chart__stat">
            <span className="vital-chart__stat-label">Avg:</span>
            <span className="vital-chart__stat-value">{avgVal.toFixed(1)} {config?.unit}</span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="vital-chart__container">
        {loadingHistory ? (
          <div className="vital-chart__empty">
            <div className="vital-chart__spinner"></div>
            Loading history...
          </div>
        ) : visibleData.length === 0 ? (
          <div className="vital-chart__empty">
            No data available for this time period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visibleData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e1e4e8" />
              <XAxis
                dataKey="timestampMs"
                type="number"
                domain={[domainMin, domainMax]}
                stroke="#6a737d"
                tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
                tick={{ fill: "#586069", fontSize: 11 }}
              />
              <YAxis
                stroke="#6a737d"
                tick={{ fill: "#586069", fontSize: 11 }}
                domain={[
                  (dataMin: number) => Math.floor(dataMin * 0.95),
                  (dataMax: number) => Math.ceil(dataMax * 1.05)
                ]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey={selectedVital}
                stroke={LINE_COLORS[selectedVital] || "#0366d6"}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name={`${config?.label || ""} (${config?.unit || ""})`}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

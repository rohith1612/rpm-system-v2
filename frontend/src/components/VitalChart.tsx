/**
 * VitalChart — historical line chart for a selected vital sign in Argon style.
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
  heart_rate: "#6366f1", // indigo
  spo2: "#06b6d4", // cyan
  temperature: "#f59e0b", // amber
  respiratory_rate: "#10b981", // emerald
  systolic_bp: "#ec4899", // pink
  diastolic_bp: "#8b5cf6", // purple
};

export default function VitalChart({ patient, selectedVital, onSelectVital }: Props) {
  const [timeRange, setTimeRange] = useState(5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const patientId = patient?.id;

  // Escape key closes fullscreen
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

  // Custom tooltip styled like Argon
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const pointData = payload[0].payload;
      return (
        <div className="bg-white border-0 rounded-2xl shadow-xl p-4 text-xs font-sans text-slate-700 dark:text-white min-w-[150px] border-slate-100 dark:bg-transparent dark:border-white/10">
          <p className="font-bold text-slate-800 dark:text-white border-b border-slate-100 pb-1.5 mb-2">
            ⏱ {new Date(label).toLocaleTimeString()}
          </p>
          <div className="space-y-1.5">
            {VITAL_CONFIGS.map(cfg => {
              const val = pointData[cfg.key];
              if (val === undefined || val === null) return null;
              const isSelected = cfg.key === selectedVital;
              return (
                <div key={cfg.key} className="flex items-center justify-between gap-4">
                  <span className="font-medium text-slate-500 dark:text-white flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LINE_COLORS[cfg.key] }} />
                    {cfg.label}
                  </span>
                  <span className={`font-bold ${isSelected ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-white"}`}>
                    {val} <span className="text-[10px] font-normal text-slate-400 dark:text-white">{cfg.unit}</span>
                  </span>
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
    <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 p-6 flex flex-col transition-all ${
      isFullscreen 
        ? "fixed inset-4 z-[60] shadow-2xl dark:bg-slate-900" 
        : "shadow-sm hover:shadow-md h-[400px]"
    }`} id="vital-chart-section">
      
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-50 pb-4 mb-4">
        {/* Vital Select Pills */}
        <div className="flex flex-wrap gap-1 bg-slate-50 dark:bg-slate-700 p-1 rounded-xl">
          {VITAL_CONFIGS.filter(c => c.key !== 'diastolic_bp').map((cfg) => (
            <button
              key={cfg.key}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                (selectedVital === cfg.key || (selectedVital === 'diastolic_bp' && cfg.key === 'systolic_bp'))
                  ? "bg-white dark:bg-transparent dark:border-white/10 text-slate-800 dark:text-white shadow-sm" 
                  : "text-slate-400 dark:text-white hover:text-slate-600 dark:text-white dark:hover:text-slate-100 dark:text-white"
              }`}
              onClick={() => onSelectVital(cfg.key)}
            >
              {cfg.key === 'systolic_bp' ? "Blood Pressure" : cfg.label}
            </button>
          ))}
        </div>

        {/* Time select pills & expand */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl border border-transparent dark:border-slate-700">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.minutes}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
                  timeRange === tr.minutes 
                    ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm" 
                    : "text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
                onClick={() => setTimeRange(tr.minutes)}
              >
                {tr.label}
              </button>
            ))}
          </div>

          <button
            className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold transition-colors flex items-center gap-1"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? (
              <>
                <span>✕</span> Close
              </>
            ) : (
              <>
                <span>⛶</span> Expand
              </>
            )}
          </button>
        </div>
      </div>

      {/* Time Window Label & Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] font-semibold text-slate-400 dark:text-white font-mono">
          VIEWING: {new Date(domainMin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          {" \u2014 "}
          {new Date(domainMax).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          LIVE TELEMETRY
        </div>
      </div>

      {/* Statistics Block */}
      {visibleValues.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4 shrink-0 select-none">
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100/50 dark:border-slate-700 flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">Min</span>
            <span className="text-sm font-bold text-slate-700 dark:text-white mt-0.5">
              {minVal % 1 === 0 ? minVal : minVal.toFixed(1)} <span className="text-[10px] font-normal text-slate-400 dark:text-white">{config?.unit}</span>
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100/50 dark:border-slate-700 flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">Max</span>
            <span className="text-sm font-bold text-slate-700 dark:text-white mt-0.5">
              {maxVal % 1 === 0 ? maxVal : maxVal.toFixed(1)} <span className="text-[10px] font-normal text-slate-400 dark:text-white">{config?.unit}</span>
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100/50 dark:border-slate-700 flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 dark:text-white uppercase tracking-wider">Average</span>
            <span className="text-sm font-bold text-slate-700 dark:text-white mt-0.5">
              {avgVal.toFixed(1)} <span className="text-[10px] font-normal text-slate-400 dark:text-white">{config?.unit}</span>
            </span>
          </div>
        </div>
      )}

      {/* Recharts Container */}
      <div className="flex-1 min-h-0 w-full font-mono text-xs">
        {loadingHistory ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-white gap-2">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading history...</span>
          </div>
        ) : visibleData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 dark:text-white">
            No data available for this time period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visibleData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
              <XAxis
                dataKey="timestampMs"
                type="number"
                domain={[domainMin, domainMax]}
                stroke="#94a3b8"
                tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                domain={[
                  (dataMin: number) => Math.floor(dataMin * 0.95),
                  (dataMax: number) => Math.ceil(dataMax * 1.05)
                ]}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey={selectedVital === 'diastolic_bp' ? 'systolic_bp' : selectedVital}
                stroke={LINE_COLORS[selectedVital === 'diastolic_bp' ? 'systolic_bp' : selectedVital] || "#6366f1"}
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
                name={selectedVital === 'systolic_bp' || selectedVital === 'diastolic_bp' ? "Systolic BP (mmHg)" : `${config?.label || ""} (${config?.unit || ""})`}
              />
              {(selectedVital === 'systolic_bp' || selectedVital === 'diastolic_bp') && (
                <Line
                  type="monotone"
                  dataKey="diastolic_bp"
                  stroke={LINE_COLORS['diastolic_bp'] || "#8b5cf6"}
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                  name="Diastolic BP (mmHg)"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}


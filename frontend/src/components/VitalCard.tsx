import { memo } from "react";
import { motion } from "framer-motion";
import type { Patient, VitalKey } from "../types";
import { VITAL_CONFIGS, getVitalStatus } from "../types";

interface Props {
  patient: Patient;
  vitalKey: VitalKey;
  isSelected: boolean;
  onClick: () => void;
  isDataStale?: boolean;
}

const VITAL_THEME: Record<VitalKey, { gradient: string; emoji: string }> = {
  heart_rate: {
    gradient: "bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-indigo-200",
    emoji: "❤️"
  },
  spo2: {
    gradient: "bg-gradient-to-br from-cyan-400 to-blue-600 shadow-blue-200",
    emoji: "🫁"
  },
  temperature: {
    gradient: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-200",
    emoji: "🌡️"
  },
  respiratory_rate: {
    gradient: "bg-gradient-to-br from-emerald-400 to-teal-600 shadow-emerald-200",
    emoji: "⏱️"
  },
  systolic_bp: {
    gradient: "bg-gradient-to-br from-pink-500 to-rose-600 shadow-rose-200",
    emoji: "💓"
  },
  diastolic_bp: {
    gradient: "bg-gradient-to-br from-purple-500 to-indigo-600 shadow-purple-200",
    emoji: "🩸"
  }
};

function VitalCard({ patient, vitalKey, isSelected, onClick, isDataStale }: Props) {
  const config = VITAL_CONFIGS.find((c) => c.key === vitalKey);
  if (!config) return null;

  const value = patient[vitalKey];
  const status = getVitalStatus(config, value);
  const theme = VITAL_THEME[vitalKey];

  // Tooltip with threshold ranges
  const rangeParts: string[] = [];
  if (config.critLow !== null) rangeParts.push(`Crit Low: ${config.critLow}`);
  if (config.warnLow !== null) rangeParts.push(`Warn Low: ${config.warnLow}`);
  if (config.warnHigh !== null) rangeParts.push(`Warn High: ${config.warnHigh}`);
  if (config.critHigh !== null) rangeParts.push(`Crit High: ${config.critHigh}`);
  const tooltipText = `${config.label} (${config.unit})\nNormal range: ${config.warnLow ?? "—"} – ${config.warnHigh ?? "—"} ${config.unit}\n${rangeParts.join(" | ")}`;

  // Severity color maps
  const statusColors = isDataStale
    ? "text-slate-400 dark:text-white font-semibold"
    : status === "critical"
      ? "text-red-500 font-semibold animate-pulse"
      : status === "warning"
        ? "text-amber-500 font-semibold"
        : "text-emerald-500 font-semibold";

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      className={`bg-white dark:bg-transparent dark:border-white/10 rounded-2xl shadow-sm border p-5 flex items-start justify-between hover:shadow-md transition-all cursor-pointer ${isSelected
        ? "border-indigo-500 ring-2 ring-indigo-500/20"
        : "border-slate-100 dark:border-slate-700"
        }`}
      onClick={onClick}
      title={tooltipText}
    >
      {/* Left Details */}
      <div className="flex-1 min-w-0 pr-2">
        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 dark:text-white uppercase tracking-widest mb-1 truncate">
          {vitalKey === 'systolic_bp' ? "Blood Pressure" : config.label}
        </div>
        <motion.div
          key={value}
          initial={{ opacity: 0.5, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-2xl font-bold text-slate-800 dark:text-white flex items-baseline gap-1 select-none monitor-display"
        >
          <span>
            {vitalKey === 'systolic_bp' ? (
              !isDataStale && patient.systolic_bp !== null && patient.diastolic_bp !== null
                ? `${Math.round(patient.systolic_bp)}/${Math.round(patient.diastolic_bp)}`
                : "--/--"
            ) : (
              !isDataStale && value !== null
                ? value % 1 === 0
                  ? value
                  : (value as number).toFixed(1)
                : "--"
            )}
          </span>
          <span className="text-xs font-semibold text-slate-400 dark:text-white font-sans dark:text-slate-500 dark:text-white">{config.unit}</span>
        </motion.div>

        <div className="text-[10px] text-slate-400 dark:text-white mt-1 truncate">
          <span className={`${statusColors} uppercase tracking-wider mr-1`}>
            {isDataStale ? "Stale" : status}
          </span>
          {config.warnLow !== null || config.warnHigh !== null ? (
            <span>
              ({config.warnLow ?? "0"}-{config.warnHigh ?? "∞"} {config.unit})
            </span>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>

      {/* Right Icon Block */}
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-md shrink-0 ${theme.gradient}`}>
        {theme.emoji}
      </div>
    </motion.div>
  );
}

export default memo(VitalCard);


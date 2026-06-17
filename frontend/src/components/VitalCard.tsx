import { memo } from "react";
import { motion } from "framer-motion";
import type { Patient, VitalKey } from "../types";
import { VITAL_CONFIGS, getVitalStatus } from "../types";
import "./VitalCard.css";

interface Props {
  patient: Patient;
  vitalKey: VitalKey;
  isSelected: boolean;
  onClick: () => void;
  isDataStale?: boolean;
}

function VitalCard({ patient, vitalKey, isSelected, onClick, isDataStale }: Props) {
  const config = VITAL_CONFIGS.find((c) => c.key === vitalKey);
  if (!config) return null;

  const value = patient[vitalKey];
  
  const status = getVitalStatus(config, value);
  let statusClass = "vital-card--normal";
  if (!isDataStale) {
    if (status === "warning") statusClass = "vital-card--warning";
    if (status === "critical") statusClass = "vital-card--critical";
  }

  const selectedClass = isSelected ? "vital-card--selected" : "";

  // M7: Build tooltip showing threshold ranges
  const rangeParts: string[] = [];
  if (config.critLow !== null) rangeParts.push(`Crit Low: ${config.critLow}`);
  if (config.warnLow !== null) rangeParts.push(`Warn Low: ${config.warnLow}`);
  if (config.warnHigh !== null) rangeParts.push(`Warn High: ${config.warnHigh}`);
  if (config.critHigh !== null) rangeParts.push(`Crit High: ${config.critHigh}`);
  const tooltipText = `${config.label} (${config.unit})\nNormal range: ${config.warnLow ?? '—'} – ${config.warnHigh ?? '—'} ${config.unit}\n${rangeParts.join(' | ')}`;

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 100, damping: 15 }}
      className={`vital-card glass-card ${statusClass} ${selectedClass}`}
      onClick={onClick}
      title={tooltipText}
    >
      <div className="vital-card__icon">{config.icon}</div>
      <div className="vital-card__label">{config.label}</div>
      <motion.div
        key={value}
        initial={{ opacity: 0.5, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="vital-card__value"
      >
        {!isDataStale && value !== null ? (value % 1 === 0 ? value : value.toFixed(1)) : "--"}
      </motion.div>
      <div className="vital-card__unit">{config.unit}</div>
    </motion.div>
  );
}

export default memo(VitalCard);

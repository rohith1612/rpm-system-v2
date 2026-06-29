import { memo } from "react";
import { motion } from "framer-motion";
import type { Patient, VitalKey } from "../types";
import { VITAL_CONFIGS, getVitalStatus, SYS_BP_CONFIG, DIA_BP_CONFIG } from "../types";
import "./VitalCard.css";

interface Props {
  patient: Patient;
  vitalKey: VitalKey;
  isSelected: boolean;
  onClick: () => void;
  isDataStale?: boolean;
  customThresholds?: any;
}

function VitalCard({ patient, vitalKey, isSelected, onClick, isDataStale, customThresholds }: Props) {
  const defaultConfig = VITAL_CONFIGS.find((c) => c.key === vitalKey);
  if (!defaultConfig) return null;

  let displayValue = "--";
  let statusClass = "vital-card--normal";
  let tooltipText = "";
  
  if (vitalKey === "blood_pressure") {
    const systolicVal = patient.systolic_bp;
    const diastolicVal = patient.diastolic_bp;
    
    if (systolicVal !== null && diastolicVal !== null) {
      displayValue = `${Math.round(systolicVal)}/${Math.round(diastolicVal)}`;
    } else if (systolicVal !== null) {
      displayValue = `${Math.round(systolicVal)}/--`;
    } else if (diastolicVal !== null) {
      displayValue = `--/${Math.round(diastolicVal)}`;
    } else {
      displayValue = "--";
    }
    
    // Calculate status using separate systolic/diastolic configs
    const sysConfig = {
      ...SYS_BP_CONFIG,
      warnLow: customThresholds?.systolic?.warn_low ?? SYS_BP_CONFIG.warnLow,
      critLow: customThresholds?.systolic?.crit_low ?? SYS_BP_CONFIG.critLow,
      warnHigh: customThresholds?.systolic?.warn_high ?? SYS_BP_CONFIG.warnHigh,
      critHigh: customThresholds?.systolic?.crit_high ?? SYS_BP_CONFIG.critHigh,
    };
    
    const diaConfig = {
      ...DIA_BP_CONFIG,
      warnLow: customThresholds?.diastolic?.warn_low ?? DIA_BP_CONFIG.warnLow,
      critLow: customThresholds?.diastolic?.crit_low ?? DIA_BP_CONFIG.critLow,
      warnHigh: customThresholds?.diastolic?.warn_high ?? DIA_BP_CONFIG.warnHigh,
      critHigh: customThresholds?.diastolic?.crit_high ?? DIA_BP_CONFIG.critHigh,
    };
    
    const sysStatus = getVitalStatus(sysConfig as any, systolicVal);
    const diaStatus = getVitalStatus(diaConfig as any, diastolicVal);
    
    let overallStatus: "normal" | "warning" | "critical" = "normal";
    if (sysStatus === "critical" || diaStatus === "critical") overallStatus = "critical";
    else if (sysStatus === "warning" || diaStatus === "warning") overallStatus = "warning";
    
    if (!isDataStale) {
      if (overallStatus === "warning") statusClass = "vital-card--warning";
      if (overallStatus === "critical") statusClass = "vital-card--critical";
    }
    
    // Build BP Tooltip
    const sysRange = `Systolic (Normal ${sysConfig.warnLow ?? '—'}–${sysConfig.warnHigh ?? '—'} | Crit Low: ${sysConfig.critLow ?? '—'} | Crit High: ${sysConfig.critHigh ?? '—'})`;
    const diaRange = `Diastolic (Normal ${diaConfig.warnLow ?? '—'}–${diaConfig.warnHigh ?? '—'} | Crit Low: ${diaConfig.critLow ?? '—'} | Crit High: ${diaConfig.critHigh ?? '—'})`;
    tooltipText = `${defaultConfig.label} (${defaultConfig.unit})\n${sysRange}\n${diaRange}`;
    
  } else {
    const value = patient[vitalKey as keyof Patient] as number | null;
    displayValue = !isDataStale && value !== null ? (value % 1 === 0 ? value.toString() : value.toFixed(1)) : "--";
    
    const config = {
      ...defaultConfig,
      warnLow: customThresholds?.warn_low ?? defaultConfig.warnLow,
      critLow: customThresholds?.crit_low ?? defaultConfig.critLow,
      warnHigh: customThresholds?.warn_high ?? defaultConfig.warnHigh,
      critHigh: customThresholds?.crit_high ?? defaultConfig.critHigh,
    };
    
    const status = getVitalStatus(config as any, value);
    if (!isDataStale) {
      if (status === "warning") statusClass = "vital-card--warning";
      if (status === "critical") statusClass = "vital-card--critical";
    }
    
    const rangeParts: string[] = [];
    if (config.critLow !== null) rangeParts.push(`Crit Low: ${config.critLow}`);
    if (config.warnLow !== null) rangeParts.push(`Warn Low: ${config.warnLow}`);
    if (config.warnHigh !== null) rangeParts.push(`Warn High: ${config.warnHigh}`);
    if (config.critHigh !== null) rangeParts.push(`Crit High: ${config.critHigh}`);
    tooltipText = `${config.label} (${config.unit})\nNormal range: ${config.warnLow ?? '—'} – ${config.warnHigh ?? '—'} ${config.unit}\n${rangeParts.join(' | ')}`;
  }

  const selectedClass = isSelected ? "vital-card--selected" : "";

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
      <div className="vital-card__icon">{defaultConfig.icon}</div>
      <div className="vital-card__label">{defaultConfig.label}</div>
      <motion.div
        key={displayValue}
        initial={{ opacity: 0.5, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="vital-card__value"
        style={{ fontSize: vitalKey === "blood_pressure" ? "20px" : undefined }}
      >
        {displayValue}
      </motion.div>
      <div className="vital-card__unit">{defaultConfig.unit}</div>
    </motion.div>
  );
}

export default memo(VitalCard);

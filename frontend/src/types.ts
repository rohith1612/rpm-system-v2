/**
 * TypeScript interfaces for the Remote Patient Monitoring frontend.
 */

export interface Patient {
  id: string;
  name: string;
  age: number | null;
  condition: string | null;
  registered_at: string | null;
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  recorded_at: string | number | null;
  recent_hr: number[] | null;
  ecg?: EcgPayload | null;
}

export interface VitalReading {
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  recorded_at: string;
}

export interface Alert {
  id: number;
  patient_id: string;
  vital_type: string;
  value: number;
  severity: "warning" | "critical";
  message: string;
  created_at: string;
  acknowledged: number;
}

export interface VitalsMessage {
  type: "vitals";
  patient_id: string;
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  recorded_at: number | null;
}

export interface AlertMessage {
  type: "alert";
  patient_id: string;
  vital_type: string;
  value: number;
  severity: "warning" | "critical";
  message: string;
}

export interface ActiveAlert {
  patient_id: string;
  vital_type: string;
  severity: "warning" | "critical";
  message: string;
  started_at: number;
  recent_values: number[];
}

export interface SnapshotMessage {
  type: "snapshot";
  data: Record<string, Patient>;
}

export interface EcgPayload {
  heart_rate: number;
  pr_interval: number;
  qrs_duration: number;
  qt_interval: number;
  qtc_interval: number;
  st_offset: number;
  rhythm: string;
}

export interface EcgMessage {
  type: "ecg";
  patient_id: string;
  heart_rate: number;
  pr_interval: number;
  qrs_duration: number;
  qt_interval: number;
  qtc_interval: number;
  st_offset: number;
  rhythm: string;
}

export type WebSocketMessage = VitalsMessage | AlertMessage | SnapshotMessage | EcgMessage;

export type VitalKey =
  | "heart_rate"
  | "spo2"
  | "temperature"
  | "respiratory_rate"
  | "blood_pressure";

export interface VitalConfig {
  key: VitalKey;
  label: string;
  unit: string;
  icon: string;
  warnLow: number | null;
  critLow: number | null;
  warnHigh: number | null;
  critHigh: number | null;
}

export const SYS_BP_CONFIG = { key: "systolic_bp" as any, label: "Systolic BP", unit: "mmHg", icon: "SYS", warnLow: 95, critLow: 80, warnHigh: 140, critHigh: 170 };
export const DIA_BP_CONFIG = { key: "diastolic_bp" as any, label: "Diastolic BP", unit: "mmHg", icon: "DIA", warnLow: 55, critLow: 45, warnHigh: 90, critHigh: 100 };

export const VITAL_CONFIGS: VitalConfig[] = [
  { key: "heart_rate", label: "Heart Rate", unit: "bpm", icon: "HR", warnLow: 55, critLow: 45, warnHigh: 110, critHigh: 130 },
  { key: "spo2", label: "SpO₂", unit: "%", icon: "O2", warnLow: 94, critLow: 90, warnHigh: null, critHigh: null },
  { key: "temperature", label: "Temperature", unit: "°F", icon: "TMP", warnLow: null, critLow: null, warnHigh: 99.5, critHigh: 101.3 },
  { key: "respiratory_rate", label: "Resp. Rate", unit: "br/min", icon: "RR", warnLow: 10, critLow: 8, warnHigh: 22, critHigh: 28 },
  { key: "blood_pressure", label: "Blood Pressure", unit: "mmHg", icon: "BP", warnLow: null, critLow: null, warnHigh: null, critHigh: null },
];

export function getVitalLabel(key: string): string {
  if (key === "systolic_bp") return "Systolic BP";
  if (key === "diastolic_bp") return "Diastolic BP";
  return VITAL_CONFIGS.find(c => c.key === key)?.label || key;
}

export function getVitalStatus(config: VitalConfig, value: number | null): "normal" | "warning" | "critical" {
  if (value === null) return "normal";
  if (config.critLow !== null && value < config.critLow) return "critical";
  if (config.critHigh !== null && value > config.critHigh) return "critical";
  if (config.warnLow !== null && value < config.warnLow) return "warning";
  if (config.warnHigh !== null && value > config.warnHigh) return "warning";
  return "normal";
}

export function isPatientActive(patient: Patient | null, now: number = Date.now()): boolean {
  if (!patient || !patient.recorded_at) return false;
  let timeMs = 0;
  if (typeof patient.recorded_at === "number") {
    timeMs = patient.recorded_at < 2000000000 ? patient.recorded_at * 1000 : patient.recorded_at;
  } else {
    timeMs = new Date(patient.recorded_at).getTime();
  }
  return (now - timeMs) < 60000;
}

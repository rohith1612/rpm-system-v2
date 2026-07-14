import { create } from 'zustand';
import type { Patient } from '../types';

export interface VitalsData {
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  recorded_at: string;
}

export interface EcgData {
  heart_rate: number | null;
  pr_interval: number | null;
  qrs_duration: number | null;
  qt_interval: number | null;
  qtc_interval: number | null;
  st_offset: number | null;
  rhythm: string | null;
  timestamp?: number;
}

export interface AlertData {
  id?: string;
  patient_id: string;
  vital_type: string;
  value: number;
  severity: string;
  message: string;
  created_at: string;
}

interface AppState {
  currentPatientId: string | null;
  vitalsHistory: Record<string, VitalsData[]>;
  latestVitals: Record<string, VitalsData | null>;
  latestEcg: Record<string, EcgData | null>;
  alerts: AlertData[];
  patients: Record<string, Patient>;
  
  setCurrentPatient: (id: string | null) => void;
  setVitalsHistory: (patientId: string, history: VitalsData[]) => void;
  addVitalReading: (patientId: string, vital: VitalsData) => void;
  setLatestEcg: (patientId: string, ecg: EcgData) => void;
  addAlert: (alert: AlertData) => void;
  setAlerts: (alerts: AlertData[]) => void;
  clearEcg: (patientId: string) => void;
  setPatients: (updater: (prev: Record<string, Patient>) => Record<string, Patient> | Record<string, Patient>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPatientId: null,
  vitalsHistory: {},
  latestVitals: {},
  latestEcg: {},
  alerts: [],
  patients: {},
  
  setCurrentPatient: (id) => set({ currentPatientId: id }),
  
  setVitalsHistory: (patientId, history) => set((state) => ({
    vitalsHistory: { ...state.vitalsHistory, [patientId]: history },
    latestVitals: history.length > 0 ? {
      ...state.latestVitals,
      [patientId]: history[history.length - 1]
    } : state.latestVitals
  })),
  
  addVitalReading: (patientId, vital) => set((state) => {
    const prevHistory = state.vitalsHistory[patientId] || [];
    // Cap at 3600 points (1 hour at 1Hz) to avoid O(N) date parsing on every tick
    let newHistory = prevHistory;
    if (newHistory.length >= 3600) {
      newHistory = newHistory.slice(newHistory.length - 3599);
    }
    newHistory = [...newHistory, vital];
    
    return {
      vitalsHistory: { ...state.vitalsHistory, [patientId]: newHistory },
      latestVitals: { ...state.latestVitals, [patientId]: vital }
    };
  }),
  
  setLatestEcg: (patientId, ecg) => set((state) => ({
    latestEcg: { ...state.latestEcg, [patientId]: ecg }
  })),
  
  clearEcg: (patientId) => set((state) => {
    const newEcg = { ...state.latestEcg };
    delete newEcg[patientId];
    return { latestEcg: newEcg };
  }),
  
  addAlert: (alert) => set((state) => ({
    alerts: [alert, ...state.alerts].slice(0, 50)
  })),
  
  setAlerts: (alerts) => set({ alerts }),
  
  setPatients: (updater) => set((state) => ({
    patients: typeof updater === 'function' ? updater(state.patients) : updater
  }))
}));

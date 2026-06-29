import { useEffect, useRef } from "react";
import { syncPatientVitalsToCerner } from "../api";
import type { Patient } from "../types";

interface Props {
  patient: Patient | null;
}

export default function CernerSyncButton({ patient }: Props) {
  const countdownRef = useRef<number>(60);
  const timerRef = useRef<number | null>(null);

  const isLinked = !!patient?.cerner_patient_id;

  const handleSync = async () => {
    if (!patient || !patient.cerner_patient_id) {
      return;
    }

    const vitalsPayload = {
      heart_rate: patient.heart_rate,
      spo2: patient.spo2,
      temperature: patient.temperature,
      respiratory_rate: patient.respiratory_rate,
      systolic_bp: patient.systolic_bp,
      diastolic_bp: patient.diastolic_bp,
    };

    try {
      await syncPatientVitalsToCerner(patient.id, vitalsPayload);
    } catch (err: any) {
      console.error("[Cerner Sync Error]", err);
    }
  };

  useEffect(() => {
    if (!isLinked) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Set up 1-minute loop
    countdownRef.current = 60;
    
    timerRef.current = window.setInterval(() => {
      countdownRef.current -= 1;
      
      if (countdownRef.current <= 0) {
        countdownRef.current = 60;
        handleSync();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [patient?.id, isLinked]);

  return null;
}

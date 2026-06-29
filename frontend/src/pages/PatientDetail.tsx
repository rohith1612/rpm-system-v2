import { useState } from "react";
import { useParams, useOutletContext, useNavigate } from "react-router-dom";
import CentralWorkspace from "../components/CentralWorkspace";
import type { Patient, VitalKey } from "../types";

interface LayoutContext {
  patients: Record<string, Patient>;
  connected: boolean;
  isDataStale: boolean;
}

type TabKey = "vitals" | "ecg" | "insights";

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const { patients, isDataStale } = useOutletContext<LayoutContext>();
  
  const [activeTab, setActiveTab] = useState<TabKey>("vitals");
  const [selectedVital, setSelectedVital] = useState<VitalKey>("heart_rate");

  const patient = id ? patients[id] || null : null;

  if (!patient && id) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#888' }}>
        Patient not found or loading...
      </div>
    );
  }

  const navigate = useNavigate();

  const handlePatientDeleted = () => {
    navigate("/");
  };

  const handleExpandECG = (_expanded: boolean) => {
    // handled inside CentralWorkspace or specific logic if needed
  };

  return (
    <CentralWorkspace
      patient={patient}
      activeTab={activeTab}
      setActiveTab={(tab) => setActiveTab(tab)}
      selectedVital={selectedVital}
      setSelectedVital={setSelectedVital}
      onExpandECG={handleExpandECG}
      onPatientDeleted={handlePatientDeleted}
      isDataStale={isDataStale}
    />
  );
}

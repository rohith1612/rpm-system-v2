/**
 * REST API client for the Remote Patient Monitoring backend.
 */

const API_BASE = "http://localhost:8000/api";

export async function fetchPatients() {
  const res = await fetch(`${API_BASE}/patients`);
  if (!res.ok) throw new Error("Failed to fetch patients");
  return res.json();
}

export async function fetchPatientInsights(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/insights`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch insights");
  return data;
}

export async function fetchPatientVitals(patientId: string, minutes: number = 30, endTime: number | null = null) {
  let url = `${API_BASE}/patients/${patientId}/vitals?minutes=${minutes}`;
  if (endTime !== null) {
    url += `&end_time=${endTime}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch vitals");
  return res.json();
}

export async function fetchPatientEcg(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/ecg`);
  if (!res.ok) throw new Error("Failed to fetch ECG");
  return res.json();
}

export async function fetchPatientHistory(patientId: string, date: string, hour: number) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/history?date=${date}&hour=${hour}`);
  if (!res.ok) throw new Error("Failed to fetch historical data");
  return res.json();
}

export async function getThresholds(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/thresholds`);
  if (!res.ok) throw new Error("Failed to fetch thresholds");
  return res.json();
}

export async function updateThresholds(patientId: string, thresholds: any[]) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/thresholds`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(thresholds),
  });
  if (!res.ok) throw new Error("Failed to update thresholds");
  return res.json();
}

export async function fetchPatientAlerts(patientId: string, limit: number = 50) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/alerts?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

export async function createPatient(data: { name: string; age: number; condition: string; cerner_patient_id?: string }) {
  const res = await fetch(`${API_BASE}/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create patient");
  return res.json();
}

export async function fetchCernerPatientDetails(cernerPatientId: string) {
  const res = await fetch(`${API_BASE}/patients/cerner/${cernerPatientId}`);
  if (!res.ok) throw new Error("Failed to fetch Cerner patient details");
  return res.json();
}

export async function updatePatient(patientId: string, data: { name: string; age: number; condition: string }) {
  const res = await fetch(`${API_BASE}/patients/${patientId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update patient");
  return res.json();
}

export async function deletePatient(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/${patientId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete patient");
  return res.json();
}

export async function fetchBeds() {
  const res = await fetch(`${API_BASE}/beds`);
  if (!res.ok) throw new Error("Failed to fetch beds");
  return res.json();
}

export async function assignBed(bedId: string, patientId: string) {
  const res = await fetch(`${API_BASE}/beds/${bedId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patient_id: patientId }),
  });
  if (!res.ok) throw new Error("Failed to assign bed");
  return res.json();
}

export async function unassignBed(bedId: string) {
  const res = await fetch(`${API_BASE}/beds/${bedId}/unassign`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to unassign bed");
  return res.json();
}

export async function syncPatientVitalsToCerner(patientId: string, vitals: any) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/cerner/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vitals),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to sync vitals to Cerner");
  return data;
}

export async function fetchQueueSize(): Promise<number> {
  const res = await fetch(`${API_BASE}/patients/cerner/queue-size`);
  if (!res.ok) throw new Error("Failed to fetch queue size");
  const data = await res.json();
  return data.size;
}


/**
 * REST API client for the Remote Patient Monitoring backend.
 */

const API_BASE = "http://localhost:8000/api";

export async function fetchPatients() {
  const res = await fetch(`${API_BASE}/patients`);
  if (!res.ok) throw new Error("Failed to fetch patients");
  return res.json();
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

export async function createPatient(data: { name: string; age: number; condition: string }) {
  const res = await fetch(`${API_BASE}/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create patient");
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

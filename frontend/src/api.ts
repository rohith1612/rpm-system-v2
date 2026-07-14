/**
 * REST API client for the Remote Patient Monitoring backend.
 */

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

const DEMO_TOKEN = "mock_offline_demo_token";

/**
 * Check if the current session is in demo/offline mode.
 */
export function isDemoMode(): boolean {
  return sessionStorage.getItem("smart_access_token") === DEMO_TOKEN;
}

/**
 * Build Authorization headers from the stored SMART on FHIR access token.
 */
function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem("smart_access_token");
  if (token) {
    return { "Authorization": `Bearer ${token}` };
  }
  return {};
}

export async function fetchPatients() {
  const res = await fetch(`${API_BASE}/patients`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch patients");
  return res.json();
}

export async function fetchPatientInsights(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/insights`, {
    headers: { ...getAuthHeaders() },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch insights");
  return data;
}

export async function fetchPatientVitals(patientId: string, minutes: number = 30, endTime: number | null = null) {
  let url = `${API_BASE}/patients/${patientId}/vitals?minutes=${minutes}`;
  if (endTime !== null) {
    url += `&end_time=${endTime}`;
  }
  const res = await fetch(url, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch vitals");
  return res.json();
}

export async function fetchPatientEcg(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/ecg`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch ECG");
  return res.json();
}

export async function fetchPatientHistory(patientId: string, date: string, hour: number) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/history?date=${date}&hour=${hour}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch historical data");
  return res.json();
}

export async function getThresholds(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/thresholds`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch thresholds");
  return res.json();
}

export async function updateThresholds(patientId: string, thresholds: any[]) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/thresholds`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(thresholds),
  });
  if (!res.ok) throw new Error("Failed to update thresholds");
  return res.json();
}

export async function fetchPatientAlerts(patientId: string, hours?: number, limit: number = 50) {
  let url = `${API_BASE}/patients/${patientId}/alerts?limit=${limit}`;
  if (hours !== undefined) url += `&hours=${hours}`;
  const res = await fetch(url, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

export async function createPatient(data: { patient_id: string; name: string; age: number; condition: string }) {
  const res = await fetch(`${API_BASE}/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create patient");
  return res.json();
}

export async function fetchCernerPatientDetails(cernerPatientId: string) {
  const res = await fetch(`${API_BASE}/patients/cerner/${cernerPatientId}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch Cerner patient details");
  return res.json();
}

export async function updatePatient(patientId: string, data: { name: string; age: number; condition: string }) {
  const res = await fetch(`${API_BASE}/patients/${patientId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update patient");
  return res.json();
}

export async function deletePatient(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/${patientId}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to delete patient");
  return res.json();
}

export async function fetchBeds() {
  const res = await fetch(`${API_BASE}/beds`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch beds");
  return res.json();
}

export async function assignBed(bedId: string, patientId: string) {
  const res = await fetch(`${API_BASE}/beds/${bedId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ patient_id: patientId }),
  });
  if (!res.ok) throw new Error("Failed to assign bed");
  return res.json();
}

export async function unassignBed(bedId: string) {
  const res = await fetch(`${API_BASE}/beds/${bedId}/unassign`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to unassign bed");
  return res.json();
}

export async function syncPatientVitalsToCerner(patientId: string, vitals: any) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/cerner/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(vitals),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to sync vitals to Cerner");
  return data;
}

export async function fetchQueueSize(): Promise<number> {
  const res = await fetch(`${API_BASE}/patients/cerner/queue-size`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch queue size");
  const data = await res.json();
  return data.size;
}

export async function searchCernerPatients(query: string) {
  const res = await fetch(`${API_BASE}/patients/cerner/search?query=${encodeURIComponent(query)}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to search Cerner patients");
  return res.json();
}

// ── History Dashboard APIs ──────────────────────────────

export async function fetchVitalsSummary(patientId: string, hours: number = 24) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/summary?hours=${hours}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch vitals summary");
  return res.json();
}

export async function fetchHistoryRange(patientId: string, date: string, startHour: number, endHour: number) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/history-range?date=${date}&start_hour=${startHour}&end_hour=${endHour}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch history range");
  return res.json();
}

export async function fetchAlertTimeline(patientId: string, hours: number = 24) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/alert-timeline?hours=${hours}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch alert timeline");
  return res.json();
}

export async function fetchAlertStats(patientId: string, hours: number = 24) {
  const res = await fetch(`${API_BASE}/patients/${patientId}/alert-stats?hours=${hours}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch alert stats");
  return res.json();
}

// ── Cerner Clinical Data APIs ──────────────────────────

export async function fetchCernerConditions(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/cerner/${patientId}/conditions`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch Cerner conditions");
  return res.json();
}

export async function fetchCernerMedications(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/cerner/${patientId}/medications`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch Cerner medications");
  return res.json();
}

export async function fetchCernerAllergies(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/cerner/${patientId}/allergies`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch Cerner allergies");
  return res.json();
}

export async function fetchCernerLabs(patientId: string) {
  const res = await fetch(`${API_BASE}/patients/cerner/${patientId}/labs`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Failed to fetch Cerner labs");
  return res.json();
}

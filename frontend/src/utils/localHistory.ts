export interface LocalVitalPoint {
  heart_rate: number | null;
  spo2: number | null;
  temperature: number | null;
  respiratory_rate: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  recorded_at: string;
  timestampMs: number;
}

const clientVitalsHistory: Record<string, LocalVitalPoint[]> = {};

export function addLocalVitalPoint(
  patientId: string,
  point: {
    heart_rate: number | null;
    spo2: number | null;
    temperature: number | null;
    respiratory_rate: number | null;
    systolic_bp: number | null;
    diastolic_bp: number | null;
    recorded_at: string;
  }
) {
  if (!clientVitalsHistory[patientId]) {
    clientVitalsHistory[patientId] = [];
  }

  const timestampMs = new Date(point.recorded_at).getTime();
  const list = clientVitalsHistory[patientId];

  // Avoid duplicate timestamps
  if (list.length > 0 && list[list.length - 1].timestampMs === timestampMs) {
    return;
  }

  list.push({
    ...point,
    timestampMs,
  });

  // Limit to 30 minutes of real-time logs
  const cutoff = Date.now() - 30 * 60 * 1000;
  clientVitalsHistory[patientId] = list.filter((d) => d.timestampMs >= cutoff);
}

export function getLocalVitalPoints(patientId: string, minutes: number = 30): LocalVitalPoint[] {
  const list = clientVitalsHistory[patientId] || [];
  const cutoff = Date.now() - minutes * 60 * 1000;
  return list.filter((d) => d.timestampMs >= cutoff);
}

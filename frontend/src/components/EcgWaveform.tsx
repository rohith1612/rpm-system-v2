/**
 * EcgWaveform — real-time synthetic ECG canvas renderer.
 *
 * Draws a continuous scrolling P-QRS-T waveform parameterized by the
 * ECG interval data received from the simulator.
 */
import { useRef, useEffect, useCallback } from "react";
import type { EcgPayload, Patient } from "../types";
import { useUiStore } from "../store/uiStore";
import "./EcgWaveform.css";

interface Props {
  ecg: EcgPayload | null | undefined;
  patient?: Patient | null;
  waveType?: "ecg" | "pleth" | "resp";
  lead?: "II" | "V1" | "aVR";
  isDataStale?: boolean;
}

const BASE_GRID_SMALL = 10;
const BASE_GRID_LARGE = 50;

/**
 * Attempt a simplified but medically-shaped P-QRS-T morphology.
 * All durations are in seconds; we convert to ms internally.
 *
 * The waveform is computed as a function of time within a single heartbeat (RR interval).
 */
function ecgAmplitude(
  tMs: number,
  rrMs: number,
  prMs: number,
  qrsMs: number,
  stOffset: number,
  lead: "II" | "V1" | "aVR" = "II"
): number {
  const t = tMs;

  // P Wave (atrial depolarization)
  const pWidth = 80;
  const pCenter = prMs * 0.4;
  let pWave = 0;

  if (lead === "V1") {
    // Biphasic P wave in V1
    const tNorm = (t - pCenter) / (pWidth / 2);
    if (Math.abs(tNorm) < 1.5) {
      pWave = -0.15 * tNorm * Math.exp(-0.5 * tNorm ** 2);
    }
  } else {
    pWave = 0.15 * Math.exp(-0.5 * ((t - pCenter) / (pWidth / 3)) ** 2);
  }

  // QRS Complex (ventricular depolarization)
  const qrsCenter = prMs;
  const qrsW = qrsMs * 1000;
  const qOffset = t - qrsCenter;

  let qDip = -0.15 * Math.exp(-0.5 * ((qOffset + qrsW * 0.1) / (qrsW * 0.1)) ** 2);
  let rPeak = 1.2 * Math.exp(-0.5 * ((qOffset - qrsW * 0.2) / (qrsW * 0.12)) ** 2);
  let sDip = -0.3 * Math.exp(-0.5 * ((qOffset - qrsW * 0.5) / (qrsW * 0.15)) ** 2);

  if (lead === "V1") {
    // V1 morphology: small R, deep S
    rPeak = 0.25 * Math.exp(-0.5 * ((qOffset - qrsW * 0.2) / (qrsW * 0.1)) ** 2);
    sDip = -1.1 * Math.exp(-0.5 * ((qOffset - qrsW * 0.4) / (qrsW * 0.15)) ** 2);
    qDip = 0; // usually no Q in V1
  }

  const qrsWave = qDip + rPeak + sDip;

  // ST Segment and T Wave (ventricular repolarization)
  const jPoint = qrsCenter + qrsW * 0.8;
  const tWaveCenter = prMs + qrsW + rrMs * 0.2;
  const tWaveWidth = 140;

  let stSeg = 0;
  let tWave = 0;

  if (t > jPoint && t < tWaveCenter + tWaveWidth) {
    if (t < tWaveCenter) {
      // From J-point to T-peak
      const progress = (t - jPoint) / (tWaveCenter - jPoint);
      if (progress < 0.4) {
        stSeg = stOffset;
      } else {
        const tProgress = (progress - 0.4) / 0.6;
        tWave = 0.25 * Math.sin(tProgress * Math.PI / 2);
        stSeg = stOffset * (1 - tProgress);
      }
    } else {
      // Fast downstroke from T-peak
      const progress = (t - tWaveCenter) / tWaveWidth;
      if (progress < 1) {
        tWave = 0.25 * Math.cos(progress * Math.PI / 2);
      }
    }
  }

  if (lead === "V1") {
    // T wave often inverted or flat in V1
    tWave *= -0.4;
  }

  let totalAmp = pWave + qrsWave + stSeg + tWave;

  if (lead === "aVR") {
    // aVR looks from the right arm, so almost all electrical activity moves away from it
    // Result: inverted morphology
    totalAmp *= -0.9;
  }

  return totalAmp;
}

function plethAmplitude(tMs: number, rrMs: number): number {
  const tNorm = tMs / rrMs;
  let val = 0;
  if (tNorm < 0.15) {
    val = Math.sin((tNorm / 0.15) * Math.PI / 2);
  } else if (tNorm < 0.4) {
    const p = (tNorm - 0.15) / 0.25;
    val = 1 - p * 0.6; // drops from 1 to 0.4
  } else if (tNorm < 0.55) {
    const p = (tNorm - 0.4) / 0.15;
    val = 0.4 + Math.sin(p * Math.PI) * 0.1; // dicrotic notch bump
  } else {
    const p = (tNorm - 0.55) / 0.45;
    val = 0.4 * (1 - p);
  }
  return val - 0.5; // center around 0
}

function respAmplitude(tMs: number, respMs: number): number {
  const tNorm = tMs / respMs;
  return Math.sin(tNorm * Math.PI * 2) * 0.4; // smooth slow sine wave
}

export default function EcgWaveform({ ecg, patient, waveType = "ecg", lead = "II", isDataStale = false }: Props) {
  const { theme } = useUiStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  // Track global time in milliseconds
  const offsetRef = useRef(0);
  const ecgRef = useRef(ecg);
  const patientRef = useRef(patient);
  const isDataStaleRef = useRef(isDataStale);
  const bufferRef = useRef<number[]>([]);

  // Keep data fresh for the animation loop
  useEffect(() => {
    ecgRef.current = ecg;
    patientRef.current = patient;
    isDataStaleRef.current = isDataStale;
  }, [ecg, patient, isDataStale]);

  // Clear ECG history buffer and reset cycle offset when switching patients, wave type, or lead configurations
  useEffect(() => {
    bufferRef.current = [];
    offsetRef.current = 0;
  }, [patient?.id, waveType, lead]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas size to layout size (hi-dpi aware)
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;

    // Scale the graph perfectly to fit the container height without clipping.
    // Restored to the old minimal scaling logic to show more horizontal data.
    const scaleFactor = Math.min(1.2, Math.max(0.3, H / 280));

    const gridSmall = BASE_GRID_SMALL * scaleFactor;
    const gridLarge = BASE_GRID_LARGE * scaleFactor;


    const isDark = theme === 'dark';

    // Background
    ctx.fillStyle = isDark ? "#080808" : "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Draw grid
    ctx.strokeStyle = isDark ? "rgba(0, 200, 83, 0.2)" : "rgba(255, 130, 140, 0.35)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += gridSmall) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = (H * 0.5) % gridSmall; y < H; y += gridSmall) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let y = (H * 0.5) % gridSmall - gridSmall; y >= 0; y -= gridSmall) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // Major grid lines
    ctx.strokeStyle = isDark ? "rgba(0, 200, 83, 0.4)" : "rgba(255, 90, 100, 0.6)";
    ctx.lineWidth = 1.5;
    for (let x = 0; x < W; x += gridLarge) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = (H * 0.5) % gridLarge; y < H; y += gridLarge) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    for (let y = (H * 0.5) % gridLarge - gridLarge; y >= 0; y -= gridLarge) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Get current ECG params
    const e = ecgRef.current;
    const hr = e?.heart_rate ?? 72;
    const prSec = e?.pr_interval ?? 0.16;
    const qrsSec = e?.qrs_duration ?? 0.09;
    const stOff = e?.st_offset ?? 0;

    const rrMs = hr > 0 ? (60 / hr) * 1000 : 1000; // fallback to 1s if dead
    const prMs = prSec * 1000;

    // Default settings for ECG — M4: distinct colors per waveform type
    let strokeColor = waveType === "ecg" ? (isDark ? "#00ff41" : "#00c853")    // medical green (ECG)
      : waveType === "pleth" ? (isDark ? "#00e5ff" : "#00b0ff")  // cyan (SpO₂ pleth)
        : (isDark ? "#ffff00" : "#ffd600");                         // yellow (Resp)

    const stale = isDataStaleRef.current;

    if (stale) strokeColor = "#94a3b8"; // Gray out when stale

    let cycleMs = rrMs;
    let labelText = stale ? `-- BPM | Lead ${lead}` : `${hr} BPM | Lead ${lead}`;

    // Dynamic vertical cropping and scaling
    let midY = H * 0.5;
    let ampScale = 100 * scaleFactor;

    if (waveType === "ecg") {
      // ECG goes heavily positive (R-peak) and slightly negative. 
      // Shift baseline and boost amplitude so it perfectly crops to the Y edges.
      midY = lead === "aVR" ? H * 0.35 : H * 0.65;
      ampScale = 140 * scaleFactor;
    } else if (waveType === "pleth") {
      midY = H * 0.5; // Perfectly symmetric
      ampScale = 180 * scaleFactor;
      const p = patientRef.current;
      const spo2 = p?.spo2 ?? 98;
      labelText = stale ? `--% SpO2 | Pleth` : `${spo2}% SpO2 | Pleth`;
    } else if (waveType === "resp") {
      midY = H * 0.5; // Perfectly symmetric
      ampScale = 180 * scaleFactor;
      const p = patientRef.current;
      const respRate = p?.respiratory_rate ?? 16;
      cycleMs = (60 / Math.max(1, respRate)) * 1000;
      labelText = stale ? `-- Br/min | Resp` : `${respRate} Br/min | Resp`;
    }

    // Draw waveform
    if (!stale) {
      // Advance time by ~16ms per frame (60 FPS)
      offsetRef.current += 16;
      const t_global = offsetRef.current;
      const beatMs = ((t_global % cycleMs) + cycleMs) % cycleMs;
      let amp = 0;
      if (hr <= 0) {
        amp = 0;
      } else if (waveType === "ecg") {
        amp = ecgAmplitude(beatMs, cycleMs, prMs, qrsSec, stOff, lead);
      } else if (waveType === "pleth") {
        amp = plethAmplitude(beatMs, cycleMs);
      } else {
        amp = respAmplitude(beatMs, cycleMs);
      }
      // Push new amplitude into circular buffer
      const buf = bufferRef.current;
      buf.push(amp);
      if (buf.length > Math.floor(W)) {
        buf.shift();
      }

      // Render waveform from buffer
      ctx.beginPath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (let i = 0; i < buf.length; i++) {
        const x = i;
        const y = midY - buf[i] * ampScale;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    } else {
      // Draw NO DATA overlay
      const textW = 100;
      const textH = 26;
      ctx.fillStyle = "rgba(148, 163, 184, 0.15)";
      ctx.fillRect(W / 2 - textW / 2, H / 2 - textH / 2, textW, textH);
      ctx.fillStyle = "#64748b";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${Math.max(12, 14 * scaleFactor)}px var(--font-mono, 'Consolas', monospace)`;
      ctx.fillText("NO DATA", W / 2, H / 2);
      ctx.textAlign = "left"; // reset for labels below
      ctx.textBaseline = "alphabetic";
    }

    // Labels and Values
    const fontSize = Math.max(10, Math.round(15 * scaleFactor)); // slightly larger for better readability
    ctx.font = `bold ${fontSize}px var(--font-mono, 'Consolas', monospace)`;

    // Draw a white pill background for text readability over the grid
    ctx.fillStyle = isDark ? "rgba(10, 15, 20, 0.85)" : "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    const pillW = fontSize * 15; // increased width for longer text
    const pillH = fontSize * 3.4;
    ctx.roundRect(5, 5, pillW, pillH, 6);
    ctx.fill();

    ctx.fillStyle = isDark ? "#e2e8f0" : "#0f172a";
    ctx.fillText(labelText, 12, 5 + fontSize * 1.3);
    ctx.fillStyle = isDark ? "#94a3b8" : "#64748b";
    ctx.fillText(e?.rhythm ?? "---", 12, 5 + fontSize * 2.7);

    // BPM display on the right side
    ctx.fillStyle = isDark ? "#e2e8f0" : "#0f172a";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = `bold ${fontSize}px var(--font-mono, 'Consolas', monospace)`;
    ctx.fillText(`${hr} BPM`, W - 10, 5);
    // Reset alignment for subsequent drawing
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    // Calibration Specs at Bottom Right
    const calibFont = Math.max(9, Math.round(11 * scaleFactor));
    ctx.font = `bold ${calibFont}px var(--font-mono, 'Consolas', monospace)`;
    ctx.fillStyle = isDark ? "rgba(148, 163, 184, 0.8)" : "rgba(100, 116, 139, 0.8)";
    const calibText = "25 mm/s  10 mm/mV";
    ctx.fillText(calibText, W - ctx.measureText(calibText).width - 10, H - 10);

    if (waveType === "ecg") {
      // Y-Axis Voltage Markers (only valid for ECG)
      ctx.fillStyle = isDark ? "rgba(226, 232, 240, 0.6)" : "rgba(15, 23, 42, 0.5)";
      const labelY = lead === "aVR" ? H * 0.35 : H * 0.65; // Align to baseline
      ctx.fillText("+1.0 mV", W - 55, labelY - ampScale + calibFont / 2);
      ctx.fillText("0.0 mV", W - 50, labelY + calibFont / 2);
      ctx.fillText("-1.0 mV", W - 55, labelY + ampScale + calibFont / 2);
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <div className="ecg-waveform" id="ecg-waveform">
      <canvas ref={canvasRef} className="ecg-waveform__canvas" />
    </div>
  );
}

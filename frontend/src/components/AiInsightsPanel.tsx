import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { fetchPatientInsights } from "../api";
import type { Patient } from "../types";
import "./AiInsightsPanel.css";

interface Props {
  patient: Patient | null;
  isDataStale?: boolean;
}

const insightsCache: Record<string, string> = {};

export default function AiInsightsPanel({ patient, isDataStale }: Props) {
  const [insight, setInsight] = useState<string | null>(() => patient ? (insightsCache[patient.id] || null) : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when patient changes
  useEffect(() => {
    if (patient) setInsight(insightsCache[patient.id] || null);
  }, [patient?.id]);

  const generateInsight = async () => {
    if (!patient) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPatientInsights(patient.id);
      if (res.error) throw new Error(res.error);
      setInsight(res.insight);
      insightsCache[patient.id] = res.insight;
    } catch (err: any) {
      setError(err.message || "Failed to generate clinical insight.");
    } finally {
      setLoading(false);
    }
  };

  if (!patient) return null;

  return (
    <section className="ai-insights-panel glass-card">
      <div className="ai-insights-panel__header">
        <div className="ai-insights-panel__title-box">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <circle cx="12" cy="12" r="4" />
          </svg>
          <h2>AI Clinical Insights</h2>
        </div>
        <button
          className={`ai-insights-panel__btn ${loading ? "ai-insights-panel__btn--loading" : ""}`}
          onClick={generateInsight}
          disabled={loading || isDataStale}
          title={isDataStale ? "AI generation is disabled for inactive patients. Reconnect telemetry first." : ""}
        >
          {loading ? (
            <span className="ai-insights-panel__btn-text">
              <svg className="spinner" viewBox="0 0 50 50">
                <circle className="path" cx="25" cy="25" r="20" fill="none" strokeWidth="5"></circle>
              </svg>
              Analyzing...
            </span>
          ) : (
            "Generate Insight"
          )}
        </button>
      </div>

      <div className="ai-insights-panel__content">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="ai-insights-panel__skeleton"
            >
              <div className="skeleton-line title"></div>
              <div className="skeleton-line"></div>
              <div className="skeleton-line"></div>
              <div className="skeleton-line short"></div>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="ai-insights-panel__error"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </motion.div>
          ) : insight ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="ai-insights-panel__result"
            >
              <ReactMarkdown>{insight}</ReactMarkdown>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="ai-insights-panel__empty"
            >
              <p>Click "Generate Insight" to analyze the patient's recent vitals and alerts using AI.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="ai-insights-panel__footer">
        ⚠ AI-generated insights are for informational purposes only and do not substitute professional medical advice.
      </div>
    </section>
  );
}

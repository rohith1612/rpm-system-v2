import { useState, useEffect } from "react";
import { getThresholds, updateThresholds } from "../api";
import { VITAL_CONFIGS } from "../types";
import "./ThresholdsModal.css";

interface Props {
  patientId: string;
  patientName: string;
  onClose: () => void;
}

export default function ThresholdsModal({ patientId, patientName, onClose }: Props) {
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchT() {
      try {
        const data = await getThresholds(patientId);
        setThresholds(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchT();
  }, [patientId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleChange = (index: number, field: string, value: string) => {
    const updated = [...thresholds];
    updated[index][field] = value === "" ? null : Number(value);
    setThresholds(updated);
  };

  // M5: Validate threshold ordering before save
  const validateThresholds = (): boolean => {
    const errors: Record<string, string> = {};
    for (const t of thresholds) {
      const vals = [
        { key: "crit_low", val: t.crit_low },
        { key: "warn_low", val: t.warn_low },
        { key: "warn_high", val: t.warn_high },
        { key: "crit_high", val: t.crit_high },
      ].filter(v => v.val !== null && v.val !== undefined);

      for (let i = 0; i < vals.length - 1; i++) {
        if (vals[i].val > vals[i + 1].val) {
          const label = VITAL_CONFIGS.find(c => c.key === t.vital_type)?.label || t.vital_type;
          errors[t.vital_type] = `${label}: values must satisfy Crit Low ≤ Warn Low ≤ Warn High ≤ Crit High`;
          break;
        }
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!validateThresholds()) return;
    setSaving(true);
    try {
      await updateThresholds(patientId, thresholds);
      onClose();
    } catch (e) {
      console.error(e);
      // H2: Inline error instead of browser alert()
      setSaveError("Failed to save thresholds. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal__header">
          <h2>Alert Settings: {patientName}</h2>
          <button className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body">
          {loading ? (
            <p>Loading...</p>
          ) : (
            <table className="thresholds-table">
              <thead>
                <tr>
                  <th>Vital Sign</th>
                  <th>Crit Low</th>
                  <th>Warn Low</th>
                  <th>Warn High</th>
                  <th>Crit High</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((t, idx) => {
                  const label = VITAL_CONFIGS.find(c => c.key === t.vital_type)?.label || t.vital_type;
                  return (
                    <tr key={t.vital_type} className={validationErrors[t.vital_type] ? "thresholds-row--error" : ""}>
                      <td>
                        <strong>{label}</strong>
                        {t.is_custom && <span className="custom-badge">Custom</span>}
                        {validationErrors[t.vital_type] && (
                          <div className="thresholds-row-error">{validationErrors[t.vital_type]}</div>
                        )}
                      </td>
                      <td>
                        <input
                          type="number"
                          value={t.crit_low ?? ""}
                          onChange={(e) => handleChange(idx, "crit_low", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={t.warn_low ?? ""}
                          onChange={(e) => handleChange(idx, "warn_low", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={t.warn_high ?? ""}
                          onChange={(e) => handleChange(idx, "warn_high", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={t.crit_high ?? ""}
                          onChange={(e) => handleChange(idx, "crit_high", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal__footer">
          {saveError && <p className="modal__error">{saveError}</p>}
          {Object.keys(validationErrors).length > 0 && !saveError && (
            <p className="modal__error">Please fix the highlighted rows above.</p>
          )}
          <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-save" onClick={handleSave} disabled={loading || saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

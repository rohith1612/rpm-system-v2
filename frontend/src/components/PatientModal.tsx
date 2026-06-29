import { useState } from "react";
import { createPatient, updatePatient } from "../api";
import "./PatientModal.css";
import type { Patient } from "../types";

interface Props {
  patientToEdit?: Patient;
  onClose: () => void;
  onSaved: (patientId: string) => void;
}

export default function PatientModal({ patientToEdit, onClose, onSaved }: Props) {
  const isEditing = !!patientToEdit;

  const [name, setName] = useState(patientToEdit?.name || "");
  const [age, setAge] = useState<string>(patientToEdit?.age?.toString() || "");
  const [condition, setCondition] = useState(patientToEdit?.condition || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedId, setGeneratedId] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum <= 0) {
      setError("Valid age is required");
      return;
    }
    if (!condition.trim()) {
      setError("Diagnosis/Condition is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isEditing && patientToEdit) {
        await updatePatient(patientToEdit.id, { name, age: ageNum, condition });
        onSaved(patientToEdit.id);
      } else {
        const newPatient = await createPatient({ name, age: ageNum, condition });
        setGeneratedId(newPatient.id);
      }
    } catch (e) {
      setError("Failed to save patient. Please try again.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal patient-modal">
        <div className="modal__header">
          <h2>{isEditing ? `Edit Patient (${patientToEdit.id})` : "Add New Patient"}</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        {generatedId ? (
          <>
            <div className="modal__content patient-modal__content" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ color: 'var(--emerald-500)', marginBottom: '16px' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              </div>
              <h3 style={{ fontSize: '18px', color: 'var(--slate-800)', marginBottom: '8px' }}>Patient Added Successfully!</h3>
              <p style={{ color: 'var(--slate-500)', marginBottom: '24px' }}>Please copy this Patient ID to use in the Simulator:</p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', background: 'var(--slate-100)', padding: '16px', borderRadius: '8px', width: 'fit-content', margin: '0 auto', border: '1px solid var(--slate-200)' }}>
                <span style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', color: 'var(--blue-600)' }}>
                  {generatedId}
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(generatedId)}
                  title="Copy ID"
                  style={{ background: 'none', border: 'none', color: 'var(--slate-500)', cursor: 'pointer', padding: '4px' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--blue-600)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--slate-500)'}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            </div>
            <div className="modal__footer" style={{ justifyContent: 'center' }}>
              <button className="btn-save" onClick={() => onSaved(generatedId)}>Close & Continue</button>
            </div>
          </>
        ) : (
          <>
            <div className="modal__content patient-modal__content">
              {!isEditing ? (
                <div className="patient-modal__info-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                  <span>A new Patient ID will be automatically generated upon saving.</span>
                </div>
              ) : patientToEdit?.cerner_patient_id ? (
                <div className="patient-modal__info-box" style={{ background: 'var(--blue-50)', color: 'var(--blue-700)', borderColor: 'var(--blue-200)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                  <span>Linked to Cerner Patient ID: <strong>{patientToEdit.cerner_patient_id}</strong></span>
                </div>
              ) : null}

              <div className="patient-modal__form">
                <div className="patient-modal__control-group">
                  <label>Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter the Patient Name"
                    disabled={saving}
                  />
                </div>
                <div className="patient-modal__control-group">
                  <label>Age</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Enter the Patient Age"
                    min="1"
                    max="120"
                    disabled={saving}
                  />
                </div>
                <div className="patient-modal__control-group">
                  <label>Diagnosis / Condition</label>
                  <input
                    type="text"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    placeholder="Enter the Diagnosis/Condition"
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            <div className="modal__footer">
              {error && <p className="modal__error">{error}</p>}
              <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : isEditing ? "Save Changes" : "Add Patient"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

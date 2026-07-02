import { useState } from "react";
import { createPatient } from "../api";
import "./PatientModal.css";

interface Props {
  onClose: () => void;
  onSaved: (patientId: string) => void;
}

export default function PatientModal({ onClose, onSaved }: Props) {
  const [tab, setTab] = useState<'manual' | 'cerner'>('manual');
  
  // Manual State
  const [cernerIdManual, setCernerIdManual] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [condition, setCondition] = useState("");
  
  // Cerner State
  const [searchQuery, setSearchQuery] = useState("");
  const [cernerResults, setCernerResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [cernerCondition, setCernerCondition] = useState("");
  const [selectedCerner, setSelectedCerner] = useState<any | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManualSave = async () => {
    if (!cernerIdManual.trim() || !name.trim() || !age || !condition.trim()) {
      setError("All fields are required (including Cerner Patient ID).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newPatient = await createPatient({ patient_id: cernerIdManual.trim(), name, age: parseInt(age, 10), condition });
      onSaved(newPatient.id);
    } catch (e: any) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleCernerSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`http://localhost:8000/api/patients/cerner/search?query=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setCernerResults(data);
    } catch (e: any) {
      setError(e.message || "Failed to search.");
    } finally {
      setSearching(false);
    }
  };

  const handleCernerImport = async () => {
    if (!selectedCerner || !cernerCondition.trim()) {
      setError("Please provide a condition for this Cerner patient.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const newPatient = await createPatient({
        patient_id: selectedCerner.id,
        name: selectedCerner.name,
        age: selectedCerner.age,
        condition: cernerCondition,
      });
      onSaved(newPatient.id);
    } catch (e: any) {
      setError(e.message || "Failed to import.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal__header">
          <h2>ADD PATIENT</h2>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>
            Manual Entry
          </button>
          <button className={`modal-tab ${tab === 'cerner' ? 'active' : ''}`} onClick={() => setTab('cerner')}>
            Cerner Import
          </button>
        </div>

        <div className="modal__content">
          {error && <div style={{ color: 'var(--red)', marginBottom: '10px', fontSize: '12px' }}>{error}</div>}

          {tab === 'manual' && (
            <div>
              <div className="form-group">
                <label>Cerner Patient ID</label>
                <input value={cernerIdManual} onChange={e => setCernerIdManual(e.target.value)} placeholder="e.g. 12724066" />
              </div>
              <div className="form-group">
                <label>Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Doe" />
              </div>
              <div className="form-group">
                <label>Age</label>
                <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 45" />
              </div>
              <div className="form-group">
                <label>Clinical Condition</label>
                <input value={condition} onChange={e => setCondition(e.target.value)} placeholder="e.g. Post-op Observation" />
              </div>
            </div>
          )}

          {tab === 'cerner' && (
            <div>
              {!selectedCerner ? (
                <>
                  <div className="form-group">
                    <label>Search Cerner Sandbox</label>
                    <div className="search-row">
                      <input 
                        value={searchQuery} 
                        onChange={e => setSearchQuery(e.target.value)} 
                        placeholder="Patient Name or ID" 
                        onKeyDown={e => e.key === 'Enter' && handleCernerSearch()}
                      />
                      <button className="btn-search" onClick={handleCernerSearch} disabled={searching}>
                        {searching ? "..." : "Search"}
                      </button>
                    </div>
                  </div>
                  {cernerResults.length > 0 && (
                    <div className="cerner-results">
                      {cernerResults.map(p => (
                        <div key={p.id} className="cerner-result-row">
                          <div>
                            <div className="r-name">
                              <span style={{ color: p.has_active_encounter ? 'var(--green)' : 'var(--red)', marginRight: '6px' }}>●</span>
                              {p.name}
                            </div>
                            <div className="r-meta">ID: {p.id} &middot; {p.age} yrs</div>
                          </div>
                          <button 
                            className="btn-import" 
                            onClick={() => setSelectedCerner(p)}
                            disabled={!p.has_active_encounter}
                            title={!p.has_active_encounter ? "Requires active encounter" : "Import"}
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: '16px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Selected Cerner Patient</div>
                    <div style={{ fontWeight: 500 }}>{selectedCerner.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--blue)' }}>ID: {selectedCerner.id}</div>
                  </div>
                  <div className="form-group">
                    <label>Admitting Diagnosis / Condition</label>
                    <input value={cernerCondition} onChange={e => setCernerCondition(e.target.value)} placeholder="e.g. Acute Respiratory Failure" />
                  </div>
                  <button className="btn-cancel" onClick={() => setSelectedCerner(null)} style={{ padding: '4px 8px' }}>
                    &larr; Back to Search
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          {tab === 'manual' && (
            <button className="btn-save" onClick={handleManualSave} disabled={saving}>
              {saving ? "Saving..." : "Add Patient"}
            </button>
          )}
          {tab === 'cerner' && selectedCerner && (
            <button className="btn-save" onClick={handleCernerImport} disabled={saving}>
              {saving ? "Importing..." : "Import from Cerner"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

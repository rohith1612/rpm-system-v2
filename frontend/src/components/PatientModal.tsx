import { useState } from "react";
import { createPatient, isDemoMode, searchCernerPatients } from "../api";
import "./PatientModal.css";

interface Props {
  onClose: () => void;
  onSaved: (patientId: string) => void;
}

export default function PatientModal({ onClose, onSaved }: Props) {
  const isDemo = isDemoMode();
  const [tab, setTab] = useState<'manual' | 'cerner'>(isDemo ? 'manual' : 'cerner');
  
  // Manual State
  const [cernerIdManual, setCernerIdManual] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [condition, setCondition] = useState("");
  
  // Cerner State
  const [searchQuery, setSearchQuery] = useState("");
  const [cernerResults, setCernerResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
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
    setHasSearched(true);
    setCernerResults([]);
    setError(null);
    try {
      const data = await searchCernerPatients(searchQuery);
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
          <div className="modal__title-group">
            <div className="modal__icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
            </div>
            <h2>Add Patient</h2>
          </div>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'cerner' ? 'active' : ''}`} onClick={() => !isDemo && setTab('cerner')} disabled={isDemo} title={isDemo ? 'Requires active Cerner EHR session' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9"/>
            </svg>
            Cerner Import
            {isDemo && <span style={{ fontSize: '9px', opacity: 0.6, marginLeft: '4px' }}>(Offline)</span>}
          </button>
          <button className={`modal-tab ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Manual Entry
          </button>
        </div>

        <div className="modal__content">
          {error && <div className="modal-error">{error}</div>}

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
                        {searching ? (
                          <span className="btn-search-spinner"></span>
                        ) : (
                          <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8"/>
                              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Search
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Loading Animation */}
                  {searching && (
                    <div className="cerner-searching">
                      <div className="searching-visual">
                        <div className="searching-rings">
                          <div className="ring ring-1"></div>
                          <div className="ring ring-2"></div>
                          <div className="ring ring-3"></div>
                          <div className="searching-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8"/>
                              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                          </div>
                        </div>
                        <div className="searching-text">Searching Cerner EHR...</div>
                        <div className="searching-subtext">Querying FHIR R4 sandbox for patient records</div>
                      </div>
                      <div className="skeleton-results">
                        <div className="skeleton-row"><div className="skeleton-avatar"></div><div className="skeleton-lines"><div className="skeleton-line w70"></div><div className="skeleton-line w40"></div></div></div>
                        <div className="skeleton-row"><div className="skeleton-avatar"></div><div className="skeleton-lines"><div className="skeleton-line w60"></div><div className="skeleton-line w50"></div></div></div>
                        <div className="skeleton-row"><div className="skeleton-avatar"></div><div className="skeleton-lines"><div className="skeleton-line w80"></div><div className="skeleton-line w30"></div></div></div>
                      </div>
                    </div>
                  )}

                  {/* Results */}
                  {!searching && cernerResults.length > 0 && (
                    <div className="cerner-results">
                      <div className="results-header">
                        <span>{cernerResults.length} patient{cernerResults.length !== 1 ? 's' : ''} found</span>
                      </div>
                      {cernerResults.map(p => (
                        <div key={p.id} className="cerner-result-row">
                          <div className="result-info">
                            <div className="r-name">
                              <span className={`r-status-dot ${p.has_active_encounter ? 'active' : 'inactive'}`}></span>
                              {p.name}
                            </div>
                            <div className="r-meta">ID: {p.id} &middot; {p.age} yrs</div>
                          </div>
                          <button 
                            className="btn-import" 
                            onClick={() => setSelectedCerner(p)}
                            disabled={!p.has_active_encounter}
                            title={!p.has_active_encounter ? "Requires active encounter" : "Import this patient"}
                          >
                            {p.has_active_encounter ? "Select" : "No Encounter"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No results */}
                  {!searching && hasSearched && cernerResults.length === 0 && (
                    <div className="cerner-no-results">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        <line x1="8" y1="11" x2="14" y2="11"/>
                      </svg>
                      <span>No patients found. Try a different search term.</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="selected-patient-card">
                    <div className="selected-patient-badge">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                    <div>
                      <div className="selected-label">Selected Cerner Patient</div>
                      <div className="selected-name">{selectedCerner.name}</div>
                      <div className="selected-id">ID: {selectedCerner.id}</div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Admitting Diagnosis / Condition</label>
                    <input value={cernerCondition} onChange={e => setCernerCondition(e.target.value)} placeholder="e.g. Acute Respiratory Failure" />
                  </div>
                  <button className="btn-back" onClick={() => setSelectedCerner(null)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="19" y1="12" x2="5" y2="12"/>
                      <polyline points="12 19 5 12 12 5"/>
                    </svg>
                    Back to Search
                  </button>
                </>
              )}
            </div>
          )}

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

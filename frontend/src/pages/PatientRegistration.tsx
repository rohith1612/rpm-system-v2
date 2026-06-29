import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPatient, fetchCernerPatientDetails } from "../api";
import { searchPatients } from "../utils/fhir";
import "./PatientRegistration.css";

type RegistrationStep = "choose" | "manual" | "cerner_search" | "cerner_review";

export default function PatientRegistration() {
  const navigate = useNavigate();

  // Wizard Step State
  const [step, setStep] = useState<RegistrationStep>("choose");

  // Cerner Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  // Cerner Selected Patient / Demographics Details
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [cernerCondition, setCernerCondition] = useState("");

  // Manual Creation States
  const [manualName, setManualName] = useState("");
  const [manualAge, setManualAge] = useState("");
  const [manualCondition, setManualCondition] = useState("");

  // Common UI states
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle Search in Cerner
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearched(false);
      return;
    }

    const token = sessionStorage.getItem("smart_access_token");
    const fhirBaseUrl = sessionStorage.getItem("smart_fhir_base_url");

    if (!token || !fhirBaseUrl) {
      setError("Active Cerner session not found. Redirecting to SMART Launch...");
      setTimeout(() => navigate("/launch"), 2000);
      return;
    }

    setSearching(true);
    setError(null);
    setSearched(true);

    try {
      const results = await searchPatients(fhirBaseUrl, token, searchQuery);
      setSearchResults(results);
    } catch (err: any) {
      console.error("Cerner search failed:", err);
      setError(err.message || "Failed to search patients on Cerner EHR.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // Select patient from Cerner search results & fetch details
  const handleSelectCernerPatient = async (cernerPatientId: string) => {
    setFetchingDetails(true);
    setError(null);
    try {
      const details = await fetchCernerPatientDetails(cernerPatientId);
      setSelectedPatient(details);
      
      // Pre-populate condition with active encounter type, or generic value
      if (details.active_encounter_number) {
        setCernerCondition(`Active Encounter: ${details.active_encounter_number}`);
      } else {
        setCernerCondition("Cerner EHR Record");
      }
      
      setStep("cerner_review");
    } catch (err: any) {
      console.error("Failed to fetch patient details:", err);
      setError("Failed to fetch demographics and encounter information for this patient.");
    } finally {
      setFetchingDetails(false);
    }
  };

  // Handle Manual Save
  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) {
      setError("Name is required");
      return;
    }
    const ageNum = parseInt(manualAge, 10);
    if (isNaN(ageNum) || ageNum <= 0) {
      setError("Valid age is required");
      return;
    }
    if (!manualCondition.trim()) {
      setError("Diagnosis/Condition is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createPatient({ name: manualName, age: ageNum, condition: manualCondition });
      navigate("/");
    } catch (e) {
      setError("Failed to save patient. Please try again.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // Handle Cerner Import Save
  const handleSaveCerner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    if (!selectedPatient.has_active_encounter) {
      setError("Registration blocked: Patient must have an active encounter.");
      return;
    }
    if (!cernerCondition.trim()) {
      setError("Diagnosis/Condition is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createPatient({
        name: selectedPatient.name,
        age: selectedPatient.age,
        condition: cernerCondition,
        cerner_patient_id: selectedPatient.id
      });
      navigate("/");
    } catch (e) {
      setError("Failed to register patient in RPM database.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="registration-page">
      <div className="registration-header">
        <button className="back-btn" onClick={() => navigate("/")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          Back to Beds
        </button>
        <h2 className="registration-title">Admitting & Registration Wizard</h2>
      </div>

      {error && <div className="global-error-banner">{error}</div>}

      {/* STEP 1: Choose Registration Method */}
      {step === "choose" && (
        <div className="choose-method-container">
          <div className="wizard-intro">
            <h3>Select Patient Admitting Method</h3>
            <p>Choose whether to sync an existing EHR record from Cerner or manually register a new patient directly.</p>
          </div>
          
          <div className="method-cards">
            <button className="method-card cerner-method" onClick={() => setStep("cerner_search")}>
              <div className="method-card__icon-wrap">
                <span className="cerner-logo">Cerner</span>
              </div>
              <h4>Import from Cerner EHR</h4>
              <p>Search Cerner database sandbox using system tokens, retrieve detailed demographics, and check for active encounters before admitting.</p>
              <div className="method-card__action">Search Cerner Registry &rarr;</div>
            </button>

            <button className="method-card manual-method" onClick={() => setStep("manual")}>
              <div className="method-card__icon-wrap">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="17" y1="11" x2="23" y2="11"></line>
                </svg>
              </div>
              <h4>Manual Patient Registration</h4>
              <p>Admit a patient manually by entering their name, age, and diagnosis. Generates a local device identifier code.</p>
              <div className="method-card__action">Open Admitting Form &rarr;</div>
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 (Manual Path): Admitting Form */}
      {step === "manual" && (
        <div className="manual-panel registration-panel single-panel">
          <div className="panel-header">
            <h3>Manual Admitting Form</h3>
            <button className="btn-link" onClick={() => setStep("choose")}>Change Method</button>
          </div>
          <p className="panel-desc">Admit a new patient manually into the Remote Patient Monitoring system if they are not in the EHR system.</p>

          <form onSubmit={handleSaveManual} className="manual-form">
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. John Doe"
                disabled={saving}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Age</label>
              <input
                type="number"
                value={manualAge}
                onChange={(e) => setManualAge(e.target.value)}
                placeholder="e.g. 45"
                min="1"
                max="120"
                disabled={saving}
                required
              />
            </div>

            <div className="form-group">
              <label>Diagnosis / Clinical Condition</label>
              <input
                type="text"
                value={manualCondition}
                onChange={(e) => setManualCondition(e.target.value)}
                placeholder="e.g. Severe Dehydration / Chest Pain"
                disabled={saving}
                required
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep("choose")}>Cancel</button>
              <button type="submit" className="submit-btn" disabled={saving}>
                {saving ? "Registering..." : "Register Patient"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2 (Cerner Path): Cerner Search */}
      {step === "cerner_search" && (
        <div className="cerner-panel registration-panel single-panel">
          <div className="panel-header">
            <div className="cerner-logo">Cerner</div>
            <h3>Search Cerner EHR Sandbox Registry</h3>
            <button className="btn-link" onClick={() => setStep("choose")}>Change Method</button>
          </div>
          
          <p className="panel-desc">
            Search for patient records in the global Cerner sandbox. You can search by name or patient ID.
          </p>
          
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Search by patient name or Cerner ID (e.g. Smith)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-btn" disabled={searching}>Search</button>
          </form>

          <div className="search-results">
            {searching ? (
              <div className="search-loading">
                <div className="spinner"></div>
                <p>Searching Cerner EHR Sandbox...</p>
              </div>
            ) : fetchingDetails ? (
              <div className="search-loading">
                <div className="spinner"></div>
                <p>Retrieving complete patient demographics & encounters...</p>
              </div>
            ) : searched && searchResults.length === 0 ? (
              <p className="empty-results">No patients found matching "{searchQuery}" in Cerner EHR.</p>
            ) : searchResults.length > 0 ? (
              <div className="results-list scrollable-results">
                {searchResults.map(p => (
                  <div key={p.id} className="result-item">
                    <div className="result-info">
                      <div className="result-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span 
                          style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: p.has_active_encounter ? '#22c55e' : '#ef4444',
                            flexShrink: 0
                          }} 
                          title={p.has_active_encounter ? "Active Encounter Found" : "No Active Encounter Found (Blocked)"}
                        />
                        {p.name}
                      </div>
                      <div className="result-meta">
                        <span>Cerner ID: <strong>{p.id}</strong></span>
                        <span>•</span>
                        <span>{p.age} years old</span>
                      </div>
                    </div>
                    <button 
                      className="import-btn-arrow" 
                      onClick={() => handleSelectCernerPatient(p.id)}
                      title={p.has_active_encounter ? "Fetch Demographics & Proceed" : "Fetch Demographics (Encounter Blocked)"}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="search-placeholder">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <p>Enter a patient name or ID to query sandbox records.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3 (Cerner Path): Cerner Review & Encounter Check */}
      {step === "cerner_review" && selectedPatient && (
        <div className="cerner-review-grid">
          {/* Demographics Column */}
          <div className="registration-panel review-panel">
            <div className="panel-header">
              <h3>Cerner EHR Demographics</h3>
            </div>
            
            <div className="patient-demographics-card">
              <div className="demo-header-info">
                <h4>{selectedPatient.name}</h4>
                <div className="demo-p-badges">
                  <span className="badge badge--gender">{selectedPatient.gender}</span>
                  <span className="badge badge--age">{selectedPatient.age} years</span>
                </div>
              </div>

              <div className="demo-details-list">
                <div className="demo-detail-item">
                  <span className="item-label">Cerner Patient ID</span>
                  <span className="item-value font-mono">{selectedPatient.id}</span>
                </div>
                <div className="demo-detail-item">
                  <span className="item-label">Birth Date</span>
                  <span className="item-value">{selectedPatient.birth_date}</span>
                </div>
                <div className="demo-detail-item">
                  <span className="item-label">Address(es)</span>
                  <div className="item-value-multiline">
                    {selectedPatient.addresses.length > 0 ? (
                      selectedPatient.addresses.map((addr: string, i: number) => (
                        <p key={i} className="addr-line">{addr}</p>
                      ))
                    ) : (
                      <p className="no-data">No address listed in EHR</p>
                    )}
                  </div>
                </div>
                <div className="demo-detail-item">
                  <span className="item-label">Telecom / Contact</span>
                  <div className="item-value-multiline">
                    {selectedPatient.telecoms.length > 0 ? (
                      selectedPatient.telecoms.map((tel: string, i: number) => (
                        <p key={i} className="tel-line">{tel}</p>
                      ))
                    ) : (
                      <p className="no-data">No contact information listed</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Validation & Admitting Column */}
          <div className="registration-panel validation-panel">
            <div className="panel-header">
              <h3>Encounter Status & Verification</h3>
            </div>
            
            {/* Encounter validation banner */}
            {selectedPatient.has_active_encounter ? (
              <div className="validation-banner success">
                <div className="banner-icon">✓</div>
                <div className="banner-text">
                  <h5>Active Encounter Validated</h5>
                  <p>
                    The patient has an active <strong>in-progress</strong> encounter in Cerner.
                    <br />
                    Encounter Number: <strong>{selectedPatient.active_encounter_number}</strong>
                  </p>
                </div>
              </div>
            ) : (
              <div className="validation-banner failure">
                <div className="banner-icon">✕</div>
                <div className="banner-text">
                  <h5>Registration Blocked</h5>
                  <p>
                    No active <strong>in-progress</strong> encounters were found for this patient.
                    Cerner patient admission is strictly restricted to patients with active encounters.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveCerner} className="manual-form admitting-form">
              <div className="form-group">
                <label>Diagnosis / Clinical Condition</label>
                <input
                  type="text"
                  value={cernerCondition}
                  onChange={(e) => setCernerCondition(e.target.value)}
                  placeholder="e.g. Acute Respiratory Failure"
                  disabled={saving || !selectedPatient.has_active_encounter}
                  required
                />
                <span className="input-helper">Please verify or enter the admitting diagnosis for the RPM system.</span>
              </div>

              <div className="form-actions-review">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => setStep("cerner_search")}
                >
                  &larr; Back to Search
                </button>
                <button 
                  type="submit" 
                  className="submit-btn" 
                  disabled={saving || !selectedPatient.has_active_encounter}
                >
                  {saving ? "Registering..." : "Confirm & Admit Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

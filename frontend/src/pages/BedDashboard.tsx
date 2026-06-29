import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import PatientOverviewCard from "../components/PatientOverviewCard";
import { fetchBeds, assignBed, unassignBed } from "../api";
import type { Patient } from "../types";
import "./BedDashboard.css";

interface LayoutContext {
  patients: Record<string, Patient>;
  connected: boolean;
  isDataStale: boolean;
}

const DEFAULT_BEDS = ["101", "102", "103", "104", "105", "106", "107", "108"];

export default function BedDashboard() {
  const navigate = useNavigate();
  const { patients } = useOutletContext<LayoutContext>();
  const [bedMapping, setBedMapping] = useState<Record<string, string>>({});
  const [bedsList, setBedsList] = useState<string[]>([]);
  const [newBedName, setNewBedName] = useState("");
  const [showAddBed, setShowAddBed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [textSize, setTextSize] = useState<"small" | "medium" | "large">(
    () => (localStorage.getItem("rpm_bed_card_text_size") as "small" | "medium" | "large") || "medium"
  );

  const handleTextSizeChange = (size: "small" | "medium" | "large") => {
    setTextSize(size);
    localStorage.setItem("rpm_bed_card_text_size", size);
  };

  // Load beds list from localStorage or use defaults
  useEffect(() => {
    const savedBeds = localStorage.getItem("rpm_beds_list");
    if (savedBeds) {
      try {
        setBedsList(JSON.parse(savedBeds));
      } catch (e) {
        setBedsList(DEFAULT_BEDS);
      }
    } else {
      setBedsList(DEFAULT_BEDS);
      localStorage.setItem("rpm_beds_list", JSON.stringify(DEFAULT_BEDS));
    }
  }, []);

  // Fetch bed-patient mappings from SQLite DB
  const loadMappings = async () => {
    try {
      const mappings = await fetchBeds();
      setBedMapping(mappings);
    } catch (e) {
      console.error("Failed to load bed mappings from SQLite:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMappings();
  }, []);

  // Save beds list helper
  const saveBedsList = (newList: string[]) => {
    setBedsList(newList);
    localStorage.setItem("rpm_beds_list", JSON.stringify(newList));
  };

  // Add a new Bed definition
  const handleAddBed = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBedName.trim();
    if (!trimmed) return;
    if (bedsList.includes(trimmed)) {
      alert("This bed already exists!");
      return;
    }
    const newList = [...bedsList, trimmed].sort();
    saveBedsList(newList);
    setNewBedName("");
    setShowAddBed(false);
  };

  // Remove a Bed definition (only if empty)
  const handleDeleteBed = (bedId: string) => {
    if (bedMapping[bedId]) {
      alert("Cannot delete a bed that has a patient assigned. Please release the patient first.");
      return;
    }
    if (window.confirm(`Are you sure you want to delete Bed ${bedId}?`)) {
      const newList = bedsList.filter(b => b !== bedId);
      saveBedsList(newList);
    }
  };

  // Handle Assigning patient to bed
  const handleAssignPatient = async (bedId: string, patientId: string) => {
    try {
      await assignBed(bedId, patientId);
      await loadMappings();
    } catch (e) {
      alert("Failed to assign patient. Please try again.");
    }
  };

  // Handle Unassigning patient from bed
  const handleUnassignPatient = async (bedId: string) => {
    try {
      await unassignBed(bedId);
      await loadMappings();
    } catch (e) {
      alert("Failed to unassign patient. Please try again.");
    }
  };

  // Find patients that are NOT assigned to any bed in SQLite mappings
  const assignedPatientIds = Object.values(bedMapping);
  const unassignedPatients = Object.values(patients).filter(
    p => !assignedPatientIds.includes(p.id)
  );

  return (
    <div className="bed-dashboard">
      <div className="bed-dashboard__header-bar">
        <div>
          <h2 className="bed-dashboard__title">ICU RPM System</h2>
          <p className="bed-dashboard__subtitle">Monitor active telemetry feeds mapped to physical beds</p>
        </div>
        
        <div className="bed-dashboard__actions">
          <div className="text-resize-toolbar" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(255,255,255,0.15)', padding: '2px', borderRadius: '4px', background: 'rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '11px', color: 'var(--slate-400)', padding: '0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Font</span>
            <button 
              type="button" 
              className={`btn-text-size ${textSize === 'small' ? 'active' : ''}`} 
              onClick={() => handleTextSizeChange('small')}
              title="Small Text"
              style={{ padding: '2px 8px', fontSize: '11px', background: textSize === 'small' ? 'var(--blue-600)' : 'transparent', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '3px', fontWeight: 600 }}
            >
              A-
            </button>
            <button 
              type="button" 
              className={`btn-text-size ${textSize === 'medium' ? 'active' : ''}`} 
              onClick={() => handleTextSizeChange('medium')}
              title="Medium Text"
              style={{ padding: '2px 8px', fontSize: '12px', background: textSize === 'medium' ? 'var(--blue-600)' : 'transparent', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '3px', fontWeight: 600 }}
            >
              A
            </button>
            <button 
              type="button" 
              className={`btn-text-size ${textSize === 'large' ? 'active' : ''}`} 
              onClick={() => handleTextSizeChange('large')}
              title="Large Text"
              style={{ padding: '2px 8px', fontSize: '14px', background: textSize === 'large' ? 'var(--blue-600)' : 'transparent', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '3px', fontWeight: 600 }}
            >
              A+
            </button>
          </div>

          {showAddBed ? (
            <form onSubmit={handleAddBed} className="bed-dashboard__add-bed-form">
              <input
                type="text"
                value={newBedName}
                onChange={e => setNewBedName(e.target.value)}
                placeholder="Bed Name (e.g. 109)"
                className="bed-dashboard__bed-input"
                autoFocus
                required
              />
              <button type="submit" className="btn-add-bed-submit">Add</button>
              <button type="button" className="btn-add-bed-cancel" onClick={() => setShowAddBed(false)}>✕</button>
            </form>
          ) : (
            <button className="btn-secondary" onClick={() => setShowAddBed(true)}>
              + Add Bed
            </button>
          )}
          
          <button className="btn-primary" onClick={() => navigate("/register")}>
            Register / Search Cerner
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bed-dashboard__loading">Loading beds data...</div>
      ) : (
        <div className={`bed-dashboard__grid bed-dashboard__grid--ts-${textSize}`}>
          {bedsList.map(bedId => {
            const patientId = bedMapping[bedId];
            const patient = patientId ? patients[patientId] || null : null;
            return (
              <div key={bedId} className="bed-dashboard__card-wrapper">
                <PatientOverviewCard
                  bedId={bedId}
                  patient={patient}
                  unassignedPatients={unassignedPatients}
                  onAssign={(pId) => handleAssignPatient(bedId, pId)}
                  onUnassign={() => handleUnassignPatient(bedId)}
                />
                {!patient && (
                  <button 
                    className="bed-dashboard__delete-bed" 
                    onClick={() => handleDeleteBed(bedId)}
                    title={`Delete Bed ${bedId}`}
                  >
                    🗑️
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

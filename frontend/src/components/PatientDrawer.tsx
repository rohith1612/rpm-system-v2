import { useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { useNavigate } from 'react-router-dom';
import PatientModal from './PatientModal';
import { deletePatient } from '../api';
export default function PatientDrawer() {
  const { drawerOpen, armedPatientId, setArmedPatient } = useUiStore();
  const { patients } = useWebSocket();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);

  const handlePatientClick = (id: string) => {
    // If we click the armed patient, toggle it off
    if (armedPatientId === id) {
      setArmedPatient(null);
    } else {
      setArmedPatient(id);
    }
  };

  const handleNavigateToPatient = (id: string) => {
    navigate(`/patient/${id}`);
  };

  const handleDeletePatient = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this patient from the app?')) {
      try {
        await deletePatient(id);
        if (armedPatientId === id) setArmedPatient(null);
      } catch (err) {
        console.error("Failed to delete patient", err);
      }
    }
  };

  return (
    <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
      <div className="drawer-inner">
        <div className="drawer-label">Patients</div>
        {Object.values(patients).map((patient) => {
          const isArmed = armedPatientId === patient.id;
          return (
            <div 
              key={patient.id}
              className={`pat-row ${isArmed ? 'armed' : 'mapped'}`}
              onClick={() => {
                // If they have no bed assigned, maybe arm them? 
                // For simplicity, we just arm them if on floor view, or navigate if on monitor view
                if (window.location.pathname === '/') {
                  handlePatientClick(patient.id);
                } else {
                  handleNavigateToPatient(patient.id);
                }
              }}
            >
              <span className="pat-dot"></span>
              <div>
                <div className="pat-name">{patient.name}</div>
                <div className="pat-tags">{patient.age}y &nbsp;&middot;&nbsp; {patient.condition}</div>
                {patient.cerner_patient_id && (
                  <div className="pat-id">CERNER {patient.cerner_patient_id}</div>
                )}
              </div>
              <button 
                className="delete-patient-btn"
                onClick={(e) => handleDeletePatient(e, patient.id)}
                title="Delete Patient"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}

        <button className="add-patient-btn" onClick={() => setShowModal(true)}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Patient
        </button>

        {armedPatientId && (
          <div className="map-hint">SELECT AN UNASSIGNED BED ON THE FLOOR TO MAP THIS PATIENT</div>
        )}
      </div>

      {showModal && (
        <PatientModal 
          onClose={() => setShowModal(false)} 
          onSaved={(newId) => {
            setShowModal(false);
            setArmedPatient(newId);
          }} 
        />
      )}
    </div>
  );
}

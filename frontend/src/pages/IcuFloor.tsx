import { useEffect, useState } from 'react';
import { fetchBeds, assignBed, unassignBed } from '../api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useUiStore } from '../store/uiStore';
import { useNavigate } from 'react-router-dom';
import { isPatientActive, getVitalStatus, VITAL_CONFIGS } from '../types';
import PatientModal from '../components/PatientModal';

export default function IcuFloor() {
  const { patients, alerts } = useWebSocket();
  const { armedPatientId, setArmedPatient } = useUiStore();
  const [bedMap, setBedMap] = useState<Record<string, string>>({});
  const [bedsList, setBedsList] = useState<string[]>(['BED 101', 'BED 102', 'BED 103', 'BED 104', 'BED 105', 'BED 106', 'BED 107', 'BED 108']);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadBeds();
  }, []);

  const loadBeds = async () => {
    try {
      const data = await fetchBeds();
      setBedMap(data || {});
    } catch (e) {
      console.error(e);
    }
  };

  const handleBedClick = async (bedId: string) => {
    if (armedPatientId) {
      // Assign
      try {
        await assignBed(bedId, armedPatientId);
        setArmedPatient(null);
        loadBeds();
      } catch (e) {
        console.error(e);
      }
    } else {
      // Navigate to patient if assigned
      const pid = bedMap[bedId];
      if (pid && patients[pid]) {
        navigate(`/patient/${pid}`);
      }
    }
  };

  const handleUnassign = async (e: React.MouseEvent, bedId: string) => {
    e.stopPropagation();
    try {
      await unassignBed(bedId);
      loadBeds();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddBed = () => {
    const nextNum = 101 + bedsList.length;
    setBedsList([...bedsList, `BED ${nextNum}`]);
  };

  return (
    <div className="content" id="icuView">
      <div className="floor-head">
        <div>
          <h1>ICU RPM SYSTEM</h1>
          <p>MONITOR ACTIVE TELEMETRY FEEDS MAPPED TO PHYSICAL BEDS</p>
        </div>
        <div className="floor-controls">
          <button className="solid-btn dark" onClick={handleAddBed}>+ Add Bed</button>
          <button className="solid-btn accent" onClick={() => setShowPatientModal(true)}>Register / Search Cerner</button>
        </div>
      </div>

      <div className="bed-floor">
        {bedsList.map((bedId) => {
          const patientId = bedMap[bedId];
          const patient = patientId ? patients[patientId] : null;

          if (patient) {
            const isLive = isPatientActive(patient);
            const isCritical = alerts.some(a => a.patient_id === patientId && a.severity === 'critical');

            let statusColor = 'var(--green)';
            if (!isLive) {
              statusColor = 'var(--ink)';
            } else if (isCritical) {
              statusColor = 'var(--red)';
            }

            return (
              <div key={bedId} className={`bed ${isLive ? 'live' : ''} ${isCritical ? 'critical' : ''}`} onClick={() => handleBedClick(bedId)} style={{ cursor: 'pointer' }}>
                <div className="bed-top">
                  <div className="bed-num"><span className="pat-dot" style={{ background: statusColor, boxShadow: 'none' }}></span>{bedId}</div>
                  <div className="bed-tags">
                    {isLive ? <span className="bt live" style={{ background: statusColor }}>LIVE</span> : <span className="bt" style={{ border: '1px solid var(--line)' }}>OFFLINE</span>}
                    {patient.cerner_patient_id && <span className="bt fhir">FHIR</span>}
                    <span className="bed-x" onClick={(e) => handleUnassign(e, bedId)}>&times;</span>
                  </div>
                </div>
                <div className="bed-pname">{patient.name}</div>
                <div className="bed-meta2">AGE {patient.age} &middot; {patient.condition} &middot; ID {patient.id}</div>
                {patient.cerner_patient_id && (
                  <div className="bed-cerner2">CERNER {patient.cerner_patient_id}</div>
                )}
                <div className="sig">
                  {[1,2,3,4,5].map(i => <span key={i} style={{ background: statusColor }}></span>)}
                </div>
                <div className="bed-vrow">
                  <div className="bv2"><div className="l">HR</div><div className="v">{patient.heart_rate ?? '--'}</div><div className="u">bpm</div></div>
                  <div className="bv2"><div className="l">O2</div><div className="v">{patient.spo2 ?? '--'}</div><div className="u">%</div></div>
                  <div className="bv2"><div className="l">TMP</div><div className="v">{patient.temperature ?? '--'}</div><div className="u">&deg;C</div></div>
                  <div className="bv2"><div className="l">RR</div><div className="v">{patient.respiratory_rate ?? '--'}</div><div className="u">br/min</div></div>
                  <div className="bv2"><div className="l">BP</div><div className="v" style={{ fontSize: '11px' }}>{patient.systolic_bp ?? '--'}/{patient.diastolic_bp ?? '--'}</div><div className="u">mmHg</div></div>
                </div>
                <div className="bed-sys2">
                  <span>SYS_STAT: {isLive ? 'ONLINE' : 'STALE'}</span>
                  <span></span>
                </div>
              </div>
            );
          }

          // Empty Bed
          return (
            <div
              key={bedId}
              className={`bed ${armedPatientId ? 'armable' : 'unassigned'}`}
              onClick={() => handleBedClick(bedId)}
            >
              <div className="bed-top">
                <div className="bed-num">{bedId}</div>
              </div>
              <div className="bed-empty-state">
                <div className="lbl">UNASSIGNED</div>
                <div className="np">NO PATIENTS AVAILABLE</div>
                <div className="np-hint">CLICK TO MAP PATIENT</div>
              </div>
            </div>
          );
        })}
      </div>

      {showPatientModal && (
        <PatientModal onClose={() => setShowPatientModal(false)} />
      )}
    </div>
  );
}

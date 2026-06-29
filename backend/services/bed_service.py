"""
Service for managing patient-bed mappings.
"""

from typing import Dict, Optional
from backend.database.connection import get_connection

def get_all_beds() -> Dict[str, Optional[str]]:
    """Returns a dictionary of bed_id -> patient_id."""
    conn = get_connection()
    cursor = conn.execute("SELECT bed_id, patient_id FROM patient_beds")
    rows = cursor.fetchall()
    return {row["bed_id"]: row["patient_id"] for row in rows}

def assign_patient_to_bed(bed_id: str, patient_id: str) -> None:
    """Assigns a patient to a bed. Removes patient from any previous bed."""
    conn = get_connection()
    # Remove patient from any existing bed
    conn.execute("DELETE FROM patient_beds WHERE patient_id = ?", (patient_id,))
    
    # Insert or update the bed assignment
    conn.execute(
        "INSERT INTO patient_beds (bed_id, patient_id) VALUES (?, ?) ON CONFLICT (bed_id) DO UPDATE SET patient_id = EXCLUDED.patient_id",
        (bed_id, patient_id)
    )
    conn.commit()

def unassign_bed(bed_id: str) -> None:
    """Removes any patient assigned to the bed."""
    conn = get_connection()
    conn.execute("DELETE FROM patient_beds WHERE bed_id = ?", (bed_id,))
    conn.commit()

def unassign_patient(patient_id: str) -> None:
    """Removes the patient from their assigned bed."""
    conn = get_connection()
    conn.execute("DELETE FROM patient_beds WHERE patient_id = ?", (patient_id,))
    conn.commit()


import time
_active_patients_cache = [0.0, set()]

def get_active_patient_ids() -> set[str]:
    """Get patient IDs currently assigned to beds, cached for 5 seconds to avoid DB hits."""
    now = time.time()
    if now - _active_patients_cache[0] > 5.0:
        try:
            beds = get_all_beds()
            active_ids = {pid for pid in beds.values() if pid}
            _active_patients_cache[0] = now
            _active_patients_cache[1] = active_ids
        except Exception as e:
            print(f"[RPM] Error loading active bed patients: {e}")
    return _active_patients_cache[1]


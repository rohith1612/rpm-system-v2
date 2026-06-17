"""
REST API endpoints for patient data.
"""

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.config import ALERT_THRESHOLDS
from backend.services.alert_service import get_custom_thresholds, set_custom_thresholds
from backend.services.vitals_service import get_all_patients, get_patient

class ThresholdUpdate(BaseModel):
    vital_type: str
    warn_low: Optional[float] = None
    crit_low: Optional[float] = None
    warn_high: Optional[float] = None
    crit_high: Optional[float] = None

class PatientCreateUpdate(BaseModel):
    name: str
    age: int
    condition: str

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("")
def list_patients():
    """List all patients with their latest vital snapshot."""
    return get_all_patients()


@router.get("/{patient_id}")
def get_patient_detail(patient_id: str):
    """Get a single patient with latest vitals."""
    patient = get_patient(patient_id)
    if patient is None:
        return {"error": "Patient not found"}, 404
    return patient

@router.post("")
async def create_new_patient(patient: PatientCreateUpdate):
    """Create a new patient."""
    from backend.services.vitals_service import create_patient, get_latest_vitals_map
    from backend.routers.websocket import broadcast
    res = create_patient(patient.name, patient.age, patient.condition)
    await broadcast({"type": "snapshot", "data": get_latest_vitals_map()})
    return res

@router.put("/{patient_id}")
async def update_existing_patient(patient_id: str, patient: PatientCreateUpdate):
    """Update an existing patient."""
    from backend.services.vitals_service import update_patient, get_latest_vitals_map
    from backend.routers.websocket import broadcast
    res = update_patient(patient_id, patient.name, patient.age, patient.condition)
    await broadcast({"type": "snapshot", "data": get_latest_vitals_map()})
    return res

@router.delete("/{patient_id}")
async def delete_existing_patient(patient_id: str):
    """Delete a patient and all their related data."""
    from backend.services.vitals_service import delete_patient, get_latest_vitals_map
    from backend.routers.websocket import broadcast
    delete_patient(patient_id)
    await broadcast({"type": "snapshot", "data": get_latest_vitals_map()})
    return {"status": "success"}

@router.get("/{patient_id}/thresholds")
def get_thresholds(patient_id: str):
    """Get custom thresholds merged with defaults."""
    custom = get_custom_thresholds(patient_id)
    result = []
    for vital, default_bounds in ALERT_THRESHOLDS.items():
        bounds = custom.get(vital, default_bounds)
        result.append(
            {
                "vital_type": vital,
                "warn_low": bounds.get("warn_low"),
                "crit_low": bounds.get("crit_low"),
                "warn_high": bounds.get("warn_high"),
                "crit_high": bounds.get("crit_high"),
                "is_custom": vital in custom,
            }
        )
    return result


@router.put("/{patient_id}/thresholds")
def update_thresholds(patient_id: str, thresholds: List[ThresholdUpdate]):
    """Save custom thresholds for a patient."""
    set_custom_thresholds(patient_id, [t.dict() for t in thresholds])
    return {"status": "success"}

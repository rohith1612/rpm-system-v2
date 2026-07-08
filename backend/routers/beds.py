"""
REST API endpoints for patient-bed mappings.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from backend.services.bed_service import (assign_patient_to_bed, get_all_beds,
                                          unassign_bed)


class BedAssignment(BaseModel):
    patient_id: str


router = APIRouter(prefix="/api/beds", tags=["beds"])


@router.get("")
def list_beds():
    """List all bed mappings."""
    return get_all_beds()


@router.post("/{bed_id}/assign")
def assign_bed(bed_id: str, assignment: BedAssignment):
    """Assign a patient to a bed."""
    assign_patient_to_bed(bed_id, assignment.patient_id)
    return {"status": "success", "bed_id": bed_id, "patient_id": assignment.patient_id}


@router.delete("/{bed_id}/unassign")
def remove_bed_assignment(bed_id: str):
    """Unassign any patient from a bed."""
    unassign_bed(bed_id)
    return {"status": "success", "bed_id": bed_id}

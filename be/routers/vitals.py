"""
REST API endpoints for vital signs history and alerts.
"""

from fastapi import APIRouter, Query

from backend.services.alert_service import get_patient_alerts
from backend.services.vitals_service import get_vitals_history, get_hourly_history_aggregated

router = APIRouter(prefix="/api/patients", tags=["vitals"])


@router.get("/{patient_id}/history")
def patient_hourly_history(
    patient_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    hour: int = Query(..., ge=0, le=23, description="Hour of day (0-23)"),
):
    """Return 1 hour of aggregated historical vitals."""
    return get_hourly_history_aggregated(patient_id, date, hour)


@router.get("/{patient_id}/vitals")
def patient_vitals_history(
    patient_id: str,
    minutes: int = Query(default=30, ge=1, le=1440),
    end_time: float | None = Query(default=None),
):
    """Return historical vitals for charting."""
    return get_vitals_history(patient_id, minutes, end_time)


@router.get("/{patient_id}/alerts")
def patient_alerts(
    patient_id: str,
    limit: int = Query(default=50, ge=1, le=200),
):
    """Return recent alerts for a patient."""
    return get_patient_alerts(patient_id, limit)

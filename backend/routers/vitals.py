"""
REST API endpoints for vital signs history and alerts.
"""

from fastapi import APIRouter, Depends, Query

from backend.auth_dependency import require_auth
from backend.services.alert_service import get_patient_alerts, get_alert_timeline, get_alert_stats
from backend.services.vitals_service import (get_hourly_history_aggregated,
                                             get_vitals_history,
                                             get_summary_aggregated,
                                             get_multi_hour_history)

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
    limit: int = Query(default=50, ge=1, le=500),
    hours: int = Query(default=None, ge=1, le=720),
):
    """Return recent alerts for a patient."""
    return get_patient_alerts(patient_id, limit, hours)


@router.get("/{patient_id}/summary")
def patient_vitals_summary(
    patient_id: str,
    hours: int = Query(default=24, ge=1, le=168, description="Hours to summarize (max 7 days)"),
    _token: str = Depends(require_auth),
):
    """Return hourly-aggregated vital summaries (min/max/avg per hour)."""
    return get_summary_aggregated(patient_id, hours)


@router.get("/{patient_id}/history-range")
def patient_history_range(
    patient_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    start_hour: int = Query(..., ge=0, le=23),
    end_hour: int = Query(..., ge=0, le=23),
    _token: str = Depends(require_auth),
):
    """Return 1-minute resolution vitals across a range of hours."""
    return get_multi_hour_history(patient_id, date, start_hour, end_hour)


@router.get("/{patient_id}/alert-timeline")
def patient_alert_timeline(
    patient_id: str,
    hours: int = Query(default=24, ge=1, le=168),
    _token: str = Depends(require_auth),
):
    """Return alerts grouped by hour for timeline chart plotting."""
    return get_alert_timeline(patient_id, hours)


@router.get("/{patient_id}/alert-stats")
def patient_alert_stats(
    patient_id: str,
    hours: int = Query(default=24, ge=1, le=168),
    _token: str = Depends(require_auth),
):
    """Return alert analytics summary."""
    return get_alert_stats(patient_id, hours)


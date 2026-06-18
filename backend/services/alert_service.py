"""
Threshold-based alert generation for vital signs.
"""

from backend.config import ALERT_THRESHOLDS

from backend.database.models import (
    Alert,
    PatientThreshold,
)

from backend.database.session import SessionLocal


def get_custom_thresholds(
    patient_id: str,
) -> dict:
    """
    Fetch custom thresholds for a patient.
    """

    db = SessionLocal()

    try:

        rows = (
            db.query(PatientThreshold)
            .filter(
                PatientThreshold.patient_id
                == patient_id
            )
            .all()
        )

        result = {}

        for row in rows:

            result[row.vital_type] = {
                "vital_type":
                    row.vital_type,
                "warn_low":
                    row.warn_low,
                "crit_low":
                    row.crit_low,
                "warn_high":
                    row.warn_high,
                "crit_high":
                    row.crit_high,
            }

        return result

    finally:
        db.close()


def set_custom_thresholds(
    patient_id: str,
    thresholds: list,
):
    """
    Save custom thresholds for a patient.
    """

    db = SessionLocal()

    try:

        (
            db.query(PatientThreshold)
            .filter(
                PatientThreshold.patient_id
                == patient_id
            )
            .delete()
        )

        for t in thresholds:

            threshold = PatientThreshold(
                patient_id=patient_id,
                vital_type=t["vital_type"],
                warn_low=t.get("warn_low"),
                crit_low=t.get("crit_low"),
                warn_high=t.get("warn_high"),
                crit_high=t.get("crit_high"),
            )

            db.add(threshold)

        db.commit()

    finally:
        db.close()


def check_vitals(
    data: dict,
) -> list[dict]:
    """
    Evaluate a vitals reading against configured
    or custom thresholds.

    Returns a list of alerts.
    """

    alerts = []

    patient_id = data["patient_id"]

    custom_bounds = get_custom_thresholds(
        patient_id
    )

    for (
        vital_name,
        default_bounds,
    ) in ALERT_THRESHOLDS.items():

        value = data.get(vital_name)

        if value is None:
            continue

        bounds = custom_bounds.get(
            vital_name,
            default_bounds,
        )

        severity = None
        message = None

        if (
            bounds["crit_low"] is not None
            and value < bounds["crit_low"]
        ):
            severity = "critical"

            message = (
                f"{vital_name} critically low: "
                f"{value}"
            )

        elif (
            bounds["crit_high"] is not None
            and value > bounds["crit_high"]
        ):
            severity = "critical"

            message = (
                f"{vital_name} critically high: "
                f"{value}"
            )

        elif (
            bounds["warn_low"] is not None
            and value < bounds["warn_low"]
        ):
            severity = "warning"

            message = (
                f"{vital_name} below normal: "
                f"{value}"
            )

        elif (
            bounds["warn_high"] is not None
            and value > bounds["warn_high"]
        ):
            severity = "warning"

            message = (
                f"{vital_name} above normal: "
                f"{value}"
            )

        if severity:

            alert = {
                "patient_id":
                    patient_id,

                "vital_type":
                    vital_name,

                "value":
                    value,

                "severity":
                    severity,

                "message":
                    message,
            }

            alerts.append(alert)

            _store_alert(alert)

    return alerts


def _store_alert(
    alert: dict,
):
    """
    Persist an alert to PostgreSQL.
    """

    db = SessionLocal()

    try:

        alert_row = Alert(
            patient_id=alert["patient_id"],
            vital_type=alert["vital_type"],
            value=alert["value"],
            severity=alert["severity"],
            message=alert["message"],
        )

        db.add(alert_row)

        db.commit()

    finally:
        db.close()


def get_patient_alerts(
    patient_id: str,
    limit: int = 50,
):
    """
    Retrieve recent alerts for a patient.
    """

    db = SessionLocal()

    try:

        rows = (
            db.query(Alert)
            .filter(
                Alert.patient_id
                == patient_id
            )
            .order_by(
                Alert.created_at.desc()
            )
            .limit(limit)
            .all()
        )

        return [
            {
                "id":
                    row.id,

                "vital_type":
                    row.vital_type,

                "value":
                    row.value,

                "severity":
                    row.severity,

                "message":
                    row.message,

                "created_at":
                    row.created_at,

                "acknowledged":
                    row.acknowledged,
            }
            for row in rows
        ]

    finally:
        db.close()
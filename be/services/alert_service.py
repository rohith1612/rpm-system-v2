"""
Threshold-based alert generation for vital signs.
"""

from backend.config import ALERT_THRESHOLDS
from backend.database.connection import get_connection


def get_custom_thresholds(patient_id: str) -> dict:
    """Fetch custom thresholds for a patient."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT vital_type, warn_low, crit_low, warn_high, crit_high FROM patient_thresholds WHERE patient_id = ?",
        (patient_id,)
    ).fetchall()
    return {r["vital_type"]: dict(r) for r in rows}


def set_custom_thresholds(patient_id: str, thresholds: list):
    """Save custom thresholds for a patient."""
    conn = get_connection()
    conn.execute("DELETE FROM patient_thresholds WHERE patient_id = ?", (patient_id,))
    for t in thresholds:
        conn.execute(
            """INSERT INTO patient_thresholds 
               (patient_id, vital_type, warn_low, crit_low, warn_high, crit_high) 
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                patient_id,
                t["vital_type"],
                t.get("warn_low"),
                t.get("crit_low"),
                t.get("warn_high"),
                t.get("crit_high"),
            ),
        )
    conn.commit()


def check_vitals(data: dict) -> list[dict]:
    """
    Evaluate a vitals reading against configured or custom thresholds.
    Returns a list of alert dicts (may be empty if all normal).
    """
    alerts = []
    patient_id = data["patient_id"]
    custom_bounds = get_custom_thresholds(patient_id)

    for vital_name, default_bounds in ALERT_THRESHOLDS.items():
        value = data.get(vital_name)
        bounds = custom_bounds.get(vital_name, default_bounds)
        if value is None:
            continue

        severity = None
        message = None

        # Check critical first (more severe)
        if bounds["crit_low"] is not None and value < bounds["crit_low"]:
            severity = "critical"
            message = f"{vital_name} critically low: {value}"
        elif bounds["crit_high"] is not None and value > bounds["crit_high"]:
            severity = "critical"
            message = f"{vital_name} critically high: {value}"
        # Then warning
        elif bounds["warn_low"] is not None and value < bounds["warn_low"]:
            severity = "warning"
            message = f"{vital_name} below normal: {value}"
        elif bounds["warn_high"] is not None and value > bounds["warn_high"]:
            severity = "warning"
            message = f"{vital_name} above normal: {value}"

        if severity:
            alert = {
                "patient_id": patient_id,
                "vital_type": vital_name,
                "value": value,
                "severity": severity,
                "message": message,
            }
            alerts.append(alert)
            _store_alert(alert)

    return alerts


def _store_alert(alert: dict):
    """Persist an alert to the database."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO alerts (patient_id, vital_type, value, severity, message)
           VALUES (?, ?, ?, ?, ?)""",
        (
            alert["patient_id"],
            alert["vital_type"],
            alert["value"],
            alert["severity"],
            alert["message"],
        ),
    )
    conn.commit()


def get_patient_alerts(patient_id: str, limit: int = 50) -> list[dict]:
    """Retrieve recent alerts for a patient."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT id, vital_type, value, severity, message,
                  created_at, acknowledged
           FROM alerts
           WHERE patient_id = ?
           ORDER BY created_at DESC
           LIMIT ?""",
        (patient_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]

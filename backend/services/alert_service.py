"""
Threshold-based alert generation for vital signs.
"""

import logging

from backend.config import ALERT_THRESHOLDS
from backend.database.connection import get_connection
from backend.telemetry.logger import get_logger, log_event

logger = get_logger(__name__)


import time

_thresholds_cache = {}

def get_custom_thresholds(patient_id: str) -> dict:
    """Fetch custom thresholds for a patient (cached for 10s)."""
    now = time.time()
    if patient_id in _thresholds_cache:
        timestamp, data = _thresholds_cache[patient_id]
        if now - timestamp < 10.0:
            return data

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT vital_type, warn_low, crit_low, warn_high, crit_high FROM patient_thresholds WHERE patient_id = ?",
            (patient_id,),
        ).fetchall()
        data = {r["vital_type"]: dict(r) for r in rows}
        _thresholds_cache[patient_id] = (now, data)
        return data


def set_custom_thresholds(patient_id: str, thresholds: list):
    """Save custom thresholds for a patient."""
    with get_connection() as conn:
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

    if patient_id in _thresholds_cache:
        del _thresholds_cache[patient_id]


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
            # Alert stored in DB but not logged in system telemetry to avoid log bloat
            pass

    return alerts


def _store_alert(alert: dict):
    """Persist an alert to the database."""
    with get_connection() as conn:
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


def get_patient_alerts(patient_id: str, limit: int = 50, hours: int = None) -> list[dict]:
    """Retrieve recent alerts for a patient."""
    with get_connection() as conn:
        query = """SELECT id, vital_type, value, severity, message,
                          created_at, acknowledged
                   FROM alerts
                   WHERE patient_id = ?"""
        params = [patient_id]
        
        if hours is not None:
            from datetime import datetime, timedelta
            cutoff = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S")
            query += " AND created_at >= ?"
            params.append(cutoff)
            
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        
        rows = conn.execute(query, tuple(params)).fetchall()

        results = []
        from datetime import datetime

        for r in rows:
            d = dict(r)
            val = d.get("created_at")
            if isinstance(val, datetime):
                d["created_at"] = val.strftime("%Y-%m-%dT%H:%M:%S")
            elif isinstance(val, str):
                d["created_at"] = val.replace(" ", "T")
            results.append(d)
        return results


def get_alert_timeline(patient_id: str, hours: int = 24) -> list[dict]:
    """Return alerts grouped by hour for timeline chart plotting."""
    from datetime import datetime, timedelta

    cutoff = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S")

    with get_connection() as conn:
        rows = conn.execute(
            """SELECT
                  to_char(date_trunc('hour', created_at), 'YYYY-MM-DD"T"HH24:MI:SS') as bucket,
                  vital_type,
                  severity,
                  COUNT(*) as count
               FROM alerts
               WHERE patient_id = ?
                 AND created_at >= ?
               GROUP BY date_trunc('hour', created_at), vital_type, severity
               ORDER BY bucket ASC""",
            (patient_id, cutoff),
        ).fetchall()
        return [dict(r) for r in rows]


def get_alert_stats(patient_id: str, hours: int = 24) -> dict:
    """Return alert analytics summary: totals, severity distribution, top vital types."""
    from datetime import datetime, timedelta

    cutoff = (datetime.now() - timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%S")

    with get_connection() as conn:
        # Total count
        total_row = conn.execute(
            "SELECT COUNT(*) as total FROM alerts WHERE patient_id = ? AND created_at >= ?",
            (patient_id, cutoff),
        ).fetchone()
        total = dict(total_row)["total"] if total_row else 0

        # By severity
        severity_rows = conn.execute(
            """SELECT severity, COUNT(*) as count
               FROM alerts
               WHERE patient_id = ? AND created_at >= ?
               GROUP BY severity""",
            (patient_id, cutoff),
        ).fetchall()
        by_severity = {r["severity"]: r["count"] for r in severity_rows}

        # By vital type
        vital_rows = conn.execute(
            """SELECT vital_type, COUNT(*) as count
               FROM alerts
               WHERE patient_id = ? AND created_at >= ?
               GROUP BY vital_type
               ORDER BY count DESC""",
            (patient_id, cutoff),
        ).fetchall()
        by_vital = [{"vital_type": r["vital_type"], "count": r["count"]} for r in vital_rows]

        return {
            "total": total,
            "by_severity": by_severity,
            "by_vital": by_vital,
            "hours": hours,
        }


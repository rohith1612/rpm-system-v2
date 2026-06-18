"""
Business logic for storing and retrieving vital sign data.
"""

<<<<<<< HEAD
import random
from datetime import datetime, timedelta

from backend.database.models import (
    Patient,
    Vital,
)

from backend.database.session import SessionLocal


def create_patient(
    name: str,
    age: int,
    condition: str,
) -> dict:

    db = SessionLocal()

    try:

        patient_id = (
            f"PD_{random.randint(10000,99999)}"
        )

        while (
            db.query(Patient)
            .filter(
                Patient.id == patient_id
            )
            .first()
        ):
            patient_id = (
                f"PD_{random.randint(10000,99999)}"
            )

        patient = Patient(
            id=patient_id,
            name=name,
            age=age,
            condition=condition,
        )

        db.add(patient)
        db.commit()

        return {
            "id": patient_id,
            "name": name,
            "age": age,
            "condition": condition,
        }

    finally:
        db.close()


def update_patient(
    patient_id: str,
    name: str,
    age: int,
    condition: str,
):

    db = SessionLocal()

    try:

        patient = (
            db.query(Patient)
            .filter(
                Patient.id == patient_id
            )
            .first()
        )

        if not patient:
            return None

        patient.name = name
        patient.age = age
        patient.condition = condition

        db.commit()

        return get_patient(patient_id)

    finally:
        db.close()


def delete_patient(
    patient_id: str,
):

    db = SessionLocal()

    try:

        patient = (
            db.query(Patient)
            .filter(
                Patient.id == patient_id
            )
            .first()
        )

        if patient:
            db.delete(patient)
            db.commit()

    finally:
        db.close()


def store_vitals(
    data: dict,
):

    db = SessionLocal()

    try:

        timestamp = data.get(
            "timestamp"
        )

        if timestamp:

            if timestamp > 1000000000000:
                recorded_at = (
                    datetime.utcfromtimestamp(
                        timestamp / 1000.0
                    )
                )
            else:
                recorded_at = (
                    datetime.utcfromtimestamp(
                        timestamp
                    )
                )

        else:
            recorded_at = datetime.utcnow()

        vital = Vital(
            patient_id=data["patient_id"],
            heart_rate=data.get("heart_rate"),
            spo2=data.get("spo2"),
            temperature=data.get("temperature"),
            respiratory_rate=data.get(
                "respiratory_rate"
            ),
            systolic_bp=data.get(
                "systolic_bp"
            ),
            diastolic_bp=data.get(
                "diastolic_bp"
            ),
            recorded_at=recorded_at,
        )

        db.add(vital)
        db.commit()
        db.refresh(vital)

        return vital.id

    finally:
        db.close()


def get_all_patients():

    db = SessionLocal()

    try:

        patients = (
            db.query(Patient)
            .all()
        )

        result = []

        for patient in patients:

            latest = (
                db.query(Vital)
                .filter(
                    Vital.patient_id
                    == patient.id
                )
                .order_by(
                    Vital.recorded_at.desc()
                )
                .first()
            )

            result.append(
                {
                    "id": patient.id,
                    "name": patient.name,
                    "age": patient.age,
                    "condition": patient.condition,
                    "registered_at": patient.registered_at.isoformat()
                        if patient.registered_at else None,
                    "heart_rate":
                        latest.heart_rate
                        if latest else None,

                    "spo2":
                        latest.spo2
                        if latest else None,

                    "temperature":
                        latest.temperature
                        if latest else None,

                    "respiratory_rate":
                        latest.respiratory_rate
                        if latest else None,

                    "systolic_bp":
                        latest.systolic_bp
                        if latest else None,

                    "diastolic_bp":
                        latest.diastolic_bp
                        if latest else None,

                    "recorded_at": (
                        latest.recorded_at.isoformat()
                        if latest and latest.recorded_at
                        else None
                    ),
                }
            )

        return result

    finally:
        db.close()


def get_patient(
    patient_id: str,
):

    db = SessionLocal()

    try:

        patient = (
            db.query(Patient)
            .filter(
                Patient.id == patient_id
            )
            .first()
        )

        if not patient:
            return None

        latest = (
            db.query(Vital)
            .filter(
                Vital.patient_id
                == patient_id
            )
            .order_by(
                Vital.recorded_at.desc()
            )
            .first()
        )

        return {
            "id": patient.id,
            "name": patient.name,
            "age": patient.age,
            "condition": patient.condition,
            "registered_at": patient.registered_at.isoformat()
                if patient.registered_at else None,

            "heart_rate":
                latest.heart_rate
                if latest else None,

            "spo2":
                latest.spo2
                if latest else None,

            "temperature":
                latest.temperature
                if latest else None,

            "respiratory_rate":
                latest.respiratory_rate
                if latest else None,

            "systolic_bp":
                latest.systolic_bp
                if latest else None,

            "diastolic_bp":
                latest.diastolic_bp
                if latest else None,

            "recorded_at": (
                latest.recorded_at.isoformat()
                if latest and latest.recorded_at
                else None
            ),
        }

    finally:
        db.close()


def get_vitals_history(
    patient_id: str,
    minutes: int = 30,
    end_time=None,
):

    db = SessionLocal()

    try:

        if end_time:

            end_dt = datetime.fromtimestamp(
                end_time / 1000.0
            )

            start_dt = (
                end_dt
                - timedelta(
                    minutes=minutes
                )
            )

        else:

            end_dt = datetime.utcnow()

            start_dt = (
                end_dt
                - timedelta(
                    minutes=minutes
                )
            )

        rows = (
            db.query(Vital)
            .filter(
                Vital.patient_id
                == patient_id,
                Vital.recorded_at
                >= start_dt,
                Vital.recorded_at
                <= end_dt,
            )
            .order_by(
                Vital.recorded_at.asc()
            )
            .all()
        )

        return [
            {
                "heart_rate":
                    row.heart_rate,
                "spo2":
                    row.spo2,
                "temperature":
                    row.temperature,
                "respiratory_rate":
                    row.respiratory_rate,
                "systolic_bp":
                    row.systolic_bp,
                "diastolic_bp":
                    row.diastolic_bp,
                "recorded_at": 
                    row.recorded_at.isoformat(),
            }
            for row in rows
        ]

    finally:
        db.close()


def get_hourly_history_aggregated(
    patient_id: str,
    date_str: str,
    hour: int,
):

    db = SessionLocal()

    try:

        start_dt = datetime.strptime(
            f"{date_str} {hour}",
            "%Y-%m-%d %H",
        )

        end_dt = (
            start_dt
            + timedelta(hours=1)
        )

        rows = (
            db.query(Vital)
            .filter(
                Vital.patient_id
                == patient_id,
                Vital.recorded_at
                >= start_dt,
                Vital.recorded_at
                < end_dt,
            )
            .order_by(
                Vital.recorded_at.asc()
            )
            .all()
        )

        return [
            {
                "heart_rate":
                    row.heart_rate,
                "spo2":
                    row.spo2,
                "temperature":
                    row.temperature,
                "respiratory_rate":
                    row.respiratory_rate,
                "systolic_bp":
                    row.systolic_bp,
                "diastolic_bp":
                    row.diastolic_bp,
                "recorded_at":
                    row.recorded_at.isoformat(),
            }
            for row in rows
        ]

    finally:
        db.close()


def get_latest_vitals_map():

    patients = get_all_patients()

    result = {}

    for p in patients:

        result[p["id"]] = p

    return result
=======
import sqlite3
import random
from datetime import datetime, timezone

from backend.database.connection import get_connection

def _ensure_patient(conn: sqlite3.Connection, patient_id: str):
    """
    Deprecated: The system now strictly requires patients to be registered
    via the frontend API first. The MQTT listener rejects telemetry for
    unknown patients before it reaches this point.
    """
    pass


def create_patient(name: str, age: int, condition: str) -> dict:
    """Create a new patient with a random PD_XXXXX ID."""
    conn = get_connection()
    # Generate random 5-digit ID
    patient_id = f"PD_{random.randint(10000, 99999):05d}"
    
    # Ensure uniqueness
    while conn.execute("SELECT id FROM patients WHERE id = ?", (patient_id,)).fetchone():
        patient_id = f"PD_{random.randint(10000, 99999):05d}"
        
    conn.execute(
        "INSERT INTO patients (id, name, age, condition) VALUES (?, ?, ?, ?)",
        (patient_id, name, age, condition),
    )
    conn.commit()
    return {"id": patient_id, "name": name, "age": age, "condition": condition}

def update_patient(patient_id: str, name: str, age: int, condition: str) -> dict:
    """Update an existing patient's details."""
    conn = get_connection()
    conn.execute(
        "UPDATE patients SET name = ?, age = ?, condition = ? WHERE id = ?",
        (name, age, condition, patient_id),
    )
    conn.commit()
    return get_patient(patient_id)

def delete_patient(patient_id: str):
    """Delete a patient and cascade delete all their related telemetry and thresholds."""
    conn = get_connection()
    conn.execute("DELETE FROM vitals WHERE patient_id = ?", (patient_id,))
    conn.execute("DELETE FROM alerts WHERE patient_id = ?", (patient_id,))
    conn.execute("DELETE FROM patient_thresholds WHERE patient_id = ?", (patient_id,))
    conn.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
    conn.commit()


def store_vitals(data: dict):
    """
    Insert a vital signs reading into the database.
    Auto-registers the patient if they don't exist yet.
    Returns the inserted row id.
    """
    conn = get_connection()
    patient_id = data["patient_id"]
    _ensure_patient(conn, patient_id)

    recorded_at = datetime.fromtimestamp(
        data.get("timestamp", datetime.now().timestamp())
    ).strftime("%Y-%m-%dT%H:%M:%S")

    cursor = conn.execute(
        """INSERT INTO vitals
           (patient_id, heart_rate, spo2, temperature,
            respiratory_rate, systolic_bp, diastolic_bp, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            patient_id,
            data.get("heart_rate"),
            data.get("spo2"),
            data.get("temperature"),
            data.get("respiratory_rate"),
            data.get("systolic_bp"),
            data.get("diastolic_bp"),
            recorded_at,
        ),
    )
    conn.commit()
    return cursor.lastrowid


def get_all_patients() -> list[dict]:
    """Return all patients with their latest vital snapshot."""
    conn = get_connection()
    rows = conn.execute("""SELECT p.id, p.name, p.age, p.condition, p.registered_at,
                  v.heart_rate, v.spo2, v.temperature,
                  v.respiratory_rate, v.systolic_bp, v.diastolic_bp,
                  v.recorded_at
           FROM patients p
           LEFT JOIN vitals v ON v.id = (
               SELECT id FROM vitals
               WHERE patient_id = p.id
               ORDER BY recorded_at DESC LIMIT 1
           )
           ORDER BY p.id""").fetchall()
    return [dict(r) for r in rows]


def get_patient(patient_id: str) -> dict | None:
    """Single patient with latest vitals."""
    conn = get_connection()
    row = conn.execute(
        """SELECT p.id, p.name, p.age, p.condition, p.registered_at,
                  v.heart_rate, v.spo2, v.temperature,
                  v.respiratory_rate, v.systolic_bp, v.diastolic_bp,
                  v.recorded_at
           FROM patients p
           LEFT JOIN vitals v ON v.id = (
               SELECT id FROM vitals
               WHERE patient_id = p.id
               ORDER BY recorded_at DESC LIMIT 1
           )
           WHERE p.id = ?""",
        (patient_id,),
    ).fetchone()
    return dict(row) if row else None


def get_vitals_history(patient_id: str, minutes: int = 30, end_time: float | None = None) -> list[dict]:
    """Return time-series vitals for a patient within a specific window."""
    conn = get_connection()
    if end_time:
        end_dt = datetime.fromtimestamp(end_time / 1000.0).strftime("%Y-%m-%dT%H:%M:%S")
        from datetime import timedelta
        start_dt = (datetime.fromtimestamp(end_time / 1000.0) - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S")
        rows = conn.execute(
            """SELECT heart_rate, spo2, temperature,
                      respiratory_rate, systolic_bp, diastolic_bp,
                      recorded_at
               FROM vitals
               WHERE patient_id = ?
                 AND recorded_at >= ?
                 AND recorded_at <= ?
               ORDER BY recorded_at ASC""",
            (patient_id, start_dt, end_dt),
        ).fetchall()
    else:
        from datetime import timedelta
        cutoff = (datetime.now() - timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M:%S")
        rows = conn.execute(
            """SELECT heart_rate, spo2, temperature,
                      respiratory_rate, systolic_bp, diastolic_bp,
                      recorded_at
               FROM vitals
               WHERE patient_id = ?
                 AND recorded_at >= ?
               ORDER BY recorded_at ASC""",
            (patient_id, cutoff),
        ).fetchall()
    return [dict(r) for r in rows]


def get_hourly_history_aggregated(patient_id: str, date_str: str, hour: int) -> list[dict]:
    """
    Return 1 hour of vitals, aggregated into 1-minute averages (max 60 points).
    date_str: 'YYYY-MM-DD'
    hour: 0-23
    """
    conn = get_connection()
    # Use LIKE-based matching to handle any timezone suffix in stored data
    start_prefix = f"{date_str}T{hour:02d}:00"
    end_prefix = f"{date_str}T{hour:02d}:59"
    
    rows = conn.execute(
        """SELECT 
              strftime('%Y-%m-%dT%H:%M:00', recorded_at) as recorded_at,
              ROUND(AVG(heart_rate), 1) as heart_rate,
              ROUND(AVG(spo2), 1) as spo2,
              ROUND(AVG(temperature), 1) as temperature,
              ROUND(AVG(respiratory_rate), 1) as respiratory_rate,
              ROUND(AVG(systolic_bp), 1) as systolic_bp,
              ROUND(AVG(diastolic_bp), 1) as diastolic_bp
           FROM vitals
           WHERE patient_id = ?
             AND recorded_at >= ?
             AND recorded_at <= ?
           GROUP BY strftime('%Y-%m-%dT%H:%M', recorded_at)
           ORDER BY recorded_at ASC""",
        (patient_id, start_prefix, end_prefix + ":59"),
    ).fetchall()
    return [dict(r) for r in rows]


def get_latest_vitals_map() -> dict:
    """Return a dict of patient_id -> latest vitals (for WebSocket snapshot)."""
    patients = get_all_patients()
    result = {}
    for p in patients:
        result[p["id"]] = {
            "id": p["id"],
            "patient_id": p["id"],
            "name": p["name"],
            "age": p["age"],
            "condition": p["condition"],
            "heart_rate": p["heart_rate"],
            "spo2": p["spo2"],
            "temperature": p["temperature"],
            "respiratory_rate": p["respiratory_rate"],
            "systolic_bp": p["systolic_bp"],
            "diastolic_bp": p["diastolic_bp"],
            "recorded_at": p["recorded_at"],
        }
    return result
>>>>>>> origin/main

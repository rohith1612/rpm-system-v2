"""
Business logic for storing and retrieving vital sign data with in-memory caching and batched database flushes.
"""

import logging
import queue
import threading
import time
from datetime import datetime

from backend.database.connection import get_connection
from backend.telemetry.logger import get_logger, log_event, Timer

logger = get_logger(__name__)

vitals_queue = queue.Queue()
latest_vitals_cache = {}
latest_ecg_cache = {}


def _ensure_patient(conn, patient_id: str):
    """
    Deprecated: The system now strictly requires patients to be registered
    via the frontend API first. The MQTT listener rejects telemetry for
    unknown patients before it reaches this point.
    """
    pass


def create_patient(patient_id: str, name: str, age: int, condition: str) -> dict:
    """Create a new patient using the Cerner Patient ID as the primary key."""
    conn = get_connection()

    existing = conn.execute(
        "SELECT id FROM patients WHERE id = ?", (patient_id,)
    ).fetchone()
    if existing:
        raise Exception(f"A patient with ID {patient_id} already exists.")

    conn.execute(
        "INSERT INTO patients (id, name, age, condition) VALUES (?, ?, ?, ?)",
        (patient_id, name, age, condition),
    )
    conn.commit()
    log_event(
        logger, logging.INFO,
        "Patient created in NeonDB",
        event_category="neondb",
        event_type="patient_create",
        outcome="success",
        patient_id=patient_id,
    )
    return {"id": patient_id, "name": name, "age": age, "condition": condition}


def update_patient(patient_id: str, name: str, age: int, condition: str) -> dict:
    """Update an existing patient's details."""
    conn = get_connection()
    conn.execute(
        "UPDATE patients SET name = ?, age = ?, condition = ? WHERE id = ?",
        (name, age, condition, patient_id),
    )
    conn.commit()
    log_event(
        logger, logging.INFO,
        "Patient updated in NeonDB",
        event_category="neondb",
        event_type="patient_update",
        outcome="success",
        patient_id=patient_id,
    )
    return get_patient(patient_id)


def delete_patient(patient_id: str):
    """Delete a patient and cascade delete all their related telemetry and thresholds."""
    conn = get_connection()
    conn.execute("DELETE FROM vitals WHERE patient_id = ?", (patient_id,))
    conn.execute("DELETE FROM alerts WHERE patient_id = ?", (patient_id,))
    conn.execute("DELETE FROM patient_thresholds WHERE patient_id = ?", (patient_id,))
    conn.execute("DELETE FROM patient_beds WHERE patient_id = ?", (patient_id,))
    conn.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
    conn.commit()
    log_event(
        logger, logging.INFO,
        "Patient and all associated data deleted from NeonDB",
        event_category="neondb",
        event_type="patient_delete",
        outcome="success",
        patient_id=patient_id,
    )


def store_vitals(data: dict):
    """
    Queue vital signs reading in memory.
    Updates the in-memory latest vitals cache immediately.
    """
    patient_id = data.get("patient_id")
    if not patient_id:
        return None

    # Update in-memory latest cache for instantaneous API retrieval
    recorded_at = datetime.fromtimestamp(
        data.get("timestamp", datetime.now().timestamp())
    ).strftime("%Y-%m-%dT%H:%M:%S")

    latest_vitals_cache[patient_id] = {
        "id": patient_id,
        "patient_id": patient_id,
        "heart_rate": data.get("heart_rate"),
        "spo2": data.get("spo2"),
        "temperature": data.get("temperature"),
        "respiratory_rate": data.get("respiratory_rate"),
        "systolic_bp": data.get("systolic_bp"),
        "diastolic_bp": data.get("diastolic_bp"),
        "recorded_at": recorded_at,
    }

    # Queue it for 10-second batched db writes
    vitals_queue.put(data)
    return None


def store_ecg(patient_id: str, ecg_payload: dict, timestamp: float):
    """Store ECG in volatile memory buffer that refreshes per patient."""
    if patient_id not in latest_ecg_cache:
        latest_ecg_cache[patient_id] = []

    # Keep last 10 seconds (approx 500 samples at 50Hz)
    latest_ecg_cache[patient_id].append({"timestamp": timestamp, "data": ecg_payload})

    # Trim to 500 max to avoid memory leak
    if len(latest_ecg_cache[patient_id]) > 500:
        latest_ecg_cache[patient_id] = latest_ecg_cache[patient_id][-500:]


def get_latest_ecg(patient_id: str) -> list[dict]:
    """Retrieve in-memory ECG buffer for a patient."""
    return latest_ecg_cache.get(patient_id, [])


def clear_ecg(patient_id: str):
    """Clear ECG buffer when patient changes."""
    if patient_id in latest_ecg_cache:
        del latest_ecg_cache[patient_id]


def flush_vitals_to_db():
    """Drain the queue and perform batched database write."""
    items = []
    while not vitals_queue.empty():
        try:
            items.append(vitals_queue.get_nowait())
        except queue.Empty:
            break

    if not items:
        return

    # Congestion control: Keep only the latest vital reading for each patient in this batch
    latest_per_patient = {}
    for data in items:
        pid = data["patient_id"]
        latest_per_patient[pid] = data

    downsampled_items = list(latest_per_patient.values())

    conn = get_connection()
    log_event(
        logger, logging.DEBUG,
        f"NeonDB vitals flush started — {len(downsampled_items)} record(s)",
        event_category="neondb",
        event_type="vitals_flush_start",
        outcome="pending",
        batch_size=len(downsampled_items),
    )
    timer = Timer()
    try:
        for data in downsampled_items:
            recorded_at = datetime.fromtimestamp(
                data.get("timestamp", datetime.now().timestamp())
            ).strftime("%Y-%m-%dT%H:%M:%S")

            conn.execute(
                """INSERT INTO vitals
                   (patient_id, heart_rate, spo2, temperature,
                    respiratory_rate, systolic_bp, diastolic_bp, recorded_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    data["patient_id"],
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
        log_event(
            logger, logging.INFO,
            f"NeonDB vitals flush succeeded — {len(downsampled_items)} downsampled record(s) written",
            event_category="neondb",
            event_type="vitals_flush_success",
            outcome="success",
            batch_size=len(downsampled_items),
            duration_ms=timer.stop(),
        )
    except Exception as e:
        log_event(
            logger, logging.ERROR,
            "NeonDB vitals flush failed — re-queuing items",
            event_category="neondb",
            event_type="vitals_flush_failure",
            outcome="failure",
            batch_size=len(downsampled_items),
            duration_ms=timer.stop(),
            error_detail=str(e),
        )
        # Put items back to queue
        for item in downsampled_items:
            vitals_queue.put(item)


def db_flush_worker():
    """Background worker thread that flushes queued vitals every 10 seconds."""
    while True:
        try:
            time.sleep(10)
            flush_vitals_to_db()
        except Exception as e:
            log_event(
                logger, logging.ERROR,
                "NeonDB flush worker thread error",
                event_category="neondb",
                event_type="vitals_flush_failure",
                outcome="failure",
                error_detail=str(e),
            )


# Start background thread immediately on module load
worker_thread = threading.Thread(target=db_flush_worker, daemon=True)
worker_thread.start()


def get_all_patients() -> list[dict]:
    """Return all patients with their latest vital snapshot (merged with in-memory cache)."""
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
    patients = []
    for r in rows:
        p = dict(r)
        if isinstance(p.get("registered_at"), datetime):
            p["registered_at"] = p["registered_at"].strftime("%Y-%m-%dT%H:%M:%S")
        if isinstance(p.get("recorded_at"), datetime):
            p["recorded_at"] = p["recorded_at"].strftime("%Y-%m-%dT%H:%M:%S")
        patients.append(p)
    # Merge with in-memory real-time cache
    for p in patients:
        pid = p["id"]
        if pid in latest_vitals_cache:
            cache = latest_vitals_cache[pid]
            p.update(
                {
                    "heart_rate": cache["heart_rate"],
                    "spo2": cache["spo2"],
                    "temperature": cache["temperature"],
                    "respiratory_rate": cache["respiratory_rate"],
                    "systolic_bp": cache["systolic_bp"],
                    "diastolic_bp": cache["diastolic_bp"],
                    "recorded_at": cache["recorded_at"],
                }
            )
    return patients


def get_patient(patient_id: str) -> dict | None:
    """Single patient with latest vitals (merged with in-memory cache)."""
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
    if not row:
        return None
    p = dict(row)
    if isinstance(p.get("registered_at"), datetime):
        p["registered_at"] = p["registered_at"].strftime("%Y-%m-%dT%H:%M:%S")
    if isinstance(p.get("recorded_at"), datetime):
        p["recorded_at"] = p["recorded_at"].strftime("%Y-%m-%dT%H:%M:%S")

    pid = p["id"]
    if pid in latest_vitals_cache:
        cache = latest_vitals_cache[pid]
        p.update(
            {
                "heart_rate": cache["heart_rate"],
                "spo2": cache["spo2"],
                "temperature": cache["temperature"],
                "respiratory_rate": cache["respiratory_rate"],
                "systolic_bp": cache["systolic_bp"],
                "diastolic_bp": cache["diastolic_bp"],
                "recorded_at": cache["recorded_at"],
            }
        )
    return p


def get_vitals_history(
    patient_id: str, minutes: int = 30, end_time: float | None = None
) -> list[dict]:
    """Return time-series vitals for a patient within a specific window."""
    conn = get_connection()
    if end_time:
        end_dt = datetime.fromtimestamp(end_time / 1000.0).strftime("%Y-%m-%dT%H:%M:%S")
        from datetime import timedelta

        start_dt = (
            datetime.fromtimestamp(end_time / 1000.0) - timedelta(minutes=minutes)
        ).strftime("%Y-%m-%dT%H:%M:%S")
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

        cutoff = (datetime.now() - timedelta(minutes=minutes)).strftime(
            "%Y-%m-%dT%H:%M:%S"
        )
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

    results = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("recorded_at"), datetime):
            d["recorded_at"] = d["recorded_at"].strftime("%Y-%m-%dT%H:%M:%S")
        results.append(d)
    return results


def get_hourly_history_aggregated(
    patient_id: str, date_str: str, hour: int
) -> list[dict]:
    """
    Return 1 hour of vitals, aggregated into 1-minute averages (max 60 points).
    date_str: 'YYYY-MM-DD'
    hour: 0-23
    """
    conn = get_connection()
    start_prefix = f"{date_str}T{hour:02d}:00"
    end_prefix = f"{date_str}T{hour:02d}:59"

    # Postgres aggregation queries using to_char and numeric casting
    rows = conn.execute(
        """SELECT 
              to_char(recorded_at, 'YYYY-MM-DD"T"HH24:MI:00') as recorded_at,
              ROUND(CAST(AVG(heart_rate) AS numeric), 1) as heart_rate,
              ROUND(CAST(AVG(spo2) AS numeric), 1) as spo2,
              ROUND(CAST(AVG(temperature) AS numeric), 1) as temperature,
              ROUND(CAST(AVG(respiratory_rate) AS numeric), 1) as respiratory_rate,
              ROUND(CAST(AVG(systolic_bp) AS numeric), 1) as systolic_bp,
              ROUND(CAST(AVG(diastolic_bp) AS numeric), 1) as diastolic_bp
           FROM vitals
           WHERE patient_id = ?
             AND recorded_at >= ?
             AND recorded_at <= ?
           GROUP BY to_char(recorded_at, 'YYYY-MM-DD"T"HH24:MI:00')
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

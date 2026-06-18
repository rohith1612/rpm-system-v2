
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

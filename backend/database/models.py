<<<<<<< HEAD
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    DateTime,
    Boolean,
    ForeignKey,
    UniqueConstraint,
    Index,
)

from sqlalchemy.sql import func

from backend.database.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True)

    name = Column(String, nullable=False)

    age = Column(Integer)

    condition = Column(String)

    registered_at = Column(
        DateTime,
        server_default=func.now()
    )


class Vital(Base):
    __tablename__ = "vitals"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    patient_id = Column(
        String,
        ForeignKey("patients.id"),
        nullable=False
    )

    heart_rate = Column(Float)

    spo2 = Column(Float)

    temperature = Column(Float)

    respiratory_rate = Column(Float)

    systolic_bp = Column(Float)

    diastolic_bp = Column(Float)

    recorded_at = Column(
        DateTime,
        nullable=False
    )

    received_at = Column(
        DateTime,
        server_default=func.now()
    )

    __table_args__ = (
        Index(
            "idx_vitals_patient_time",
            "patient_id",
            "recorded_at"
        ),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    patient_id = Column(
        String,
        ForeignKey("patients.id"),
        nullable=False
    )

    vital_type = Column(
        String,
        nullable=False
    )

    value = Column(
        Float,
        nullable=False
    )

    severity = Column(
        String,
        nullable=False
    )

    message = Column(String)

    created_at = Column(
        DateTime,
        server_default=func.now()
    )

    acknowledged = Column(
        Boolean,
        default=False
    )


class PatientThreshold(Base):
    __tablename__ = "patient_thresholds"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True
    )

    patient_id = Column(
        String,
        ForeignKey("patients.id"),
        nullable=False
    )

    vital_type = Column(
        String,
        nullable=False
    )

    warn_low = Column(Float)

    crit_low = Column(Float)

    warn_high = Column(Float)

    crit_high = Column(Float)

    __table_args__ = (
        UniqueConstraint(
            "patient_id",
            "vital_type"
        ),
    )
=======
"""
Normalized SQLite schema for remote patient monitoring.
"""

SCHEMA_SQL = """
-- ── Patients ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    age             INTEGER,
    condition       TEXT,
    registered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Vital Signs (time-series) ────────────────────────
CREATE TABLE IF NOT EXISTS vitals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id       TEXT NOT NULL REFERENCES patients(id),
    heart_rate       REAL,
    spo2             REAL,
    temperature      REAL,
    respiratory_rate REAL,
    systolic_bp      REAL,
    diastolic_bp     REAL,
    recorded_at      TIMESTAMP NOT NULL,
    received_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup: all vitals for a patient ordered by time
CREATE INDEX IF NOT EXISTS idx_vitals_patient_time
    ON vitals(patient_id, recorded_at DESC);

-- ── Alerts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id      TEXT NOT NULL REFERENCES patients(id),
    vital_type      TEXT NOT NULL,
    value           REAL NOT NULL,
    severity        TEXT NOT NULL CHECK(severity IN ('warning', 'critical')),
    message         TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alerts_patient
    ON alerts(patient_id, created_at DESC);

-- ── Patient Custom Thresholds ────────────────────────
CREATE TABLE IF NOT EXISTS patient_thresholds (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id      TEXT NOT NULL REFERENCES patients(id),
    vital_type      TEXT NOT NULL,
    warn_low        REAL,
    crit_low        REAL,
    warn_high       REAL,
    crit_high       REAL,
    UNIQUE(patient_id, vital_type)
);
"""
>>>>>>> origin/main

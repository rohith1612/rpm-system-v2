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
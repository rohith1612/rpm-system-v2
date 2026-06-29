"""
Normalized SQLite schema for remote patient monitoring.
"""

SCHEMA_SQL = """
-- ── Patients ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id              VARCHAR(50) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    age             INTEGER,
    condition       VARCHAR(255),
    cerner_patient_id VARCHAR(100),
    registered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Vital Signs (time-series) ────────────────────────
CREATE TABLE IF NOT EXISTS vitals (
    id               SERIAL PRIMARY KEY,
    patient_id       VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
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
    id              SERIAL PRIMARY KEY,
    patient_id      VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    vital_type      VARCHAR(50) NOT NULL,
    value           REAL NOT NULL,
    severity        VARCHAR(20) NOT NULL CHECK(severity IN ('warning', 'critical')),
    message         TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alerts_patient
    ON alerts(patient_id, created_at DESC);

-- ── Patient Custom Thresholds ────────────────────────
CREATE TABLE IF NOT EXISTS patient_thresholds (
    id              SERIAL PRIMARY KEY,
    patient_id      VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    vital_type      VARCHAR(50) NOT NULL,
    warn_low        REAL,
    crit_low        REAL,
    warn_high       REAL,
    crit_high       REAL,
    UNIQUE(patient_id, vital_type)
);

-- ── Patient Beds ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_beds (
    bed_id          VARCHAR(50) PRIMARY KEY,
    patient_id      VARCHAR(50) UNIQUE REFERENCES patients(id) ON DELETE CASCADE
);
"""

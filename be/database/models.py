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

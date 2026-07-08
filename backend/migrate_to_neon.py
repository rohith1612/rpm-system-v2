import os
import sqlite3

import psycopg2
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path, override=True)

DATABASE_URL = os.environ.get("DATABASE_URL")
DB_PATH = os.path.join(os.path.dirname(__file__), "vitals.db")

SCHEMA_SQL = """
DROP TABLE IF EXISTS patient_beds CASCADE;
DROP TABLE IF EXISTS patient_thresholds CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS vitals CASCADE;
DROP TABLE IF EXISTS patients CASCADE;

CREATE TABLE patients (
    id              VARCHAR(50) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    age             INTEGER,
    condition       VARCHAR(255),
    cerner_patient_id VARCHAR(100),
    registered_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vitals (
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

CREATE INDEX idx_vitals_patient_time ON vitals(patient_id, recorded_at DESC);

CREATE TABLE alerts (
    id              SERIAL PRIMARY KEY,
    patient_id      VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    vital_type      VARCHAR(50) NOT NULL,
    value           REAL NOT NULL,
    severity        VARCHAR(20) NOT NULL CHECK(severity IN ('warning', 'critical')),
    message         TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged    INTEGER DEFAULT 0
);

CREATE INDEX idx_alerts_patient ON alerts(patient_id, created_at DESC);

CREATE TABLE patient_thresholds (
    id              SERIAL PRIMARY KEY,
    patient_id      VARCHAR(50) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    vital_type      VARCHAR(50) NOT NULL,
    warn_low        REAL,
    crit_low        REAL,
    warn_high       REAL,
    crit_high       REAL,
    UNIQUE(patient_id, vital_type)
);

CREATE TABLE patient_beds (
    bed_id          VARCHAR(50) PRIMARY KEY,
    patient_id      VARCHAR(50) UNIQUE REFERENCES patients(id) ON DELETE CASCADE
);
"""


def migrate():
    print("Starting migration to NeonDB...")
    if not DATABASE_URL:
        print("DATABASE_URL is not set in environment or backend/.env!")
        return

    # 1. Connect to SQLite and fetch data
    if not os.path.exists(DB_PATH):
        print(
            f"Local SQLite database not found at {DB_PATH}. Creating tables in NeonDB without data."
        )
        sqlite_patients = []
        sqlite_beds = []
    else:
        sqlite_conn = sqlite3.connect(DB_PATH)
        sqlite_conn.row_factory = sqlite3.Row
        sqlite_patients = [
            dict(r) for r in sqlite_conn.execute("SELECT * FROM patients").fetchall()
        ]
        sqlite_beds = [
            dict(r)
            for r in sqlite_conn.execute("SELECT * FROM patient_beds").fetchall()
        ]
        sqlite_conn.close()
        print(
            f"Retrieved {len(sqlite_patients)} patients and {len(sqlite_beds)} beds from SQLite."
        )

    # 2. Connect to NeonDB
    pg_conn = psycopg2.connect(DATABASE_URL)
    pg_cur = pg_conn.cursor()

    # 3. Create tables in NeonDB
    print("Creating tables in NeonDB...")
    pg_cur.execute(SCHEMA_SQL)
    pg_conn.commit()
    print("Tables created successfully.")

    # 4. Insert data into NeonDB
    if sqlite_patients:
        print("Inserting patients...")
        for p in sqlite_patients:
            pg_cur.execute(
                "INSERT INTO patients (id, name, age, condition, cerner_patient_id, registered_at) VALUES (%s, %s, %s, %s, %s, %s)",
                (
                    p["id"],
                    p["name"],
                    p["age"],
                    p["condition"],
                    p["cerner_patient_id"],
                    p["registered_at"],
                ),
            )
        pg_conn.commit()
        print(f"Successfully inserted {len(sqlite_patients)} patients.")

    if sqlite_beds:
        print("Inserting beds...")
        for b in sqlite_beds:
            pg_cur.execute(
                "INSERT INTO patient_beds (bed_id, patient_id) VALUES (%s, %s)",
                (b["bed_id"], b["patient_id"]),
            )
        pg_conn.commit()
        print(f"Successfully inserted {len(sqlite_beds)} beds.")

    pg_cur.close()
    pg_conn.close()
    print("Migration to NeonDB completed successfully!")


if __name__ == "__main__":
    migrate()

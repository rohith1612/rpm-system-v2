"""
Centralized configuration for the Remote Patient Monitoring backend.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── MQTT ──────────────────────────────────────────────
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883

# Unique session prefix to avoid topic collisions on public broker
MQTT_SESSION_ID = os.environ.get("RPM_SESSION_ID", "acl-rpm")
MQTT_TOPIC_PATTERN = f"rpm/{MQTT_SESSION_ID}/+/#"
MQTT_CLIENT_ID = f"rpm-backend-{MQTT_SESSION_ID}"

# ── PostgreSQL ────────────────────────────────────────
DATABASE_URL = os.environ.get(
    "DATABASE_URL", 
    "postgresql+psycopg2://postgres:1234@localhost:5432/iomt-db"
)

# ── Cerner SMART on FHIR ──────────────────────────────
CERNER_SYSTEM_CLIENT_ID = os.environ.get("CERNER_SYSTEM_CLIENT_ID")
CERNER_SYSTEM_CLIENT_SECRET = os.environ.get("CERNER_SYSTEM_CLIENT_SECRET")
CERNER_FHIR_BASE_URL = os.environ.get("CERNER_FHIR_BASE_URL")

# ── Alert Thresholds ──────────────────────────────────
ALERT_THRESHOLDS = {
    "heart_rate": {
        "warn_low": 55,
        "crit_low": 45,
        "warn_high": 110,
        "crit_high": 130,
    },
    "spo2": {
        "warn_low": 94,
        "crit_low": 90,
        "warn_high": None,
        "crit_high": None,
    },
    "temperature": {
        "warn_low": None,
        "crit_low": None,
        "warn_high": 37.5,
        "crit_high": 38.5,
    },
    "respiratory_rate": {
        "warn_low": 10,
        "crit_low": 8,
        "warn_high": 22,
        "crit_high": 28,
    },
    "systolic_bp": {
        "warn_low": 95,
        "crit_low": 80,
        "warn_high": 140,
        "crit_high": 170,
    },
    "diastolic_bp": {
        "warn_low": 55,
        "crit_low": 45,
        "warn_high": 90,
        "crit_high": 100,
    },
}

# ── CORS ──────────────────────────────────────────────
CORS_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]
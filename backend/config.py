"""
Centralized configuration for the Remote Patient Monitoring backend.
"""

import os

# ── MQTT ──────────────────────────────────────────────
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883

MQTT_SESSION_ID = os.environ.get(
    "RPM_SESSION_ID",
    "acl-rpm"
)

MQTT_TOPIC_PATTERN = (
    f"rpm/{MQTT_SESSION_ID}/+/#"
)

MQTT_CLIENT_ID = (
    f"rpm-backend-{MQTT_SESSION_ID}"
)

# ── PostgreSQL ────────────────────────────────────────
DATABASE_URL = (
    "postgresql+psycopg2://postgres:1234@localhost:5432/iomt-db"
)

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
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]
"""
Centralized configuration for the Remote Patient Monitoring backend.
"""

import os
import secrets

# Trigger backend configuration reload with fresh .env credentials
# ── MQTT ──────────────────────────────────────────────
MQTT_BROKER = os.environ.get("MQTT_BROKER", "broker.emqx.io")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USERNAME = os.environ.get("MQTT_USERNAME", "")
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "")
# Unique session prefix to avoid topic collisions on public broker
MQTT_SESSION_ID = os.environ.get("RPM_SESSION_ID", "acl-rpm")
MQTT_TOPIC_PATTERN = f"rpm/{MQTT_SESSION_ID}/+/#"
MQTT_CLIENT_ID = f"rpm-backend-{MQTT_SESSION_ID}-{secrets.token_hex(4)}"
MQTT_CLIENT_ID_VITALS = f"rpm-backend-vitals-{MQTT_SESSION_ID}-{secrets.token_hex(4)}"
MQTT_CLIENT_ID_ECG = f"rpm-backend-ecg-{MQTT_SESSION_ID}-{secrets.token_hex(4)}"

# ── Database ──────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "vitals.db")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# ── Alert Thresholds ─────────────────────────────────
# Format: (warning_low, critical_low, warning_high, critical_high)
# None means no bound in that direction
ALERT_THRESHOLDS = {
    "heart_rate": {"warn_low": 55, "crit_low": 45, "warn_high": 110, "crit_high": 130},
    "spo2": {"warn_low": 94, "crit_low": 90, "warn_high": None, "crit_high": None},
    "temperature": {
        "warn_low": None,
        "crit_low": None,
        "warn_high": 99.5,
        "crit_high": 101.3,
    },
    "respiratory_rate": {
        "warn_low": 10,
        "crit_low": 8,
        "warn_high": 22,
        "crit_high": 28,
    },
    "systolic_bp": {"warn_low": 95, "crit_low": 80, "warn_high": 140, "crit_high": 170},
    "diastolic_bp": {"warn_low": 55, "crit_low": 45, "warn_high": 90, "crit_high": 100},
}

# ── CORS ──────────────────────────────────────────────
CORS_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

# ── Cerner FHIR R4 / SMART on FHIR ──────────────────
CERNER_BASE_URL = os.environ.get("CERNER_BASE_URL", "")
CERNER_TOKEN_URL = os.environ.get("CERNER_TOKEN_URL", "")
CLIENT_ID = os.environ.get("CLIENT_ID", "")
REDIRECT_URI = os.environ.get("REDIRECT_URI", "http://localhost:5173/callback")
SMART_SCOPES = os.environ.get(
    "SMART_SCOPES",
    "user/Patient.read user/Observation.read online_access openid profile fhirUser launch/patient",
)

# ── System Token (Client Credentials) ─────────────────
SYSTEM_CLIENT_ID = os.environ.get("SYSTEM_CLIENT_ID", "")
SYSTEM_SECRET = os.environ.get("SYSTEM_SECRET", "")
SYSTEM_SCOPES = os.environ.get(
    "SYSTEM_SCOPES",
    "system/Patient.read system/Observation.read system/Observation.write system/Encounter.read",
)

# Cerner Auto Sync Toggle
ENABLE_CERNER_AUTO_SYNC = (
    os.environ.get("ENABLE_CERNER_AUTO_SYNC", "true").lower() == "true"
)

# App POV Mode (DEV or CUS) - reloaded dynamically
APP_POV = os.environ.get("APP_POV", "DEV").upper()

"""
MQTT subscriber that ingests device telemetry, stores it, checks alerts,
and broadcasts to WebSocket clients.
"""

import asyncio
import json

import paho.mqtt.client as mqtt

from backend.config import (MQTT_BROKER, MQTT_CLIENT_ID, MQTT_PORT,
                            MQTT_TOPIC_PATTERN)
from backend.services.alert_service import check_vitals
from backend.services.vitals_service import store_vitals

# Will be set by main.py on startup
_event_loop = None
_broadcast_fn = None


def set_event_loop(loop: asyncio.AbstractEventLoop):
    global _event_loop
    _event_loop = loop


def set_broadcast_fn(fn):
    """Register the WebSocket broadcast coroutine."""
    global _broadcast_fn
    _broadcast_fn = fn


def _on_connect(client, userdata, flags, reason_code, properties):
    print(f"[MQTT] Connected to {MQTT_BROKER} (rc={reason_code})")
    client.subscribe(MQTT_TOPIC_PATTERN)
    print(f"[MQTT] Subscribed to: {MQTT_TOPIC_PATTERN}")


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())

        # Topic format: rpm/{session_id}/{patient_id}/{type}
        parts = msg.topic.split("/")
        if len(parts) >= 4:
            patient_id = parts[2]
            msg_type = parts[-1]  # "vitals" or "ecg"
        else:
            patient_id = payload.get("patient_id", "unknown")
            msg_type = "vitals"

        payload["patient_id"] = patient_id

        # Verify patient exists in DB before processing
        from backend.services.vitals_service import get_patient
        if not get_patient(patient_id):
            return

        if msg_type == "ecg":
            # ECG is real-time only — broadcast to WebSocket, no DB storage
            if _broadcast_fn and _event_loop:
                ws_message = {
                    "type": "ecg",
                    "patient_id": patient_id,
                    "heart_rate": payload.get("heart_rate"),
                    "pr_interval": payload.get("pr_interval"),
                    "qrs_duration": payload.get("qrs_duration"),
                    "qt_interval": payload.get("qt_interval"),
                    "qtc_interval": payload.get("qtc_interval"),
                    "st_offset": payload.get("st_offset"),
                    "rhythm": payload.get("rhythm"),
                }
                asyncio.run_coroutine_threadsafe(_broadcast_fn(ws_message), _event_loop)
        else:
            # Vitals: store + check alerts + broadcast
            # 1. Store in database
            store_vitals(payload)

            # 2. Check thresholds → generate alerts
            alerts = check_vitals(payload)

            # 3. Broadcast via WebSocket
            if _broadcast_fn and _event_loop:
                ws_message = {
                    "type": "vitals",
                    "patient_id": patient_id,
                    "heart_rate": payload.get("heart_rate"),
                    "spo2": payload.get("spo2"),
                    "temperature": payload.get("temperature"),
                    "respiratory_rate": payload.get("respiratory_rate"),
                    "systolic_bp": payload.get("systolic_bp"),
                    "diastolic_bp": payload.get("diastolic_bp"),
                    "recorded_at": payload.get("timestamp"),
                }
                asyncio.run_coroutine_threadsafe(_broadcast_fn(ws_message), _event_loop)

                # Broadcast each alert separately
                for alert in alerts:
                    alert_msg = {"type": "alert", **alert}
                    asyncio.run_coroutine_threadsafe(_broadcast_fn(alert_msg), _event_loop)

    except Exception as e:
        print(f"[MQTT] Error processing message: {e}")


def start_mqtt_listener():
    """Create and start the MQTT client (runs in background thread)."""
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=MQTT_CLIENT_ID,
    )
    client.on_connect = _on_connect
    client.on_message = _on_message

    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    print(f"[MQTT] Listener started (session: {MQTT_CLIENT_ID})")
    return client

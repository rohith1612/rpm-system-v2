"""
MQTT subscriber that ingests device telemetry, stores it, checks alerts,
and broadcasts to WebSocket clients.
"""

import asyncio
import json
import threading
import time

import paho.mqtt.client as mqtt

from backend.config import (MQTT_BROKER, MQTT_CLIENT_ID_VITALS, MQTT_CLIENT_ID_ECG, MQTT_PORT,
                            MQTT_SESSION_ID)
from backend.services.alert_service import check_vitals
from backend.services.vitals_service import store_vitals, store_ecg

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

        if msg_type != "ecg":
            import os
            from datetime import datetime, timezone, timedelta
            time_sent_raw = payload.get("timestamp") or payload.get("time_sent") or time.time()
            ist_tz = timezone(timedelta(hours=5, minutes=30))
            if isinstance(time_sent_raw, (int, float)):
                if time_sent_raw > 1e11:
                    time_sent_raw /= 1000.0
                try:
                    time_sent_iso = datetime.fromtimestamp(time_sent_raw, ist_tz).isoformat()
                except Exception:
                    time_sent_iso = str(time_sent_raw)
            else:
                try:
                    val = str(time_sent_raw)
                    if val.endswith("Z"):
                        val = val[:-1] + "+00:00"
                    dt = datetime.fromisoformat(val)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    time_sent_iso = dt.astimezone(ist_tz).isoformat()
                except Exception:
                    time_sent_iso = str(time_sent_raw)

            uuid_val = payload.get("uuid") or payload.get("UUID") or "N/A"
            hr = payload.get("heart_rate", "--")
            spo2 = payload.get("spo2", "--")
            rr = payload.get("respiratory_rate", "--")
            sys_bp = payload.get("systolic_bp", "--")
            dia_bp = payload.get("diastolic_bp", "--")
            temp = payload.get("temperature", "--")

            log_line = f"Time Sent: {time_sent_iso}, UUID: {uuid_val}, Vitals: {{ heart_rate: {hr}, spo2: {spo2}, respiratory_rate: {rr}, systolic_bp: {sys_bp}, diastolic_bp: {dia_bp}, temperature: {temp} }}\n"
            root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            log_path = os.path.join(root_dir, "analyze.txt")
            with open(log_path, "a") as f:
                f.write(log_line)

        # Verify patient is assigned to a bed before processing
        from backend.services.bed_service import get_active_patient_ids
        if patient_id not in get_active_patient_ids():
            return

        if msg_type == "ecg":
            # ECG is real-time only — broadcast to WebSocket, and store in memory buffer
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
            
            store_ecg(patient_id, ws_message, time.time())
            
            if _broadcast_fn and _event_loop:
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
    """Create and start the MQTT clients for vitals and ecg in two separate threads."""
    # Vitals client
    vitals_client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=MQTT_CLIENT_ID_VITALS,
        transport="websockets" if MQTT_PORT in (8083, 8084) else "tcp",
    )
    if MQTT_PORT in (8883, 8084):
        vitals_client.tls_set()

    def on_connect_vitals(client, userdata, flags, reason_code, properties):
        print(f"[MQTT] Vitals client connected to {MQTT_BROKER} (rc={reason_code})")
        topic = f"rpm/{MQTT_SESSION_ID}/+/vitals"
        client.subscribe(topic)
        print(f"[MQTT] Vitals client subscribed to: {topic}")

    vitals_client.on_connect = on_connect_vitals
    vitals_client.on_message = _on_message

    # ECG client
    ecg_client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=MQTT_CLIENT_ID_ECG,
        transport="websockets" if MQTT_PORT in (8083, 8084) else "tcp",
    )
    if MQTT_PORT in (8883, 8084):
        ecg_client.tls_set()

    def on_connect_ecg(client, userdata, flags, reason_code, properties):
        print(f"[MQTT] ECG client connected to {MQTT_BROKER} (rc={reason_code})")
        topic = f"rpm/{MQTT_SESSION_ID}/+/ecg"
        client.subscribe(topic)
        print(f"[MQTT] ECG client subscribed to: {topic}")

    ecg_client.on_connect = on_connect_ecg
    ecg_client.on_message = _on_message

    # Start loops in separate threads using thread execution
    vitals_thread = threading.Thread(
        target=lambda: (vitals_client.connect(MQTT_BROKER, MQTT_PORT, 60), vitals_client.loop_forever()),
        daemon=True,
        name="MQTT-Vitals-Thread"
    )
    ecg_thread = threading.Thread(
        target=lambda: (ecg_client.connect(MQTT_BROKER, MQTT_PORT, 60), ecg_client.loop_forever()),
        daemon=True,
        name="MQTT-ECG-Thread"
    )

    vitals_thread.start()
    ecg_thread.start()
    print(f"[MQTT] Dual listener threads started (vitals: {MQTT_CLIENT_ID_VITALS}, ecg: {MQTT_CLIENT_ID_ECG})")

    class MultiMQTTClient:
        def __init__(self, c1, c2):
            self.c1 = c1
            self.c2 = c2
        def loop_stop(self):
            pass
        def disconnect(self):
            try:
                self.c1.disconnect()
            except Exception:
                pass
            try:
                self.c2.disconnect()
            except Exception:
                pass

    return MultiMQTTClient(vitals_client, ecg_client)

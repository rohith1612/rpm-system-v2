"""
MQTT publisher for the vital signs simulator.
Publishes each patient's vitals to the EMQX public broker.
"""
import json
import time
import paho.mqtt.client as mqtt

BROKER = "broker.emqx.io"
PORT = 1883


class MQTTPublisher:
    """Manages a single MQTT connection and publishes vital sign payloads."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.client_id = f"rpm-simulator-{session_id}"
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=self.client_id,
        )
        self._connected = False

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        self._connected = True
        print(f"[MQTT] Connected to {BROKER} (session: {self.session_id})")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self._connected = False
        print(f"[MQTT] Disconnected (rc={reason_code})")

    def connect(self):
        """Connect to the MQTT broker and start the network loop."""
        self.client.connect(BROKER, PORT, 60)
        self.client.loop_start()

    def disconnect(self):
        """Stop network loop and disconnect."""
        self.client.loop_stop()
        self.client.disconnect()

    @property
    def is_connected(self) -> bool:
        return self._connected

    def publish_vitals(self, patient_id: str, vitals: dict):
        """
        Publish a vitals reading for a patient.
        Topic: rpm/{session_id}/{patient_id}/vitals
        """
        topic = f"rpm/{self.session_id}/{patient_id}/vitals"
        payload = {
            "patient_id": patient_id,
            "timestamp": int(time.time()),
            **vitals,
        }
        self.client.publish(topic, json.dumps(payload), qos=0)

    def publish_ecg(self, patient_id: str, ecg_data: dict):
        """
        Publish ECG parameters for a patient.
        Topic: rpm/{session_id}/{patient_id}/ecg
        """
        topic = f"rpm/{self.session_id}/{patient_id}/ecg"
        payload = {
            "patient_id": patient_id,
            "timestamp": int(time.time()),
            **ecg_data,
        }
        self.client.publish(topic, json.dumps(payload), qos=0)

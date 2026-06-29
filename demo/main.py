import json
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

import paho.mqtt.client as mqtt

app = FastAPI()

BROKER = "broker.emqx.io"
PORT = 1883
TOPIC = "hehehe/+/heartbeat"

connected_clients = set()

latest_data = {
    "device001": None,
    "device002": None,
    "device003": None,
}


# ----------------------------
# WebSocket Manager
# ----------------------------

async def broadcast(data):
    dead = set()

    for ws in connected_clients:
        try:
            await ws.send_json(data)
        except:
            dead.add(ws)

    connected_clients.difference_update(dead)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)

    try:
        await ws.send_json({
            "type": "snapshot",
            "data": latest_data
        })

        while True:
            await ws.receive_text()

    except WebSocketDisconnect:
        connected_clients.remove(ws)


# ----------------------------
# Frontend
# ----------------------------

@app.get("/")
def root():
    return FileResponse("index.html")


# ----------------------------
# MQTT
# ----------------------------

def on_connect(client, userdata, flags, reason_code, properties):
    print("MQTT Connected")
    client.subscribe(TOPIC)


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())

        topic_parts = msg.topic.split("/")
        device_id = topic_parts[1]

        heartbeat = payload["heartbeat"]

        latest_data[device_id] = heartbeat

        message = {
            "type": "heartbeat",
            "device_id": device_id,
            "heartbeat": heartbeat
        }

        asyncio.run_coroutine_threadsafe(
            broadcast(message),
            event_loop
        )

    except Exception as e:
        print("MQTT Error:", e)


@app.on_event("startup")
async def startup():

    global event_loop
    event_loop = asyncio.get_running_loop()

    mqtt_client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="fastapi-heartbeat-monitor"
    )

    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    mqtt_client.connect(BROKER, PORT, 60)
    mqtt_client.loop_start()

    print("MQTT listener started")
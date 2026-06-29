import time
import random
import threading
import json
import paho.mqtt.client as mqtt

BROKER = "broker.emqx.io"
PORT = 1883

DEVICE_IDS = [
    "device001",
    "device002",
    "device003"
]

# Initial heartbeat for each device (baseline: 70-90 BPM)
device_state = {
    device: random.randint(70, 90)
    for device in DEVICE_IDS
}

# Track trend for each device (-1: decreasing, 0: stable, 1: increasing)
device_trend = {device: 0 for device in DEVICE_IDS}

def next_heartbeat(device_id, current):
    # 80% chance: normal fluctuation (small change)
    if random.random() < 0.80:
        change = random.randint(-5, 5)
        current += change

    # 15% chance: moderate activity (larger change)
    elif random.random() < 0.95:
        change = random.randint(-10, 10)
        current += change

    # 5% chance: extreme event (spike or drop)
    else:
        change = random.choice([-20, 20])  # Simulate tachycardia or bradycardia
        current += change

    # Enforce realistic bounds (40-180 BPM)
    current = max(40, min(180, current))

    # Update trend (for smoother transitions)
    if change > 0:
        device_trend[device_id] = 1
    elif change < 0:
        device_trend[device_id] = -1
    else:
        device_trend[device_id] = 0

    # If at extreme, bias toward recovery
    if current >= 160:
        current -= random.randint(0, 5)  # Gradual recovery from high
    elif current <= 50:
        current += random.randint(0, 5)  # Gradual recovery from low

    return current

def device_worker(device_id):
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"{device_id}_publisher"
    )
    client.connect(BROKER, PORT, 60)
    client.loop_start()

    heartbeat = device_state[device_id]

    while True:
        heartbeat = next_heartbeat(device_id, heartbeat)
        payload = {
            "device_id": device_id,
            "heartbeat": heartbeat,
            "timestamp": int(time.time()),
            "trend": device_trend[device_id]  # Include trend in payload
        }
        topic = f"hehehe/{device_id}/heartbeat"
        client.publish(topic, json.dumps(payload))
        print(f"[SENT] {device_id} -> {heartbeat} BPM (Trend: {'↑' if device_trend[device_id] == 1 else '↓' if device_trend[device_id] == -1 else '→'})")
        time.sleep(1)

def main():
    for device_id in DEVICE_IDS:
        threading.Thread(
            target=device_worker,
            args=(device_id,),
            daemon=True
        ).start()
    print("Heartbeat simulation started")
    while True:
        time.sleep(1)

if __name__ == "__main__":
    main()
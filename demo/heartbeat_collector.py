import json
import paho.mqtt.client as mqtt

BROKER = "broker.emqx.io"
PORT = 1883

SUB_TOPIC = "hehehe/+/heartbeat"


def on_connect(client, userdata, flags, reason_code, properties):
    print("Connected to broker")
    client.subscribe(SUB_TOPIC)
    print(f"Subscribed to: {SUB_TOPIC}")


def on_message(client, userdata, msg):
    topic = msg.topic

    try:
        payload = json.loads(msg.payload.decode())

        # Topic format:
        # hehehe/device001/heartbeat
        parts = topic.split("/")

        if len(parts) >= 3:
            device_id = parts[1]
        else:
            device_id = "unknown"

        heartbeat = payload.get("heartbeat")
        timestamp = payload.get("timestamp")

        print(
            f"[RECEIVED] "
            f"Device={device_id} "
            f"Heartbeat={heartbeat} bpm "
            f"Timestamp={timestamp}"
        )

    except Exception as e:
        print("Error:", e)


def main():
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="heartbeat_collector"
    )

    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(BROKER, PORT, 60)

    print("Waiting for heartbeat data...")
    client.loop_forever()


if __name__ == "__main__":
    main()

"""
WebSocket endpoint for real-time vital signs streaming.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.vitals_service import get_latest_vitals_map

router = APIRouter()

connected_clients: set[WebSocket] = set()


async def broadcast(data: dict):
    dead = set()
    for ws in connected_clients:
        try:
            await ws.send_json(data)
        except Exception as e:
            import traceback

            print(f"[WS] Error broadcasting to client: {e}")
            traceback.print_exc()
            dead.add(ws)
    connected_clients.difference_update(dead)


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.add(ws)

    try:
        # Send current snapshot of all patients' latest vitals
        snapshot = get_latest_vitals_map()
        await ws.send_json({"type": "snapshot", "data": snapshot})

        # Keep connection alive — client doesn't send data, just receives
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connected_clients.discard(ws)
    except Exception as e:
        import traceback

        print(f"[WS] Exception in websocket connection: {e}")
        traceback.print_exc()
        connected_clients.discard(ws)

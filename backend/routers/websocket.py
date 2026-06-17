"""
WebSocket endpoint for real-time vital signs streaming.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.vitals_service import get_latest_vitals_map

router = APIRouter()

# Set of connected WebSocket clients
connected_clients: set[WebSocket] = set()


async def broadcast(data: dict):
    """Send data to all connected WebSocket clients."""
    dead = set()
    for ws in connected_clients:
        try:
            await ws.send_json(data)
        except Exception:
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
    except Exception:
        connected_clients.discard(ws)

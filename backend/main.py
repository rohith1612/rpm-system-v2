"""
FastAPI entry point for the Remote Patient Monitoring backend.

Run with:
    cd d:\\acl-demo-try
    .\\backend\\.venv\\Scripts\\python -m uvicorn backend.main:app --reload --port 8000
"""

import asyncio
import os
import sys
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv(override=True)  # Force override with .env values

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import CORS_ORIGINS, MQTT_SESSION_ID
from backend.database.connection import init_db
from backend.mqtt.listener import (set_broadcast_fn, set_event_loop,
                                   start_mqtt_listener)
from backend.routers import patients, vitals, beds, auth
from backend.routers import websocket as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────
    print(f"[RPM] Starting backend (MQTT session: {MQTT_SESSION_ID})")

    # Initialize database tables 
    init_db()
    print("[RPM] Database initialized")

    # Wire up MQTT → WebSocket bridge
    loop = asyncio.get_running_loop()
    set_event_loop(loop)
    set_broadcast_fn(ws_router.broadcast)

    # Start MQTT listener (background thread)
    mqtt_client = start_mqtt_listener()

    # Start automatic Cerner FHIR sync (every 60 seconds)
    from backend.config import ENABLE_CERNER_AUTO_SYNC
    if ENABLE_CERNER_AUTO_SYNC:
        try:
            from backend.services.cerner_auto_sync import start_auto_sync
            start_auto_sync()
        except ImportError:
            pass

    yield

    # ── Shutdown ──────────────────────────────────────
    mqtt_client.loop_stop()
    mqtt_client.disconnect()
    print("[RPM] Backend shutdown complete")


app = FastAPI(
    title="Remote Patient Monitoring API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────
app.include_router(patients.router)
app.include_router(vitals.router)
app.include_router(ws_router.router)
app.include_router(beds.router)
app.include_router(auth.router)


@app.get("/")
def root():
    return {
        "service": "Remote Patient Monitoring API",
        "version": "1.0.0",
        "mqtt_session": MQTT_SESSION_ID,
    }

"""
FastAPI entry point for the Remote Patient Monitoring backend.
"""

import asyncio
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import CORS_ORIGINS, MQTT_SESSION_ID
from backend.database.database import engine
from backend.database.models import Base
from backend.mqtt.listener import (
    set_broadcast_fn,
    set_event_loop,
    start_mqtt_listener,
)
from backend.routers import patients, vitals, auth
from backend.routers import websocket as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────
    print(f"[RPM] Starting backend (MQTT session: {MQTT_SESSION_ID})")

    # Initialize PostgreSQL tables
    Base.metadata.create_all(bind=engine)
    print("[RPM] PostgreSQL database initialized")

    # Wire up MQTT → WebSocket bridge
    loop = asyncio.get_running_loop()
    set_event_loop(loop)
    set_broadcast_fn(ws_router.broadcast)

    # Start MQTT listener (background thread)
    mqtt_client = start_mqtt_listener()

    # Start Cerner Sync Scheduler
    from apscheduler.schedulers.background import BackgroundScheduler
    from backend.services.cerner_sync import sync_vitals_to_cerner
    from backend.mqtt.listener import flush_vitals_buffer
    
    scheduler = BackgroundScheduler()
    scheduler.add_job(flush_vitals_buffer, "interval", seconds=10)
    scheduler.add_job(sync_vitals_to_cerner, "interval", minutes=1)
    scheduler.start()
    print("[RPM] Background scheduler started (flush: 10s, sync: 1m)")

    yield

    # ── Shutdown ──────────────────────────────────────
    mqtt_client.loop_stop()
    mqtt_client.disconnect()
    print("[RPM] Backend shutdown complete")


app = FastAPI(
    title="Clinical RPM API",
    lifespan=lifespan
)

# ── CORS ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────
app.include_router(vitals.router)
app.include_router(patients.router)
app.include_router(auth.router)
app.include_router(ws_router.router)


@app.get("/")
def root():
    return {
        "service": "Remote Patient Monitoring API",
        "version": "1.0.0",
        "mqtt_session": MQTT_SESSION_ID,
    }
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

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(dotenv_path=env_path, override=True)  # Force override with .env values

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.config import CORS_ORIGINS, MQTT_SESSION_ID
from backend.database.connection import init_db
from backend.mqtt.listener import (set_broadcast_fn, set_event_loop,
                                   start_mqtt_listener)
from backend.routers import auth, beds, patients, vitals
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
    docs_url=None,  # Disable default to use custom CDN below
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

@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=app.title + " - Swagger UI",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css",
    )

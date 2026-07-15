"""
REST API endpoints for SMART on FHIR configuration and OAuth2 token proxy.

Serves FHIR config to the frontend and proxies the OAuth2 token exchange
to avoid CORS issues with the Cerner token endpoint.
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import (APP_POV, CERNER_BASE_URL, CERNER_TOKEN_URL,
                            CLIENT_ID, REDIRECT_URI, SMART_SCOPES)
from backend.telemetry.logger import Timer, get_logger, log_event

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = get_logger(__name__)


@router.get("/config")
def get_fhir_config():
    """Return SMART on FHIR configuration to the frontend."""
    return {
        "cerner_base_url": CERNER_BASE_URL,
        "cerner_token_url": CERNER_TOKEN_URL,
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "smart_scopes": SMART_SCOPES,
        "app_pov": APP_POV,
    }


class TokenExchangeRequest(BaseModel):
    code: str
    redirect_uri: str


@router.post("/token")
async def exchange_token(req: TokenExchangeRequest):
    """
    Proxy the OAuth2 authorization code → access token exchange.

    This avoids CORS issues by performing the POST to the Cerner
    token endpoint from the backend instead of the browser.
    Public client flow: no client_secret needed.
    """
    log_event(
        logger,
        logging.INFO,
        "SMART-on-FHIR token exchange initiated",
        event_category="auth",
        event_type="token_exchange_start",
        outcome="pending",
        token_type="authorization_code",
        # code presence logged as boolean — never log the raw code
        code_present=bool(req.code),
    )

    payload = {
        "grant_type": "authorization_code",
        "code": req.code,
        "redirect_uri": req.redirect_uri,
        "client_id": CLIENT_ID,
    }

    timer = Timer()
    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            resp = await client.post(
                CERNER_TOKEN_URL,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as e:
        log_event(
            logger,
            logging.ERROR,
            "SMART-on-FHIR token exchange failed — network error",
            event_category="auth",
            event_type="token_exchange_failure",
            outcome="failure",
            token_type="authorization_code",
            duration_ms=timer.stop(),
            error_detail=str(e),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach Cerner token endpoint: {str(e)}",
        )

    if resp.status_code != 200:
        log_event(
            logger,
            logging.WARNING,
            "SMART-on-FHIR token exchange rejected by Cerner",
            event_category="auth",
            event_type="token_exchange_failure",
            outcome="failure",
            token_type="authorization_code",
            http_status=resp.status_code,
            duration_ms=timer.stop(),
        )
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Token exchange failed: {resp.text}",
        )

    log_event(
        logger,
        logging.INFO,
        "SMART-on-FHIR token exchange succeeded — provider authorised",
        event_category="auth",
        event_type="token_exchange_success",
        outcome="success",
        token_type="authorization_code",
        http_status=resp.status_code,
        duration_ms=timer.stop(),
    )
    return resp.json()


class TokenRefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh")
async def refresh_token(req: TokenRefreshRequest):
    """
    Proxy the OAuth2 refresh token → new access token exchange.

    This avoids CORS issues by performing the POST to the Cerner
    token endpoint from the backend instead of the browser.
    """
    log_event(
        logger,
        logging.INFO,
        "SMART-on-FHIR token refresh initiated",
        event_category="auth",
        event_type="token_refresh_start",
        outcome="pending",
        token_type="refresh_token",
        refresh_token_present=bool(req.refresh_token),
    )

    payload = {
        "grant_type": "refresh_token",
        "refresh_token": req.refresh_token,
        "client_id": CLIENT_ID,
    }

    timer = Timer()
    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            resp = await client.post(
                CERNER_TOKEN_URL,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as e:
        log_event(
            logger,
            logging.ERROR,
            "SMART-on-FHIR token refresh failed — network error",
            event_category="auth",
            event_type="token_refresh_failure",
            outcome="failure",
            token_type="refresh_token",
            duration_ms=timer.stop(),
            error_detail=str(e),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach Cerner token endpoint: {str(e)}",
        )

    if resp.status_code != 200:
        log_event(
            logger,
            logging.WARNING,
            "SMART-on-FHIR token refresh rejected by Cerner",
            event_category="auth",
            event_type="token_refresh_failure",
            outcome="failure",
            token_type="refresh_token",
            http_status=resp.status_code,
            duration_ms=timer.stop(),
        )
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Token refresh failed: {resp.text}",
        )

    log_event(
        logger,
        logging.INFO,
        "SMART-on-FHIR token refresh succeeded",
        event_category="auth",
        event_type="token_refresh_success",
        outcome="success",
        token_type="refresh_token",
        http_status=resp.status_code,
        duration_ms=timer.stop(),
    )
    return resp.json()

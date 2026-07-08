"""
REST API endpoints for SMART on FHIR configuration and OAuth2 token proxy.

Serves FHIR config to the frontend and proxies the OAuth2 token exchange
to avoid CORS issues with the Cerner token endpoint.
"""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.config import (APP_POV, CERNER_BASE_URL, CERNER_TOKEN_URL,
                            CLIENT_ID, REDIRECT_URI, SMART_SCOPES)

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
    payload = {
        "grant_type": "authorization_code",
        "code": req.code,
        "redirect_uri": req.redirect_uri,
        "client_id": CLIENT_ID,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            resp = await client.post(
                CERNER_TOKEN_URL,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502, detail=f"Failed to reach Cerner token endpoint: {str(e)}"
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Token exchange failed: {resp.text}",
        )

    print("\n" + "=" * 60)
    print("SUCCESS: The provider is authorized and connected")
    print("=" * 60 + "\n")

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
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": req.refresh_token,
        "client_id": CLIENT_ID,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
            resp = await client.post(
                CERNER_TOKEN_URL,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502, detail=f"Failed to reach Cerner token endpoint: {str(e)}"
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Token refresh failed: {resp.text}",
        )

    return resp.json()

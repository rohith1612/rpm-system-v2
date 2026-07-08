"""
Authentication dependencies for securing FastAPI endpoints.

Provides two levels of authentication:
- require_auth: Validates any token (including demo mock token for basic features)
- require_cerner_auth: Requires a real Cerner OAuth token (blocks demo mode)

Tokens are validated by introspecting against the Cerner FHIR server.
Validated tokens are cached briefly to reduce latency.
"""

import time
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from backend.config import CERNER_BASE_URL

# Auto-error=False so we can provide a clearer 401 message ourselves
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token", auto_error=False)

DEMO_TOKEN = "mock_offline_demo_token"

# Simple in-memory cache: {token_hash: expiry_timestamp}
_token_cache: dict[str, float] = {}
CACHE_TTL = 60  # seconds


async def _validate_cerner_token(token: str) -> bool:
    """Validate a token by making a lightweight call to the Cerner FHIR server."""
    if not CERNER_BASE_URL:
        # No Cerner configured — allow through (local-only dev)
        return True

    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            resp = await client.get(
                f"{CERNER_BASE_URL.rstrip('/')}/Patient",
                params={"name": "smith", "_count": "1"},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/fhir+json",
                },
            )
        if resp.status_code not in (200, 400, 403):
            print(f"[AUTH] Cerner validation failed with {resp.status_code}: {resp.text}")
        
        # 200 means success. 
        # 403 means the token is valid but lacks scopes for this specific query.
        # 400 means the token is valid but the query was malformed.
        # 401 means the token is invalid or expired.
        return resp.status_code in (200, 400, 403)
    except Exception as e:
        print(f"[AUTH] Cerner validation exception: {e}")
        return False


def _clean_cache() -> None:
    """Remove expired entries from the token cache."""
    now = time.time()
    expired = [k for k, v in _token_cache.items() if v <= now]
    for k in expired:
        del _token_cache[k]


async def require_auth(token: Optional[str] = Depends(oauth2_scheme)) -> str:
    """
    Require a valid authentication token (mock or real Cerner token).

    Use this dependency for endpoints that should be protected but are
    allowed in demo/offline mode (e.g. manual patient CRUD, thresholds, beds).
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Allow demo token for basic features
    if token == DEMO_TOKEN:
        return token

    # Check cache
    now = time.time()
    if token in _token_cache and _token_cache[token] > now:
        return token

    # Validate against Cerner
    is_valid = await _validate_cerner_token(token)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Cache the validated token and clean up expired entries
    _token_cache[token] = now + CACHE_TTL
    _clean_cache()

    return token


async def require_cerner_auth(token: Optional[str] = Depends(oauth2_scheme)) -> str:
    """
    Require a REAL Cerner OAuth token. Blocks demo/mock tokens.

    Use this dependency for Cerner-specific endpoints (search, import,
    sync vitals to EHR) that must not work in offline/demo mode.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if token == DEMO_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This feature requires an active Cerner EHR session. Demo mode does not support EHR operations.",
        )

    # Validate the real token
    return await require_auth(token)

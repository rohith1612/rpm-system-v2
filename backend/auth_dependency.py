"""
Authentication dependencies for securing FastAPI endpoints.

Provides two levels of authentication:
- require_auth: Validates any token (including demo mock token for basic features)
- require_cerner_auth: Requires a real Cerner OAuth token (blocks demo mode)

Tokens are validated by introspecting against the Cerner FHIR server.
Validated tokens are cached briefly to reduce latency.
"""

import logging
import time
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from backend.config import CERNER_BASE_URL
from backend.telemetry.logger import Timer, get_logger, log_event

# Auto-error=False so we can provide a clearer 401 message ourselves
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token", auto_error=False)

DEMO_TOKEN = "mock_offline_demo_token"

# Simple in-memory cache: {token_hash: expiry_timestamp}
_token_cache: dict[str, float] = {}
CACHE_TTL = 60  # seconds

logger = get_logger(__name__)


async def _validate_cerner_token(token: str) -> bool:
    """Validate a token by making a lightweight call to the Cerner FHIR server."""
    if not CERNER_BASE_URL:
        # No Cerner configured — allow through (local-only dev)
        return True

    timer = Timer()
    try:
        log_event(
            logger,
            logging.DEBUG,
            "Sending Cerner token validation probe",
            event_category="auth",
            event_type="token_validation_cerner_call",
            outcome="pending",
        )
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            resp = await client.get(
                f"{CERNER_BASE_URL.rstrip('/')}/Patient",
                params={"name": "smith", "_count": "1"},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/fhir+json",
                },
            )

        is_valid = resp.status_code in (200, 400, 403)

        log_event(
            logger,
            logging.INFO if is_valid else logging.WARNING,
            "Cerner token validation completed",
            event_category="auth",
            event_type=(
                "token_validation_success" if is_valid else "token_validation_failure"
            ),
            outcome="success" if is_valid else "failure",
            http_status=resp.status_code,
            duration_ms=timer.stop(),
        )
        return is_valid

    except Exception as e:
        log_event(
            logger,
            logging.ERROR,
            "Cerner token validation raised exception",
            event_category="auth",
            event_type="token_validation_failure",
            outcome="failure",
            duration_ms=timer.stop(),
            error_detail=str(e),
        )
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
        log_event(
            logger,
            logging.WARNING,
            "Unauthenticated request — no token provided",
            event_category="auth",
            event_type="missing_token",
            outcome="failure",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Allow demo token for basic features
    if token == DEMO_TOKEN:
        log_event(
            logger,
            logging.INFO,
            "Demo token used — offline mode access granted",
            event_category="auth",
            event_type="demo_token_used",
            outcome="success",
            token_type="demo",
        )
        return token

    # Check cache
    now = time.time()
    if token in _token_cache and _token_cache[token] > now:
        log_event(
            logger,
            logging.DEBUG,
            "Token validated from cache (cache hit)",
            event_category="auth",
            event_type="token_validation_cache_hit",
            outcome="success",
            token_type="cerner",
        )
        return token

    # Validate against Cerner
    is_valid = await _validate_cerner_token(token)
    if not is_valid:
        log_event(
            logger,
            logging.WARNING,
            "Token rejected — invalid or expired",
            event_category="auth",
            event_type="token_validation_failure",
            outcome="failure",
            token_type="cerner",
        )
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
        log_event(
            logger,
            logging.WARNING,
            "Unauthenticated request to Cerner-gated endpoint",
            event_category="auth",
            event_type="missing_token",
            outcome="failure",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if token == DEMO_TOKEN:
        log_event(
            logger,
            logging.WARNING,
            "Demo token rejected at Cerner-gated endpoint",
            event_category="auth",
            event_type="demo_token_rejected",
            outcome="failure",
            token_type="demo",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This feature requires an active Cerner EHR session. Demo mode does not support EHR operations.",
        )

    # Validate the real token
    return await require_auth(token)

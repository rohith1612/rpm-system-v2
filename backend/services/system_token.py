import base64
from datetime import datetime, timedelta

import httpx

from backend.config import (CERNER_TOKEN_URL, SYSTEM_CLIENT_ID, SYSTEM_SCOPES,
                            SYSTEM_SECRET)

_cached_token = None
_token_expires_at = None


async def get_system_token() -> str:
    global _cached_token, _token_expires_at

    if _cached_token and _token_expires_at and datetime.now() < _token_expires_at:
        return _cached_token

    if not SYSTEM_CLIENT_ID or not SYSTEM_SECRET:
        raise ValueError(
            "System credentials (SYSTEM_CLIENT_ID, SYSTEM_SECRET) are not configured."
        )

    auth_str = f"{SYSTEM_CLIENT_ID}:{SYSTEM_SECRET}"
    b64_auth = base64.b64encode(auth_str.encode()).decode()

    headers = {
        "Authorization": f"Basic {b64_auth}",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }

    data = {"grant_type": "client_credentials", "scope": SYSTEM_SCOPES}

    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        resp = await client.post(CERNER_TOKEN_URL, headers=headers, data=data)
        if resp.status_code != 200:
            raise Exception(f"Failed to retrieve system token: {resp.text}")

        token_data = resp.json()

    _cached_token = token_data.get("access_token")
    expires_in = token_data.get("expires_in", 300)
    # Cache it until 30 seconds before it expires
    _token_expires_at = datetime.now() + timedelta(seconds=expires_in - 30)

    return _cached_token

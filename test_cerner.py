import asyncio

import httpx

from backend.config import CERNER_BASE_URL
from backend.services.system_token import get_system_token


async def test():
    token = await get_system_token()
    print("Token:", token[:10])
    url = f"{CERNER_BASE_URL.rstrip('/')}/Condition"
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            url,
            params={"patient": "12724066", "_count": "50"},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/fhir+json",
            },
        )
        print("Condition Status:", resp.status_code)
        print("Condition Body:", resp.text[:200])

    url2 = f"{CERNER_BASE_URL.rstrip('/')}/MedicationRequest"
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            url2,
            params={"patient": "12724066", "_count": "50"},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/fhir+json",
            },
        )
        print("Medication Status:", resp.status_code)
        print("Medication Body:", resp.text[:200])


asyncio.run(test())

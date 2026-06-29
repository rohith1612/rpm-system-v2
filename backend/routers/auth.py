from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from urllib.parse import urlencode
import httpx
import os
import uuid
from backend.config import CERNER_FHIR_BASE_URL

SESSIONS = {}

router = APIRouter(prefix="/api/auth", tags=["auth"])

class CallbackRequest(BaseModel):
    code: str
    redirect_uri: str
    client_id: str

@router.get("/smart-config")
async def get_smart_config(client_id: str, redirect_uri: str, launch: str | None = None, iss: str | None = None):
    aud = iss if iss else (CERNER_FHIR_BASE_URL or "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d")
    
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "user/Patient.read user/Observation.read user/Observation.write online_access openid fhirUser",
        "state": "rpm-smart-state",
        "aud": aud
    }
    if launch:
        params["launch"] = launch
        
    tenant = aud.rstrip('/').split('/')[-1]
    auth_url = f"https://authorization.cerner.com/tenants/{tenant}/protocols/oauth2/profiles/smart-v1/personas/provider/authorize"
    return {"authorize_url": f"{auth_url}?{urlencode(params)}"}

@router.post("/token")
async def exchange_token(req: CallbackRequest):
    tenant = (CERNER_FHIR_BASE_URL or "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d").rstrip('/').split('/')[-1]
    token_url = f"https://authorization.cerner.com/tenants/{tenant}/protocols/oauth2/profiles/smart-v1/token"
    
    data = {
        "grant_type": "authorization_code",
        "code": req.code,
        "redirect_uri": req.redirect_uri,
        "client_id": req.client_id,
    }
    
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(token_url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        
        token_data = resp.json()
        session_id = str(uuid.uuid4())
        SESSIONS[session_id] = {
            "access_token": token_data.get("access_token"),
            "patient": token_data.get("patient")
        }
        return {"session_id": session_id, **token_data}

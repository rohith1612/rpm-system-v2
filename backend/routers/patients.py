"""
REST API endpoints for patient data.
"""

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.config import ALERT_THRESHOLDS
from backend.services.alert_service import get_custom_thresholds, set_custom_thresholds
from backend.services.vitals_service import get_all_patients, get_patient

class ThresholdUpdate(BaseModel):
    vital_type: str
    warn_low: Optional[float] = None
    crit_low: Optional[float] = None
    warn_high: Optional[float] = None
    crit_high: Optional[float] = None

class PatientCreateUpdate(BaseModel):
    name: str
    age: int
    condition: str
    cerner_patient_id: Optional[str] = None

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("")
def list_patients():
    """List all patients with their latest vital snapshot."""
    return get_all_patients()


@router.get("/cerner/search")
async def search_cerner_patients(query: str):
    """Search for patients in the Cerner EHR Sandbox using the System Token."""
    import httpx
    import asyncio
    from backend.config import CERNER_BASE_URL
    from backend.services.system_token import get_system_token
    
    token = await get_system_token()
    params = {}
    if query.isdigit():
        params["_id"] = query.strip()
    else:
        params["name"] = query.strip()
        params["_count"] = "25"
        
    url = f"{CERNER_BASE_URL.rstrip('/')}/Patient"
    
    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        resp = await client.get(
            url, 
            params=params, 
            headers={"Authorization": f"Bearer {token}", "Accept": "application/fhir+json"}
        )
        
    if resp.status_code != 200:
        return {"error": f"Failed to fetch from Cerner: {resp.text}"}, resp.status_code
        
    data = resp.json()
    entries = data.get("entry", [])[:15]
    results = []
    for entry in entries:
        res = entry.get("resource", {})
        names = res.get("name", [{}])[0]
        full_name = names.get("text") or f"{names.get('given', [''])[0]} {names.get('family', '')}"
        
        # Calculate age
        age = 0
        if res.get("birthDate"):
            from datetime import datetime
            birth_dt = datetime.fromisoformat(res["birthDate"][:10])
            today = datetime.today()
            age = today.year - birth_dt.year - ((today.month, today.day) < (birth_dt.month, birth_dt.day))
            
        results.append({
            "id": res.get("id"),
            "name": full_name.strip(),
            "age": age,
            "condition": "Cerner EHR Record",
            "has_active_encounter": False
        })
        
    # Check active encounter for each patient in parallel
    async def check_encounter(patient_id):
        enc_url = f"{CERNER_BASE_URL.rstrip('/')}/Encounter"
        enc_params = {"patient": patient_id}
        try:
            async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
                enc_resp = await client.get(
                    enc_url,
                    params=enc_params,
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/fhir+json"}
                )
            if enc_resp.status_code == 200:
                enc_data = enc_resp.json()
                for entry in enc_data.get("entry", []):
                    if entry.get("resource", {}).get("status") == "in-progress":
                        return True
        except Exception as e:
            print(f"Error querying encounters for search patient {patient_id}: {e}")
        return False

    if results:
        encounter_results = await asyncio.gather(*(check_encounter(p["id"]) for p in results))
        for i, p in enumerate(results):
            p["has_active_encounter"] = encounter_results[i]

    return results

@router.get("/cerner/{cerner_patient_id}")
async def get_cerner_patient(cerner_patient_id: str):
    """Get demographics and encounter status for a specific Cerner patient via System Token."""
    import httpx
    from backend.config import CERNER_BASE_URL
    from backend.services.system_token import get_system_token
    
    token = await get_system_token()
    url = f"{CERNER_BASE_URL.rstrip('/')}/Patient/{cerner_patient_id}"
    
    async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
        resp = await client.get(
            url, 
            headers={"Authorization": f"Bearer {token}", "Accept": "application/fhir+json"}
        )
        
    if resp.status_code != 200:
        return {"error": f"Failed to fetch patient from Cerner: {resp.text}"}, resp.status_code
        
    res = resp.json()
    names = res.get("name", [{}])[0]
    full_name = names.get("text") or f"{names.get('given', [''])[0]} {names.get('family', '')}"
    
    age = 0
    if res.get("birthDate"):
        from datetime import datetime
        birth_dt = datetime.fromisoformat(res["birthDate"][:10])
        today = datetime.today()
        age = today.year - birth_dt.year - ((today.month, today.day) < (birth_dt.month, birth_dt.day))
        
    # Parse demographics
    addresses = []
    for addr in res.get("address", []):
        lines = ", ".join(addr.get("line", []))
        city = addr.get("city", "")
        state = addr.get("state", "")
        postal = addr.get("postalCode", "")
        country = addr.get("country", "")
        parts = [p for p in [lines, city, state, postal, country] if p]
        if parts:
            addresses.append(", ".join(parts))
            
    telecoms = []
    for tel in res.get("telecom", []):
        sys = tel.get("system", "")
        val = tel.get("value", "")
        use = tel.get("use", "")
        if val:
            label = f"{sys.capitalize()} ({use})" if use else sys.capitalize()
            telecoms.append(f"{label}: {val}")

    # Fetch patient encounters
    enc_url = f"{CERNER_BASE_URL.rstrip('/')}/Encounter"
    enc_params = {"patient": cerner_patient_id}
    has_active_encounter = False
    active_encounter_id = None
    active_encounter_number = None
    encounters = []
    
    try:
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            enc_resp = await client.get(
                enc_url,
                params=enc_params,
                headers={"Authorization": f"Bearer {token}", "Accept": "application/fhir+json"}
            )
        if enc_resp.status_code == 200:
            enc_data = enc_resp.json()
            for entry in enc_data.get("entry", []):
                resource = entry.get("resource", {})
                status = resource.get("status")
                enc_id = resource.get("id")
                
                # Try to extract identifier / number
                identifiers = []
                for ident in resource.get("identifier", []):
                    val = ident.get("value")
                    if val:
                        identifiers.append(val)
                enc_num = identifiers[0] if identifiers else enc_id
                
                period = resource.get("period", {})
                start = period.get("start")
                end = period.get("end")
                
                enc_class = resource.get("class", {})
                enc_class_display = enc_class.get("display") or enc_class.get("code")
                
                enc_type_list = resource.get("type", [{}])
                enc_type_text = enc_type_list[0].get("text") or (enc_type_list[0].get("coding", [{}])[0].get("display") if enc_type_list[0].get("coding") else None)
                
                enc_info = {
                    "id": enc_id,
                    "status": status,
                    "number": enc_num,
                    "start": start,
                    "end": end,
                    "class": enc_class_display,
                    "type": enc_type_text or "Encounter"
                }
                encounters.append(enc_info)
                
                # Check for active status
                if status == "in-progress":
                    has_active_encounter = True
                    active_encounter_id = enc_id
                    active_encounter_number = enc_num
    except Exception as e:
        print(f"Error querying encounters for {cerner_patient_id}: {e}")

    return {
        "id": res.get("id"),
        "name": full_name.strip(),
        "age": age,
        "gender": res.get("gender") or "unknown",
        "birth_date": res.get("birthDate") or "unknown",
        "addresses": addresses,
        "telecoms": telecoms,
        "has_active_encounter": has_active_encounter,
        "active_encounter_id": active_encounter_id,
        "active_encounter_number": active_encounter_number,
        "encounters": encounters
    }


@router.get("/{patient_id}")
def get_patient_detail(patient_id: str):
    """Get a single patient with latest vitals."""
    patient = get_patient(patient_id)
    if patient is None:
        return {"error": "Patient not found"}, 404
    return patient

@router.get("/{patient_id}/ecg")
def get_patient_ecg(patient_id: str):
    """Get in-memory ECG buffer for a patient."""
    from backend.services.vitals_service import get_latest_ecg
    return get_latest_ecg(patient_id)

@router.post("")
async def create_new_patient(patient: PatientCreateUpdate):
    """Create a new patient."""
    from backend.services.vitals_service import create_patient, get_latest_vitals_map
    from backend.routers.websocket import broadcast
    res = create_patient(patient.name, patient.age, patient.condition, patient.cerner_patient_id)
    await broadcast({"type": "snapshot", "data": get_latest_vitals_map()})
    return res

@router.put("/{patient_id}")
async def update_existing_patient(patient_id: str, patient: PatientCreateUpdate):
    """Update an existing patient."""
    from backend.services.vitals_service import update_patient, get_latest_vitals_map
    from backend.routers.websocket import broadcast
    res = update_patient(patient_id, patient.name, patient.age, patient.condition)
    await broadcast({"type": "snapshot", "data": get_latest_vitals_map()})
    return res

@router.get("/{patient_id}/insights")
def get_patient_insights(patient_id: str):
    """Generate an AI insight based on recent vitals and alerts."""
    from backend.services.vitals_service import get_patient, get_vitals_history
    from backend.services.alert_service import get_patient_alerts
    from backend.services.ai_service import generate_clinical_insight
    
    patient = get_patient(patient_id)
    if not patient:
        return {"error": "Patient not found"}, 404
        
    vitals = get_vitals_history(patient_id, minutes=60)
    
    # Require at least 10 minutes of data
    from datetime import datetime
    if not vitals:
        return {"error": "Not enough data. Please wait until at least 10 minutes of telemetry has been collected."}, 400
        
    oldest_time = datetime.fromisoformat(vitals[0]["recorded_at"])
    newest_time = datetime.fromisoformat(vitals[-1]["recorded_at"])
    time_span_seconds = (newest_time - oldest_time).total_seconds()
    
    if time_span_seconds < 600:
        return {"error": f"Not enough data. Only {int(time_span_seconds // 60)} minutes collected. Minimum 10 minutes required."}, 400
        
    alerts = get_patient_alerts(patient_id, limit=5)
    
    insight = generate_clinical_insight(patient, vitals, alerts)
    
    return {"insight": insight}

@router.delete("/{patient_id}")
async def delete_existing_patient(patient_id: str):
    """Delete a patient and all their related data."""
    from backend.services.vitals_service import delete_patient, get_latest_vitals_map
    from backend.routers.websocket import broadcast
    delete_patient(patient_id)
    await broadcast({"type": "snapshot", "data": get_latest_vitals_map()})
    return {"status": "success"}

@router.get("/{patient_id}/thresholds")
def get_thresholds(patient_id: str):
    """Get custom thresholds merged with defaults."""
    custom = get_custom_thresholds(patient_id)
    result = []
    for vital, default_bounds in ALERT_THRESHOLDS.items():
        bounds = custom.get(vital, default_bounds)
        result.append(
            {
                "vital_type": vital,
                "warn_low": bounds.get("warn_low"),
                "crit_low": bounds.get("crit_low"),
                "warn_high": bounds.get("warn_high"),
                "crit_high": bounds.get("crit_high"),
                "is_custom": vital in custom,
            }
        )
    return result


@router.put("/{patient_id}/thresholds")
def update_thresholds(patient_id: str, thresholds: List[ThresholdUpdate]):
    """Save custom thresholds for a patient."""
    set_custom_thresholds(patient_id, [t.dict() for t in thresholds])
    return {"status": "success"}


class CernerLogPayload(BaseModel):
    patient_id: str
    cerner_patient_id: str
    status: str
    method: str
    http_status: int
    payload_sent: Optional[str] = None
    response_body: Optional[str] = None
    vitals_sent: dict


@router.post("/cerner/log-sync")
def log_cerner_sync(payload: CernerLogPayload):
    """Log Cerner FHIR synchronization status and response details to the backend console."""
    print("\n" + "="*80)
    print(f"[CERNER SYNC LOG] Patient ID: {payload.patient_id} (Cerner ID: {payload.cerner_patient_id})")
    print(f"Status: {payload.status.upper()} (HTTP {payload.http_status})")
    print(f"Method: {payload.method}")
    print(f"Vitals Sent: {payload.vitals_sent}")
    print("FHIR Payload Sent to Cerner:")
    if payload.payload_sent:
        print(payload.payload_sent)
    else:
        print("No payload recorded.")
    print("Response/Details from Cerner:")
    if payload.response_body:
        print(payload.response_body)
    else:
        print("No response body returned or mock environment.")
    print("="*80 + "\n")
    return {"status": "logged"}


@router.get("/cerner/queue-size")
def get_cerner_queue_size():
    """Get the current number of pending items in the leaky bucket queue."""
    from backend.services.cerner_queue import get_queue_size
    return {"size": get_queue_size()}


class CernerSyncRequest(BaseModel):
    heart_rate: Optional[float] = None
    spo2: Optional[float] = None
    temperature: Optional[float] = None
    respiratory_rate: Optional[float] = None
    systolic_bp: Optional[float] = None
    diastolic_bp: Optional[float] = None


@router.post("/{patient_id}/cerner/sync")
async def sync_vitals_to_cerner(patient_id: str, payload: CernerSyncRequest):
    """
    Sync vitals of a patient to Cerner EHR using the leaky bucket background queue.
    Enqueues the items and returns HTTP 202 immediately.
    """
    from backend.services.cerner_queue import enqueue_vitals, get_queue_size
    
    # 1. Fetch patient to check for Cerner Patient ID
    patient = get_patient(patient_id)
    if not patient:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Patient not found.")
        
    cerner_patient_id = patient.get("cerner_patient_id")
    if not cerner_patient_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Patient is not linked to any Cerner ID.")

    # 2. Enqueue the vitals into the background leaky bucket queue
    enqueue_vitals(patient_id, cerner_patient_id, payload.dict())

    return {
        "status": "queued",
        "pending_size": get_queue_size(),
        "detail": "Vitals successfully queued for system background sync."
    }



"""
REST API endpoints for patient data.
"""

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from backend.config import ALERT_THRESHOLDS
from backend.services.alert_service import get_custom_thresholds, set_custom_thresholds
from backend.services.vitals_service import get_all_patients, get_patient
import requests
import urllib3
from fastapi import HTTPException, Header
from backend.routers.auth import SESSIONS
from backend.config import CERNER_FHIR_BASE_URL
import datetime

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class ThresholdUpdate(BaseModel):
    vital_type: str
    warn_low: Optional[float] = None
    crit_low: Optional[float] = None
    warn_high: Optional[float] = None
    crit_high: Optional[float] = None

class PatientCreateUpdate(BaseModel):
    id: str
    name: str
    age: int
    condition: str

router = APIRouter(prefix="/api/patients", tags=["patients"])


@router.get("")
def list_patients():
    """List all patients with their latest vital snapshot."""
    return get_all_patients()


@router.get("/cerner/search")
async def search_cerner_patients(name: str = "", x_session_id: str | None = Header(None)):
    """Search for patients in the Cerner Sandbox by name or MRN/ID."""
    session = SESSIONS.get(x_session_id) if x_session_id else None
    token = session["access_token"] if session else None
    
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid session ID for Cerner access")
        
    base_url = CERNER_FHIR_BASE_URL or "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/fhir+json"
    }
    
    # cerner-test-2 approach: search by _id if digit, else by name
    if name.isdigit():
        params = {"_id": name}
    elif name:
        params = {"name": name, "_count": "100"}
    else:
        params = {"_count": "100"} # Default load more patients
        
    res = requests.get(f"{base_url}/Patient", headers=headers, params=params, verify=False)
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail=f"Failed to search Cerner: {res.text}")
        
    data = res.json()
    entries = data.get("entry", [])
    
    results = []
    for entry in entries:
        resource = entry.get("resource", {})
        if resource.get("resourceType") != "Patient":
            continue
            
        c_id = resource.get("id")
        
        # Parse name safely
        names = resource.get("name", [{}])
        if names:
            n = names[0]
            given_list = n.get("given", [])
            given = given_list[0] if given_list else ""
            family = n.get("family", "")
            patient_name = n.get("text") or f"{given} {family}".strip()
        else:
            patient_name = "Unknown"
        
        gender = resource.get("gender", "unknown")
        birth_date = resource.get("birthDate", "unknown")
        
        # Parse MRN matching cerner-test-2 approach
        identifiers = resource.get("identifier", [])
        mrn = next((i.get("value") for i in identifiers if i.get("type", {}).get("coding", [{}])[0].get("code") == "MR"), None)
        
        results.append({
            "cerner_id": c_id,
            "name": patient_name.strip(),
            "gender": gender,
            "birthDate": birth_date,
            "mrn": mrn
        })
        
    return results

@router.post("/cerner/import/{cerner_patient_id}")
async def import_cerner_patient(cerner_patient_id: str, x_session_id: str | None = Header(None)):
    """Fetch patient from Cerner and map to PD_XXXXX format in our system."""
    session = SESSIONS.get(x_session_id) if x_session_id else None
    token = session["access_token"] if session else None
    
    if not token:
        raise HTTPException(status_code=401, detail="Missing or invalid session ID for Cerner access")
        
    base_url = CERNER_FHIR_BASE_URL or "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/fhir+json"
    }
    
    res = requests.get(f"{base_url}/Patient/{cerner_patient_id}", headers=headers, verify=False)
    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail=f"Failed to fetch patient from Cerner: {res.text}")
        
    data = res.json()
    
    # Extract name (first official or usual)
    name_list = data.get("name", [])
    patient_name = "Unknown"
    if name_list:
        n = name_list[0]
        patient_name = " ".join(n.get("given", [])) + " " + n.get("family", "")
        patient_name = patient_name.strip()
        
    # Extract birthDate to calculate age roughly
    age = 0
    birth_date = data.get("birthDate")
    if birth_date:
        try:
            b_year = int(birth_date.split("-")[0])
            age = datetime.datetime.now().year - b_year
        except:
            pass
            
    device_id = f"PD_{cerner_patient_id}"
    condition = "Imported from Cerner"
    
    from backend.services.vitals_service import create_patient, get_latest_vitals_map
    from backend.routers.websocket import broadcast
    try:
        patient_res = create_patient(device_id, patient_name, age, condition)
        await broadcast({"type": "snapshot", "data": get_latest_vitals_map()})
        return patient_res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{patient_id}")
def get_patient_detail(patient_id: str):
    """Get a single patient with latest vitals."""
    patient = get_patient(patient_id)
    if patient is None:
        return {"error": "Patient not found"}, 404
    return patient




@router.post("")
async def create_new_patient(patient: PatientCreateUpdate):
    """Create a new patient."""
    from backend.services.vitals_service import create_patient, get_latest_vitals_map
    from backend.routers.websocket import broadcast
    res = create_patient(patient.id, patient.name, patient.age, patient.condition)
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

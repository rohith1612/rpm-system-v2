import os
import requests
import time
import json
import sqlite3
import urllib3
from datetime import datetime
from backend.services.vitals_service import get_all_patients

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from backend.config import CERNER_SYSTEM_CLIENT_ID, CERNER_SYSTEM_CLIENT_SECRET, CERNER_FHIR_BASE_URL

def init_dlq():
    conn = sqlite3.connect("cerner_retry_queue.db")
    conn.execute("CREATE TABLE IF NOT EXISTS dlq (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)")
    conn.commit()
    conn.close()

init_dlq()

def push_to_dlq(bundle):
    conn = sqlite3.connect("cerner_retry_queue.db")
    conn.execute("INSERT INTO dlq (payload) VALUES (?)", (json.dumps(bundle),))
    conn.commit()
    conn.close()
    
def retry_dlq(token, base_url, headers):
    conn = sqlite3.connect("cerner_retry_queue.db")
    rows = conn.execute("SELECT id, payload FROM dlq").fetchall()
    
    for row in rows:
        row_id, payload_str = row
        bundle = json.loads(payload_str)
        try:
            res = requests.post(base_url, json=bundle, headers=headers, verify=False)
            if res.status_code in [200, 201]:
                conn.execute("DELETE FROM dlq WHERE id = ?", (row_id,))
                conn.commit()
                print(f"[Cerner DLQ] Retry successful for Bundle ID {row_id}.")
            else:
                print(f"[Cerner DLQ] Retry failed {res.status_code}")
        except Exception as e:
            print(f"[Cerner DLQ] Retry error: {e}")
            
    conn.close()

# Cerner authorization URL
CERNER_AUTH_URL = "https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/token"

_access_token = None
_token_expiry = 0

def get_access_token():
    global _access_token, _token_expiry
    now = time.time()
    
    if _access_token and now < _token_expiry:
        return _access_token

    if not CERNER_SYSTEM_CLIENT_ID or not CERNER_SYSTEM_CLIENT_SECRET:
        print("[Cerner Sync] Warning: Cerner SYSTEM credentials not configured.")
        return None

    try:
        response = requests.post(
            CERNER_AUTH_URL,
            data={"grant_type": "client_credentials"},
            auth=(CERNER_SYSTEM_CLIENT_ID, CERNER_SYSTEM_CLIENT_SECRET),
            headers={"Accept": "application/json"},
            verify=False
        )
        response.raise_for_status()
        data = response.json()
        _access_token = data.get("access_token")
        expires_in = data.get("expires_in", 300)
        _token_expiry = now + expires_in - 10 # 10 seconds buffer
        print("[Cerner Sync] Authenticated successfully.")
        return _access_token
    except Exception as e:
        print(f"[Cerner Sync] Authentication failed: {e}")
        return None

def build_observation(patient_cerner_id, loinc_code, display, value, unit, unit_code):
    if value is None:
        return None
    
    return {
        "resourceType": "Observation",
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "vital-signs",
                        "display": "Vital Signs"
                    }
                ],
                "text": "Vital Signs"
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": loinc_code,
                    "display": display
                }
            ],
            "text": display
        },
        "subject": {
            "reference": f"Patient/{patient_cerner_id}"
        },
        "effectiveDateTime": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "valueQuantity": {
            "value": float(value),
            "unit": unit,
            "system": "http://unitsofmeasure.org",
            "code": unit_code
        }
    }

def sync_vitals_to_cerner():
    print("[Cerner Sync] Starting vitals sync...")
    token = get_access_token()
    if not token:
        print("[Cerner Sync] Aborting sync due to missing token.")
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/fhir+json",
        "Content-Type": "application/fhir+json"
    }

    patients = get_all_patients()
    base_url = CERNER_FHIR_BASE_URL or "https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d"

    all_observations = []

    for p in patients:
        device_id = p["id"]
        # Logic: device mapping is our logic, make it a format PD_XXXXX
        if not device_id.startswith("PD_"):
            continue
        
        patient_cerner_id = device_id.replace("PD_", "")
        
        observations = [
            build_observation(patient_cerner_id, "69000-8", "Heart rate", p.get("heart_rate"), "beats/minute", "{Beats}/min"),
            build_observation(patient_cerner_id, "9279-1", "Respiratory rate", p.get("respiratory_rate"), "/min", "{Breaths}/min"),
            build_observation(patient_cerner_id, "8331-1", "Oral temperature", p.get("temperature"), "degC", "Cel"),
            build_observation(patient_cerner_id, "59418-4", "SpO2", p.get("spo2"), "%", "%")
        ]
        
        # Add Blood Pressure (Panel)
        sys_bp = p.get("systolic_bp")
        dia_bp = p.get("diastolic_bp")
        if sys_bp is not None and dia_bp is not None:
            bp_obs = {
                "resourceType": "Observation",
                "status": "final",
                "category": [
                    {
                        "coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "vital-signs", "display": "Vital Signs"}],
                    }
                ],
                "code": {
                    "coding": [{"system": "http://loinc.org", "code": "85354-9", "display": "Blood pressure"}],
                    "text": "Blood pressure"
                },
                "subject": {"reference": f"Patient/{patient_cerner_id}"},
                "effectiveDateTime": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "component": [
                    {
                        "code": {"coding": [{"system": "http://loinc.org", "code": "8480-6", "display": "Systolic blood pressure"}]},
                        "valueQuantity": {"value": float(sys_bp), "unit": "mm[Hg]", "system": "http://unitsofmeasure.org", "code": "mm[Hg]"}
                    },
                    {
                        "code": {"coding": [{"system": "http://loinc.org", "code": "8462-4", "display": "Diastolic blood pressure"}]},
                        "valueQuantity": {"value": float(dia_bp), "unit": "mm[Hg]", "system": "http://unitsofmeasure.org", "code": "mm[Hg]"}
                    }
                ]
            }
            observations.append(bp_obs)

        # Filter out None and push to all
        for obs in observations:
            if obs is not None:
                all_observations.append(obs)
                
    if not all_observations:
        print("[Cerner Sync] No observations to sync.")
        return
        
    bundle = {
        "resourceType": "Bundle",
        "type": "batch",
        "entry": []
    }
    
    for obs in all_observations:
        bundle["entry"].append({
            "resource": obs,
            "request": {
                "method": "POST",
                "url": "Observation"
            }
        })
        
    try:
        res = requests.post(base_url, json=bundle, headers=headers, verify=False)
        if res.status_code not in [200, 201]:
            print(f"[Cerner Sync] Bundle POST failed: {res.status_code}. Pushing to DLQ.")
            push_to_dlq(bundle)
        else:
            print(f"[Cerner Sync] Sync complete for {len(patients)} mapped patients using Batch.")
    except Exception as e:
        print(f"[Cerner Sync] Error posting Bundle: {e}. Pushing to DLQ.")
        push_to_dlq(bundle)
        
    # Attempt to flush any previously failed syncs
    retry_dlq(token, base_url, headers)

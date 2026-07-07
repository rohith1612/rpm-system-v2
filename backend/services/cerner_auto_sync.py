import threading
import time
from backend.services.vitals_service import get_all_patients
from backend.services.cerner_queue import enqueue_vitals

import datetime

def sync_worker():
    """Background thread that automatically syncs patient vitals to Cerner every 60 seconds."""
    print("[RPM] Cerner FHIR Auto-Sync started (running every 60 seconds)")
    while True:
        try:
            # Sync every 60 seconds
            time.sleep(60)
            
            patients = get_all_patients()
            
            for p in patients:
                patient_id = p["id"]
                
                # patient_id IS the Cerner ID now; sync if they have recorded vitals
                if p.get("recorded_at"):
                    try:
                        recorded_time = datetime.datetime.strptime(p["recorded_at"], "%Y-%m-%dT%H:%M:%S")
                        # Only sync if the data is active (recorded within the last 5 minutes)
                        if (datetime.datetime.now() - recorded_time).total_seconds() > 300:
                            continue
                    except Exception as date_err:
                        print(f"[RPM] Date parsing error in Auto-Sync for {patient_id}: {date_err}")
                        continue
                        
                    vitals_payload = {
                        "heart_rate": p.get("heart_rate"),
                        "spo2": p.get("spo2"),
                        "temperature": p.get("temperature"),
                        "respiratory_rate": p.get("respiratory_rate"),
                        "systolic_bp": p.get("systolic_bp"),
                        "diastolic_bp": p.get("diastolic_bp"),
                    }
                    
                    # Enqueue the FHIR sync (patient_id == cerner_id)
                    enqueue_vitals(patient_id, patient_id, vitals_payload)
                    
        except Exception as e:
            print(f"[RPM] Error in Cerner Auto-Sync worker: {e}")

def start_auto_sync():
    """Starts the Cerner Auto-Sync background thread."""
    thread = threading.Thread(target=sync_worker, daemon=True)
    thread.start()

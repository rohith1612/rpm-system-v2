import threading
import time
from backend.services.vitals_service import get_all_patients
from backend.services.cerner_queue import enqueue_vitals

def sync_worker():
    """Background thread that automatically syncs patient vitals to Cerner every 60 seconds."""
    print("[RPM] Cerner FHIR Auto-Sync started (running every 60 seconds)")
    while True:
        try:
            # Sync every 60 seconds
            time.sleep(60)
            
            patients = get_all_patients()
            
            for p in patients:
                cerner_id = p.get("cerner_patient_id")
                
                # If they have a Cerner mapping and they have some vitals recorded
                if cerner_id and p.get("recorded_at"):
                    vitals_payload = {
                        "heart_rate": p.get("heart_rate"),
                        "spo2": p.get("spo2"),
                        "temperature": p.get("temperature"),
                        "respiratory_rate": p.get("respiratory_rate"),
                        "systolic_bp": p.get("systolic_bp"),
                        "diastolic_bp": p.get("diastolic_bp"),
                    }
                    
                    # Enqueue the FHIR sync
                    enqueue_vitals(p["id"], cerner_id, vitals_payload)
                    
        except Exception as e:
            print(f"[RPM] Error in Cerner Auto-Sync worker: {e}")

def start_auto_sync():
    """Starts the Cerner Auto-Sync background thread."""
    thread = threading.Thread(target=sync_worker, daemon=True)
    thread.start()

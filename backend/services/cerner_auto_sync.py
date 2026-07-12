import datetime
import logging
import threading
import time

from backend.services.cerner_queue import enqueue_vitals
from backend.services.vitals_service import get_all_patients
from backend.telemetry.logger import get_logger, log_event

logger = get_logger(__name__)


def sync_worker():
    """Background thread that automatically syncs patient vitals to Cerner every 60 seconds."""
    log_event(
        logger, logging.INFO,
        "Cerner FHIR auto-sync started (60 s interval)",
        event_category="system",
        event_type="startup",
        outcome="success",
    )
    while True:
        try:
            # Sync every 60 seconds
            time.sleep(60)

            patients = get_all_patients()
            enqueued = 0
            skipped = 0

            for p in patients:
                patient_id = p["id"]

                # patient_id IS the Cerner ID now; sync if they have recorded vitals
                if p.get("recorded_at"):
                    try:
                        recorded_time = datetime.datetime.strptime(
                            p["recorded_at"], "%Y-%m-%dT%H:%M:%S"
                        )
                        # Only sync if the data is active (recorded within the last 5 minutes)
                        if (
                            datetime.datetime.now() - recorded_time
                        ).total_seconds() > 300:
                            log_event(
                                logger, logging.DEBUG,
                                "Auto-sync skipped — vitals stale (>5 min)",
                                event_category="system",
                                event_type="cerner_autosync_skipped",
                                outcome="skipped",
                                patient_id=patient_id,
                            )
                            skipped += 1
                            continue
                    except Exception as date_err:
                        log_event(
                            logger, logging.WARNING,
                            "Auto-sync date parse error",
                            event_category="system",
                            event_type="cerner_autosync_skipped",
                            outcome="failure",
                            patient_id=patient_id,
                            error_detail=str(date_err),
                        )
                        skipped += 1
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
                    enqueued += 1

                    log_event(
                        logger, logging.DEBUG,
                        "Auto-sync vitals enqueued for patient",
                        event_category="system",
                        event_type="cerner_autosync_enqueued",
                        outcome="success",
                        patient_id=patient_id,
                    )

            log_event(
                logger, logging.INFO,
                f"Cerner auto-sync tick complete: {enqueued} enqueued, {skipped} skipped",
                event_category="system",
                event_type="cerner_autosync_tick",
                outcome="success",
                batch_size=enqueued,
            )

        except Exception as e:
            log_event(
                logger, logging.ERROR,
                "Cerner auto-sync worker error",
                event_category="system",
                event_type="cerner_autosync_tick",
                outcome="failure",
                error_detail=str(e),
            )


def start_auto_sync():
    """Starts the Cerner Auto-Sync background thread."""
    thread = threading.Thread(target=sync_worker, daemon=True)
    thread.start()

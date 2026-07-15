import datetime
import logging
import queue
import threading
import time
from typing import Any, Dict

import httpx

from backend.config import CERNER_BASE_URL
from backend.services.system_token import get_system_token
from backend.telemetry.logger import Timer, get_logger, log_event

logger = get_logger(__name__)

# Leaky bucket queue for Cerner observation writes
_sync_queue = queue.Queue()
_worker_thread = None
_leak_rate_seconds = 2.0  # Leak rate limit between writes


def enqueue_vitals(patient_id: str, cerner_patient_id: str, vitals: Dict[str, Any]):
    """
    Splits the patient vitals into individual FHIR Observation tasks
    and adds them to the leaky bucket queue.
    """
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%S.000Z"
    )

    # Define mapping of local vitals keys to LOINC codes, display names, and UCUM units
    mappings = {
        "heart_rate": {
            "code": "69000-8",
            "display": "Heart rate",
            "unit": "beats/minute",
            "unit_code": "{Beats}/min",
            "integer": True,
        },
        "spo2": {
            "code": "59418-4",
            "display": "SpO2",
            "unit": "%",
            "unit_code": "%",
            "integer": True,
        },
        "temperature": {
            "code": "8331-1",
            "display": "Oral temperature",
            "unit": "degF",
            "unit_code": "[degF]",
            "integer": False,
        },
        "respiratory_rate": {
            "code": "9279-1",
            "display": "Respiratory rate",
            "unit": "/min",
            "unit_code": "{Breaths}/min",
            "integer": True,
        },
    }

    # 1. Enqueue single vitals
    for key, spec in mappings.items():
        val = vitals.get(key)
        if val is not None:
            # Convert Celsius to Fahrenheit for Cerner if the value is in the Celsius range
            if key == "temperature":
                try:
                    f_val = float(val)
                    if f_val < 50:  # If less than 50, it's definitely Celsius
                        val = round((f_val * 9 / 5) + 32, 1)
                except ValueError:
                    pass

            _sync_queue.put(
                {
                    "patient_id": patient_id,
                    "cerner_patient_id": cerner_patient_id,
                    "type": "single",
                    "code": spec["code"],
                    "display": spec["display"],
                    "value": val,
                    "unit": spec["unit"],
                    "unit_code": spec["unit_code"],
                    "integer": spec["integer"],
                    "timestamp": timestamp,
                    "retry_count": 0,
                }
            )

    # 2. Enqueue blood pressure panel (LOINC: 85354-9) if either systolic or diastolic is present
    systolic = vitals.get("systolic_bp")
    diastolic = vitals.get("diastolic_bp")
    if systolic is not None or diastolic is not None:
        _sync_queue.put(
            {
                "patient_id": patient_id,
                "cerner_patient_id": cerner_patient_id,
                "type": "blood_pressure",
                "code": "85354-9",
                "display": "Blood pressure",
                "systolic": systolic,
                "diastolic": diastolic,
                "timestamp": timestamp,
                "retry_count": 0,
            }
        )

    # Start the worker thread if it is not running
    _ensure_worker_running()


def get_queue_size() -> int:
    """Return the current number of pending items in the queue."""
    return _sync_queue.qsize()


def _ensure_worker_running():
    global _worker_thread
    if _worker_thread is None or not _worker_thread.is_alive():
        _worker_thread = threading.Thread(target=_worker_loop, daemon=True)
        _worker_thread.start()


def _worker_loop():
    log_event(
        logger,
        logging.INFO,
        "Cerner leaky-bucket background worker started",
        event_category="system",
        event_type="startup",
        outcome="success",
    )

    while True:
        try:
            # Block until an item is available
            item = _sync_queue.get()
            if item is None:
                # Sentinel to stop thread
                break

            _process_queue_item_with_retry(item)
            _sync_queue.task_done()

            # Leak delay to prevent rate limit congestion
            time.sleep(_leak_rate_seconds)

        except Exception as loop_err:
            log_event(
                logger,
                logging.ERROR,
                "Cerner leaky-bucket worker unhandled loop error",
                event_category="cerner_write",
                event_type="fhir_observation_failure",
                outcome="failure",
                error_detail=str(loop_err),
            )
            time.sleep(5.0)


def _process_queue_item_with_retry(item: Dict[str, Any]):
    patient_id = item["patient_id"]
    cerner_patient_id = item["cerner_patient_id"]

    # 1. Build FHIR Observation resource
    payload = {
        "resourceType": "Observation",
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "vital-signs",
                        "display": "Vital Signs",
                    }
                ],
                "text": "Vital Signs",
            }
        ],
        "subject": {"reference": f"Patient/{cerner_patient_id}"},
        "effectiveDateTime": item["timestamp"],
    }

    if item["type"] == "blood_pressure":
        payload["code"] = {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "85354-9",
                    "display": "Blood pressure panel with all children optional",
                }
            ],
            "text": "Blood Pressure",
        }

        components = []
        if item.get("systolic") is not None:
            components.append(
                {
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "8480-6",
                                "display": "Systolic blood pressure",
                            }
                        ],
                        "text": "Systolic Blood Pressure",
                    },
                    "valueQuantity": {
                        "value": int(item["systolic"]),
                        "unit": "mmHg",
                        "system": "http://unitsofmeasure.org",
                        "code": "mm[Hg]",
                    },
                }
            )

        if item.get("diastolic") is not None:
            components.append(
                {
                    "code": {
                        "coding": [
                            {
                                "system": "http://loinc.org",
                                "code": "8462-4",
                                "display": "Diastolic blood pressure",
                            }
                        ],
                        "text": "Diastolic Blood Pressure",
                    },
                    "valueQuantity": {
                        "value": int(item["diastolic"]),
                        "unit": "mmHg",
                        "system": "http://unitsofmeasure.org",
                        "code": "mm[Hg]",
                    },
                }
            )
        payload["component"] = components

    else:
        # Single observation write
        payload["code"] = {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": item["code"],
                    "display": item["display"],
                }
            ]
        }

        value = int(item["value"]) if item["integer"] else item["value"]
        payload["valueQuantity"] = {
            "value": value,
            "unit": item["unit"],
            "system": "http://unitsofmeasure.org",
            "code": item["unit_code"],
        }

    # 2. Retry loop until successful write
    success = False
    clean_url = f"{CERNER_BASE_URL.rstrip('/')}/Observation"

    while not success:
        try:
            # Fetch fresh system token
            try:
                system_token = await_async(get_system_token())
            except Exception:
                # Mock/Offline fallback: credentials not configured
                log_event(
                    logger,
                    logging.WARNING,
                    "Cerner write using mock fallback — credentials not configured",
                    event_category="cerner_write",
                    event_type="fhir_mock_fallback",
                    outcome="success",
                    loinc_code=item.get("code", "85354-9"),
                    loinc_display=item.get("display", "Blood pressure"),
                    vital_type=item.get("type"),
                    retry_count=item.get("retry_count", 0),
                    patient_id=patient_id,
                )
                success = True
                break

            headers = {
                "Authorization": f"Bearer {system_token}",
                "Content-Type": "application/json",
                "Accept": "application/fhir+json",
            }

            log_event(
                logger,
                logging.INFO,
                f"Sending FHIR {item.get('type', 'observation')} observation to Cerner",
                event_category="cerner_write",
                event_type="fhir_observation_start",
                outcome="pending",
                loinc_code=item.get("code", "85354-9"),
                loinc_display=item.get("display"),
                vital_type=item.get("type"),
                retry_count=item.get("retry_count", 0),
                patient_id=patient_id,
            )

            timer = Timer()
            with httpx.Client(verify=False, timeout=30.0) as client:
                resp = client.post(clean_url, headers=headers, json=payload)
            elapsed = timer.stop()

            if resp.status_code < 300:
                log_event(
                    logger,
                    logging.INFO,
                    f"FHIR {item.get('type', 'observation')} observation written to Cerner successfully",
                    event_category="cerner_write",
                    event_type="fhir_observation_success",
                    outcome="success",
                    http_status=resp.status_code,
                    loinc_code=item.get("code", "85354-9"),
                    loinc_display=item.get("display"),
                    vital_type=item.get("type"),
                    retry_count=item.get("retry_count", 0),
                    duration_ms=elapsed,
                    patient_id=patient_id,
                )
                success = True
            else:
                item["retry_count"] += 1
                if item["retry_count"] >= 3:
                    log_event(
                        logger,
                        logging.ERROR,
                        "Cerner FHIR write max retries reached — re-queuing",
                        event_category="cerner_write",
                        event_type="fhir_max_retries_requeue",
                        outcome="failure",
                        http_status=resp.status_code,
                        loinc_code=item.get("code", "85354-9"),
                        vital_type=item.get("type"),
                        retry_count=item["retry_count"],
                        queue_depth=_sync_queue.qsize(),
                        patient_id=patient_id,
                    )
                    item["retry_count"] = 0
                    _sync_queue.put(item)
                    break

                log_event(
                    logger,
                    logging.WARNING,
                    "FHIR observation write failed — will retry",
                    event_category="cerner_write",
                    event_type="fhir_retry",
                    outcome="failure",
                    http_status=resp.status_code,
                    loinc_code=item.get("code", "85354-9"),
                    vital_type=item.get("type"),
                    retry_count=item["retry_count"],
                    duration_ms=elapsed,
                    patient_id=patient_id,
                )
                time.sleep(5.0)

        except Exception as sync_err:
            item["retry_count"] += 1
            if item["retry_count"] >= 3:
                log_event(
                    logger,
                    logging.ERROR,
                    "Cerner FHIR write exception — max retries reached, re-queuing",
                    event_category="cerner_write",
                    event_type="fhir_max_retries_requeue",
                    outcome="failure",
                    loinc_code=item.get("code", "85354-9"),
                    vital_type=item.get("type"),
                    retry_count=item["retry_count"],
                    queue_depth=_sync_queue.qsize(),
                    error_detail=str(sync_err),
                    patient_id=patient_id,
                )
                item["retry_count"] = 0
                _sync_queue.put(item)
                break

            log_event(
                logger,
                logging.WARNING,
                "Cerner FHIR write exception — will retry",
                event_category="cerner_write",
                event_type="fhir_retry",
                outcome="failure",
                loinc_code=item.get("code", "85354-9"),
                vital_type=item.get("type"),
                retry_count=item["retry_count"],
                error_detail=str(sync_err),
                patient_id=patient_id,
            )
            time.sleep(5.0)


def await_async(coro):
    """Helper to run async coroutines synchronously inside the worker thread."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)

"""
Structured JSON logger with OpenTelemetry trace correlation and minimal PII redaction.

Key additions over the original:
  - trace_id / span_id pulled from the active OTel span so every log line can be
    correlated with a Tempo trace in Grafana.
  - event_category / event_type / outcome fields for Loki label-based panel queries.
  - duration_ms field for latency tracking without a separate trace.
  - log_event() helper — the single import that all service modules use so they
    never need to import logging directly.
  - get_logger() convenience wrapper.

Design principle: this module is purely additive.  Existing code that never calls
log_event() continues to work unchanged; it will still produce the base JSON record.
"""

import logging
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

from .redaction import redact_string, redact_dict, partially_redact

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _get_otel_context() -> tuple[str | None, str | None]:
    """
    Safely read the active OpenTelemetry trace_id and span_id.
    Returns (None, None) if OTel is not initialised or no span is active.
    This never raises — telemetry must never break the application.
    """
    try:
        from opentelemetry import trace
        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.is_valid:
            trace_id = format(ctx.trace_id, "032x")
            span_id = format(ctx.span_id, "016x")
            return trace_id, span_id
    except Exception:
        pass
    return None, None


# ──────────────────────────────────────────────────────────────────────────────
# Formatter
# ──────────────────────────────────────────────────────────────────────────────

class RedactedJsonFormatter(logging.Formatter):
    """
    Formats log records as single-line JSON objects suitable for Loki ingestion.

    Standard fields:
        timestamp, level, name, message, module, funcName, lineNo

    OTel correlation fields (populated when a span is active):
        trace_id, span_id

    Structured event fields (set via extra_attrs on the record):
        event_category, event_type, outcome, duration_ms, http_status,
        queue_depth, retry_count, loinc_code, vital_type, batch_size,
        patient_id_hash, token_type, error_detail, thread_id, ...
    """

    def format(self, record: logging.LogRecord) -> str:
        trace_id, span_id = _get_otel_context()

        log_record: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "level": record.levelname,
            "name": record.name,
            "message": redact_string(record.getMessage()),
            "module": record.module,
            "funcName": record.funcName,
            "lineNo": record.lineno,
        }

        # OTel correlation — attach when available
        if trace_id:
            log_record["trace_id"] = trace_id
        if span_id:
            log_record["span_id"] = span_id

        # Exception details
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)

        # Structured extra fields from log_event()
        if hasattr(record, "extra_attrs") and isinstance(record.extra_attrs, dict):
            # Redact the extra attrs but preserve well-known non-PII keys verbatim
            _safe_keys = {
                "event_category", "event_type", "outcome", "duration_ms",
                "http_status", "queue_depth", "retry_count", "loinc_code",
                "vital_type", "batch_size", "token_type", "thread_id",
                "error_detail", "mqtt_broker", "mqtt_topic", "patient_id_hash",
                "loinc_display",
            }
            attrs = record.extra_attrs
            merged: dict[str, Any] = {}
            for k, v in attrs.items():
                if k in _safe_keys:
                    merged[k] = v
                elif isinstance(v, dict):
                    merged[k] = redact_dict(v)
                elif isinstance(v, str):
                    merged[k] = redact_string(v)
                else:
                    merged[k] = v
            log_record.update(merged)

        return json.dumps(log_record, default=str)


# ──────────────────────────────────────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────────────────────────────────────

def setup_logger(log_file: str = "logs.json") -> logging.Logger:
    """
    Configure the root logger with the JSON formatter.
    Idempotent — safe to call multiple times.
    """
    if not os.path.isabs(log_file):
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        log_file = os.path.join(project_root, log_file)
    log_file = os.path.abspath(log_file)
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Remove existing handlers to avoid duplicate output on hot-reload
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    formatter = RedactedJsonFormatter()

    # File handler (picked up by the OTel file exporter as well)
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setFormatter(formatter)

    # Console handler for local dev — same JSON format so it's consistent
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    # Silence noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    return logger


# ──────────────────────────────────────────────────────────────────────────────
# Public helpers
# ──────────────────────────────────────────────────────────────────────────────

def get_logger(name: str) -> logging.Logger:
    """Return a named child logger.  Usage: logger = get_logger(__name__)"""
    return logging.getLogger(name)


def log_event(
    logger: logging.Logger,
    level: int,
    message: str,
    *,
    event_category: str,
    event_type: str,
    outcome: str = "success",
    duration_ms: Optional[float] = None,
    http_status: Optional[int] = None,
    queue_depth: Optional[int] = None,
    retry_count: Optional[int] = None,
    loinc_code: Optional[str] = None,
    loinc_display: Optional[str] = None,
    vital_type: Optional[str] = None,
    batch_size: Optional[int] = None,
    token_type: Optional[str] = None,
    patient_id: Optional[str] = None,
    mqtt_broker: Optional[str] = None,
    mqtt_topic: Optional[str] = None,
    error_detail: Optional[str] = None,
    thread_id: Optional[int] = None,
    **extra: Any,
) -> None:
    """
    Emit a structured log event.  All keyword arguments become top-level JSON
    fields in the log record — no nesting — so Loki can index them as labels
    or filter on them with LogQL.

    patient_id is always minimally redacted to show only the last 4 characters.
    It is stored as patient_id_hash, never as patient_id.

    Example:
        log_event(logger, logging.INFO, "FHIR write succeeded",
                  event_category="cerner_write",
                  event_type="fhir_observation_success",
                  outcome="success",
                  http_status=201,
                  loinc_code="69000-8",
                  duration_ms=143.2,
                  patient_id=patient_id)
    """
    attrs: dict[str, Any] = {
        "event_category": event_category,
        "event_type": event_type,
        "outcome": outcome,
    }
    if duration_ms is not None:
        attrs["duration_ms"] = round(duration_ms, 2)
    if http_status is not None:
        attrs["http_status"] = http_status
    if queue_depth is not None:
        attrs["queue_depth"] = queue_depth
    if retry_count is not None:
        attrs["retry_count"] = retry_count
    if loinc_code is not None:
        attrs["loinc_code"] = loinc_code
    if loinc_display is not None:
        attrs["loinc_display"] = loinc_display
    if vital_type is not None:
        attrs["vital_type"] = vital_type
    if batch_size is not None:
        attrs["batch_size"] = batch_size
    if token_type is not None:
        attrs["token_type"] = token_type
    if patient_id is not None:
        attrs["patient_id_hash"] = partially_redact(str(patient_id))
    if mqtt_broker is not None:
        attrs["mqtt_broker"] = mqtt_broker
    if mqtt_topic is not None:
        attrs["mqtt_topic"] = mqtt_topic
    if error_detail is not None:
        # Redact any PII that might have leaked into error messages
        attrs["error_detail"] = redact_string(str(error_detail))
    if thread_id is not None:
        attrs["thread_id"] = thread_id
    # Merge any additional safe kwargs
    for k, v in extra.items():
        attrs[k] = v

    # Attach as extra_attrs so the formatter can pick them up
    logger.log(level, message, extra={"extra_attrs": attrs})


# ──────────────────────────────────────────────────────────────────────────────
# Timing utility
# ──────────────────────────────────────────────────────────────────────────────

class Timer:
    """
    Context-manager / manual timer that returns elapsed milliseconds.

    Usage (context manager):
        with Timer() as t:
            do_work()
        log_event(..., duration_ms=t.elapsed_ms)

    Usage (manual):
        t = Timer()
        do_work()
        elapsed = t.stop()
    """
    def __init__(self):
        self._start = time.perf_counter()
        self.elapsed_ms: float = 0.0

    def stop(self) -> float:
        self.elapsed_ms = (time.perf_counter() - self._start) * 1000.0
        return self.elapsed_ms

    def __enter__(self):
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_):
        self.stop()

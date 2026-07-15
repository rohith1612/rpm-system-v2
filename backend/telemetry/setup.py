import logging
import os

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.http._log_exporter import \
    OTLPLogExporter  # type: ignore
from opentelemetry.exporter.otlp.proto.http.metric_exporter import \
    OTLPMetricExporter  # type: ignore
from opentelemetry.exporter.otlp.proto.http.trace_exporter import \
    OTLPSpanExporter  # type: ignore
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .exporters import JsonFileMetricExporter, JsonFileSpanExporter
from .logger import setup_logger


def setup_telemetry(app: FastAPI):
    # ── 1. Structured JSON logger ──────────────────────────────────────────────
    logger = setup_logger()
    logger.info(
        "Telemetry setup initiated",
        extra={
            "extra_attrs": {
                "event_category": "system",
                "event_type": "startup",
                "outcome": "pending",
            }
        },
    )

    # ── 2. OTel Resource ───────────────────────────────────────────────────────
    service_name = os.getenv("OTEL_SERVICE_NAME", "rpm-backend")
    resource = Resource.create(
        {
            "service.name": service_name,
            "service.namespace": "rpm",
            "service.instance.id": "rpm-backend-main",  # Static ID prevents duplicate instances in Grafana on hot-reloads
            "deployment.environment": os.getenv("DEPLOYMENT_ENV", "development"),
        }
    )

    # ── 3. Traces ──────────────────────────────────────────────────────────────
    tracer_provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(tracer_provider)

    if os.getenv("OTEL_EXPORT_TRACES_TO_OTLP", "false").lower() == "true":
        trace_endpoint = (
            os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
            + "/v1/traces"
        )
        span_exporter = OTLPSpanExporter(endpoint=trace_endpoint)
        tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))

    if os.getenv("OTEL_EXPORT_TRACES_TO_FILE", "false").lower() == "true":
        file_span_exporter = JsonFileSpanExporter()
        tracer_provider.add_span_processor(BatchSpanProcessor(file_span_exporter))

    # ── 4. Metrics ─────────────────────────────────────────────────────────────
    metric_readers = []

    if os.getenv("OTEL_EXPORT_METRICS_TO_OTLP", "false").lower() == "true":
        metric_endpoint = (
            os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
            + "/v1/metrics"
        )
        metric_exporter = OTLPMetricExporter(endpoint=metric_endpoint)
        # Export every 30 s — matches psutil refresh interval
        metric_readers.append(
            PeriodicExportingMetricReader(
                metric_exporter, export_interval_millis=30_000
            )
        )

    if os.getenv("OTEL_EXPORT_METRICS_TO_FILE", "false").lower() == "true":
        file_metric_exporter = JsonFileMetricExporter()
        metric_readers.append(PeriodicExportingMetricReader(file_metric_exporter))

    if metric_readers:
        meter_provider = MeterProvider(resource=resource, metric_readers=metric_readers)
        metrics.set_meter_provider(meter_provider)

        # Start CPU / memory process metrics collector
        try:
            from .metrics import ProcessMetricsCollector

            ProcessMetricsCollector().start()
        except Exception as metrics_err:
            logger.warning("Could not start ProcessMetricsCollector: %s", metrics_err)

    # ── 5. Logs (OTLP export) ──────────────────────────────────────────────────
    if os.getenv("OTEL_EXPORT_LOGS_TO_OTLP", "false").lower() == "true":
        logger_provider = LoggerProvider(resource=resource)
        set_logger_provider(logger_provider)
        log_endpoint = (
            os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
            + "/v1/logs"
        )
        log_exporter = OTLPLogExporter(endpoint=log_endpoint)
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))

        # Bridge Python logging → OTel LoggerProvider so all log_event() calls
        # are forwarded to the OTel Collector automatically.
        handler = LoggingHandler(level=logging.NOTSET, logger_provider=logger_provider)
        logging.getLogger().addHandler(handler)

    # ── 6. Auto-instrumentation ────────────────────────────────────────────────
    # FastAPI: auto-creates HTTP spans for every request (exclude WebSocket endpoints and non-GET/POST request methods)
    def server_request_hook(span, scope):
        method = scope.get("method", "").upper()
        if method not in ("GET", "POST"):
            span.is_recording = (
                lambda: False
            )  # Mark span as non-recording so it is dropped

    FastAPIInstrumentor.instrument_app(
        app, excluded_urls="ws,.*ws.*", server_request_hook=server_request_hook
    )

    # Outgoing HTTP calls via `requests` library
    RequestsInstrumentor().instrument()

    # Bridge stdlib logging → OTel (set_logging_format=False preserves our JSON formatter)
    LoggingInstrumentor().instrument(set_logging_format=False)

    logger.info(
        "Telemetry setup complete",
        extra={
            "extra_attrs": {
                "event_category": "system",
                "event_type": "startup",
                "outcome": "success",
                "service_name": service_name,
                "otlp_traces": os.getenv("OTEL_EXPORT_TRACES_TO_OTLP", "false"),
                "otlp_metrics": os.getenv("OTEL_EXPORT_METRICS_TO_OTLP", "false"),
                "otlp_logs": os.getenv("OTEL_EXPORT_LOGS_TO_OTLP", "false"),
            }
        },
    )

import os
import logging
from fastapi import FastAPI
from opentelemetry import trace, metrics
from opentelemetry._logs import set_logger_provider
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter  # type: ignore
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter  # type: ignore
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter  # type: ignore
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor

from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from .logger import setup_logger
from .exporters import JsonFileSpanExporter, JsonFileMetricExporter

def setup_telemetry(app: FastAPI):
    # Initialize our custom JSON file logger with PII redaction
    logger = setup_logger()
    logger.info("Telemetry setup initiated.")
    
    # Configure Resource with service.name
    service_name = os.getenv("OTEL_SERVICE_NAME", "rpm-backend")
    resource = Resource.create({"service.name": service_name})

    # 1. Traces
    tracer_provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(tracer_provider)
    
    if os.getenv("OTEL_EXPORT_TRACES_TO_OTLP", "false").lower() == "true":
        trace_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318") + "/v1/traces"
        span_exporter = OTLPSpanExporter(endpoint=trace_endpoint)
        tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))
        
    if os.getenv("OTEL_EXPORT_TRACES_TO_FILE", "false").lower() == "true":
        file_span_exporter = JsonFileSpanExporter()
        tracer_provider.add_span_processor(BatchSpanProcessor(file_span_exporter))

    # 2. Metrics
    metric_readers = []
    if os.getenv("OTEL_EXPORT_METRICS_TO_OTLP", "false").lower() == "true":
        metric_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318") + "/v1/metrics"
        metric_exporter = OTLPMetricExporter(endpoint=metric_endpoint)
        metric_readers.append(PeriodicExportingMetricReader(metric_exporter))
        
    if os.getenv("OTEL_EXPORT_METRICS_TO_FILE", "false").lower() == "true":
        file_metric_exporter = JsonFileMetricExporter()
        metric_readers.append(PeriodicExportingMetricReader(file_metric_exporter))
        
    if metric_readers:
        meter_provider = MeterProvider(resource=resource, metric_readers=metric_readers)
        metrics.set_meter_provider(meter_provider)

    # 3. Logs (OpenTelemetry Native - optional if using our custom logger)
    if os.getenv("OTEL_EXPORT_LOGS_TO_OTLP", "false").lower() == "true":
        logger_provider = LoggerProvider(resource=resource)
        set_logger_provider(logger_provider)
        log_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318") + "/v1/logs"
        log_exporter = OTLPLogExporter(endpoint=log_endpoint)
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))
        
        handler = LoggingHandler(level=logging.NOTSET, logger_provider=logger_provider)
        logging.getLogger().addHandler(handler)

    # Instrument FastAPI application to intercept auth and other requests
    FastAPIInstrumentor.instrument_app(app)
    
    # Instrument outgoing HTTP calls (via requests module)
    RequestsInstrumentor().instrument()
    
    # Instrument standard library logging
    # Note: set_logging_format=False so it doesn't overwrite our custom JSON formatter
    LoggingInstrumentor().instrument(set_logging_format=False)
    
    logger.info("Telemetry setup complete.")

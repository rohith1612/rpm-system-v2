import json
import logging
from typing import Sequence
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from opentelemetry.sdk.metrics.export import MetricExporter, MetricExportResult, MetricsData
from .redaction import redact_dict

class JsonFileSpanExporter(SpanExporter):
    """Exports spans to a local JSON file after redacting PII."""
    def __init__(self, filepath="d:/rpm-system-v2/traces.json"):
        self.filepath = filepath

    def export(self, spans: Sequence) -> SpanExportResult:
        try:
            with open(self.filepath, "a", encoding="utf-8") as f:
                for span in spans:
                    span_dict = {
                        "name": span.name,
                        "context": {
                            "trace_id": hex(span.context.trace_id) if span.context else None,
                            "span_id": hex(span.context.span_id) if span.context else None,
                        },
                        "start_time": span.start_time,
                        "end_time": span.end_time,
                        # Redact attributes specifically
                        "attributes": redact_dict(dict(span.attributes) if span.attributes else {}),
                        "status": span.status.status_code.name if span.status else "UNSET"
                    }
                    f.write(json.dumps(span_dict) + "\n")
            return SpanExportResult.SUCCESS
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to write trace spans to file: {e}")
            return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        pass


class JsonFileMetricExporter(MetricExporter):
    """Exports metrics to a local JSON file after redacting PII."""
    def __init__(self, filepath="d:/rpm-system-v2/metrics.json"):
        self.filepath = filepath
        self._preferred_temporality = {}
        self._preferred_aggregation = {}

    def export(self, metrics_data: MetricsData, timeout_millis: float = 10_000, **kwargs) -> MetricExportResult:
        try:
            with open(self.filepath, "a", encoding="utf-8") as f:
                for resource_metric in metrics_data.resource_metrics:
                    for scope_metric in resource_metric.scope_metrics:
                        for metric in scope_metric.metrics:
                            for data_point in metric.data.data_points:
                                metric_dict = {
                                    "name": metric.name,
                                    "description": metric.description,
                                    "unit": metric.unit,
                                    # Redact metric attributes as well
                                    "attributes": redact_dict(dict(data_point.attributes) if data_point.attributes else {}),
                                    "time_unix_nano": data_point.time_unix_nano,
                                    "value": getattr(data_point, 'value', None) or getattr(data_point, 'count', None)
                                }
                                f.write(json.dumps(metric_dict) + "\n")
            return MetricExportResult.SUCCESS
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to write metrics to file: {e}")
            return MetricExportResult.FAILURE

    def shutdown(self, timeout_millis: float = 30_000, **kwargs) -> None:
        pass
        
    def force_flush(self, timeout_millis: float = 10_000) -> bool:
        return True

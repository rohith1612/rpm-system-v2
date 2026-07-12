"""
Process-level CPU and memory metrics for the RPM backend.

Registers two OpenTelemetry observable gauges:
    rpm.process.cpu_percent   — CPU usage of this process (%)
    rpm.process.memory_rss_mb — Resident Set Size in megabytes

The gauges are backed by psutil readings that are refreshed every 15 seconds
by a background daemon thread.  The OTel SDK calls our callbacks on its own
PeriodicExportingMetricReader schedule; the thread just keeps the cached values
fresh so the callbacks never block.

Usage (called once from telemetry/setup.py):
    from backend.telemetry.metrics import ProcessMetricsCollector
    ProcessMetricsCollector().start()
"""

import logging
import threading
import time

logger = logging.getLogger(__name__)

try:
    import psutil
    _PSUTIL_AVAILABLE = True
except ImportError:
    _PSUTIL_AVAILABLE = False
    logger.warning(
        "psutil not installed — CPU/memory metrics will be unavailable. "
        "Add 'psutil>=5.9' to requirements.txt."
    )


class ProcessMetricsCollector:
    """
    Collects CPU % and memory RSS from the current process and registers
    them as OTel observable gauges.
    """

    REFRESH_INTERVAL_SECONDS = 15

    def __init__(self):
        self._cpu_percent: float = 0.0
        self._memory_rss_mb: float = 0.0
        self._process = psutil.Process() if _PSUTIL_AVAILABLE else None
        self._lock = threading.Lock()
        self._started = False

    # ── Background sampler ────────────────────────────────────────────────────

    def _sample_loop(self):
        """Daemon thread that refreshes psutil readings every 15 s."""
        # Prime the CPU reading so the first delta is accurate
        if self._process:
            try:
                self._process.cpu_percent(interval=None)
            except Exception:
                pass

        while True:
            try:
                time.sleep(self.REFRESH_INTERVAL_SECONDS)
                if self._process:
                    cpu = self._process.cpu_percent(interval=None)
                    rss = self._process.memory_info().rss / (1024 * 1024)
                    with self._lock:
                        self._cpu_percent = round(cpu, 2)
                        self._memory_rss_mb = round(rss, 2)
            except Exception as exc:
                logger.debug("ProcessMetricsCollector sample error: %s", exc)

    # ── OTel callbacks (called by the SDK on its reader schedule) ─────────────

    def _observe_cpu(self, options):
        with self._lock:
            yield options.create_observable_gauge(
                value=self._cpu_percent,
                attributes={"process.type": "backend"},
            )

    def _observe_memory(self, options):
        with self._lock:
            yield options.create_observable_gauge(
                value=self._memory_rss_mb,
                attributes={"process.type": "backend"},
            )

    # ── Public ────────────────────────────────────────────────────────────────

    def start(self):
        """Register OTel gauges and start the background sampler thread."""
        if self._started:
            return
        self._started = True

        if not _PSUTIL_AVAILABLE:
            logger.warning(
                "ProcessMetricsCollector.start() skipped — psutil not available."
            )
            return

        try:
            from opentelemetry import metrics as otel_metrics

            meter = otel_metrics.get_meter("rpm.process.metrics", version="1.0.0")

            meter.create_observable_gauge(
                name="rpm.process.cpu_percent",
                callbacks=[self._observe_cpu],
                description="CPU usage of the RPM backend process (%)",
                unit="%",
            )

            meter.create_observable_gauge(
                name="rpm.process.memory_rss_mb",
                callbacks=[self._observe_memory],
                description="Resident Set Size of the RPM backend process (MB)",
                unit="MB",
            )

            # Start background sampler
            thread = threading.Thread(
                target=self._sample_loop,
                daemon=True,
                name="ProcessMetricsSampler",
            )
            thread.start()

            logger.info(
                "ProcessMetricsCollector started",
                extra={
                    "extra_attrs": {
                        "event_category": "system",
                        "event_type": "metrics_collector_started",
                        "outcome": "success",
                    }
                },
            )
        except Exception as exc:
            logger.warning(
                "ProcessMetricsCollector could not register OTel gauges: %s", exc
            )

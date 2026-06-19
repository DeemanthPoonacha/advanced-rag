"""Lightweight in-process metrics collector.

Tracks counters, histograms, and gauges per lifecycle stage with an
optional Prometheus-compatible snapshot export.
"""

from __future__ import annotations

import time
from collections import defaultdict
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

import structlog

from ..config.schema import MetricsConfig
from ..core.types import LifecycleStage

logger = structlog.get_logger(__name__)


@dataclass
class HistogramSummary:
    """Aggregated histogram statistics."""

    count: int
    min: float
    max: float
    avg: float
    p50: float
    p95: float
    p99: float


class MetricsCollector:
    """In-process metrics collector with counter, gauge, and histogram support.

    All methods are no-ops when ``config.enabled`` is ``False``, allowing
    callers to instrument unconditionally without runtime cost.

    Usage::

        metrics = MetricsCollector(config.observability.metrics)
        metrics.increment("documents_parsed", labels={"parser": "unstructured"})

        async with metrics.measure(LifecycleStage.EMBED, "batch"):
            embeddings = await model.embed(texts)
    """

    def __init__(self, config: MetricsConfig) -> None:
        self._config = config
        self._enabled = config.enabled
        self._counters: dict[str, float] = defaultdict(float)
        self._histograms: dict[str, list[float]] = defaultdict(list)
        self._gauges: dict[str, float] = {}

    # ── Counters ─────────────────────────────────────────────────────

    def increment(
        self,
        name: str,
        value: float = 1.0,
        labels: dict[str, str] | None = None,
    ) -> None:
        """Increment a monotonic counter.

        Args:
            name: Metric name.
            value: Amount to increment by.
            labels: Optional key-value labels.
        """
        if not self._enabled:
            return
        key = self._make_key(name, labels)
        self._counters[key] += value

    # ── Histograms ───────────────────────────────────────────────────

    def observe(
        self,
        name: str,
        value: float,
        labels: dict[str, str] | None = None,
    ) -> None:
        """Record a histogram observation (e.g. latency in ms).

        Args:
            name: Metric name.
            value: Observed value.
            labels: Optional key-value labels.
        """
        if not self._enabled:
            return
        key = self._make_key(name, labels)
        self._histograms[key].append(value)

    # ── Gauges ────────────────────────────────────────────────────────

    def set_gauge(
        self,
        name: str,
        value: float,
        labels: dict[str, str] | None = None,
    ) -> None:
        """Set a gauge to an absolute value.

        Args:
            name: Metric name.
            value: Current value.
            labels: Optional key-value labels.
        """
        if not self._enabled:
            return
        key = self._make_key(name, labels)
        self._gauges[key] = value

    # ── Convenience ──────────────────────────────────────────────────

    @asynccontextmanager
    async def measure(
        self,
        stage: LifecycleStage,
        operation: str,
    ) -> AsyncIterator[None]:
        """Context manager that measures latency and counts for an operation.

        Records:
          - ``rag_{stage}_{operation}_total`` counter (incremented)
          - ``rag_{stage}_{operation}_duration_ms`` histogram (latency)
          - ``rag_{stage}_{operation}_errors_total`` counter (on exception)

        Args:
            stage: Pipeline lifecycle stage.
            operation: Human-readable operation name.
        """
        labels = {"stage": stage.value}
        metric_prefix = f"rag_{stage.value}_{operation}"
        self.increment(f"{metric_prefix}_total", labels=labels)

        start = time.perf_counter()
        try:
            yield
        except Exception:
            self.increment(f"{metric_prefix}_errors_total", labels=labels)
            raise
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            self.observe(f"{metric_prefix}_duration_ms", elapsed_ms, labels=labels)

    # ── Snapshots ────────────────────────────────────────────────────

    def snapshot(self) -> dict[str, Any]:
        """Return a JSON-serializable snapshot of all collected metrics.

        Returns:
            Dict with ``counters``, ``gauges``, and ``histograms`` keys.
        """
        return {
            "counters": dict(self._counters),
            "gauges": dict(self._gauges),
            "histograms": {
                k: self._summarize_histogram(v)
                for k, v in self._histograms.items()
            },
        }

    def reset(self) -> None:
        """Clear all metrics.  Useful in testing."""
        self._counters.clear()
        self._histograms.clear()
        self._gauges.clear()

    # ── Internal ─────────────────────────────────────────────────────

    @staticmethod
    def _make_key(name: str, labels: dict[str, str] | None) -> str:
        """Build a unique key from metric name + sorted labels."""
        if not labels:
            return name
        label_str = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"

    @staticmethod
    def _summarize_histogram(values: list[float]) -> dict[str, float]:
        """Compute summary statistics for a histogram."""
        if not values:
            return {"count": 0, "min": 0, "max": 0, "avg": 0, "p50": 0, "p95": 0, "p99": 0}

        sorted_vals = sorted(values)
        n = len(sorted_vals)

        def _percentile(p: float) -> float:
            idx = int(p / 100 * (n - 1))
            return sorted_vals[min(idx, n - 1)]

        return {
            "count": n,
            "min": sorted_vals[0],
            "max": sorted_vals[-1],
            "avg": sum(sorted_vals) / n,
            "p50": _percentile(50),
            "p95": _percentile(95),
            "p99": _percentile(99),
        }

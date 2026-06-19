"""OpenTelemetry / LangSmith tracing integration.

Provides:

- ``setup_tracing``     — initialise the global tracer at startup.
- ``@trace_operation``  — decorator for automatic span creation.
- ``trace_span``        — async context manager for manual spans.
"""

from __future__ import annotations

import functools
import os
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable, TypeVar

import structlog

from ..config.schema import TracingConfig
from ..core.types import LifecycleStage

logger = structlog.get_logger(__name__)

F = TypeVar("F", bound=Callable[..., Any])

# Module-level state set by ``setup_tracing``.
_tracer: Any = None
_tracing_enabled: bool = False


# ─── Setup ───────────────────────────────────────────────────────────────


def setup_tracing(config: TracingConfig) -> None:
    """Initialise the global tracer based on configuration.

    Supported providers:
      - **opentelemetry** — exports spans via OTLP/gRPC.
      - **langsmith** — sets environment variables for LangSmith SDK.

    Missing optional dependencies are handled gracefully by disabling
    tracing and logging a warning.

    Args:
        config: The ``tracing`` section of the pipeline configuration.
    """
    global _tracer, _tracing_enabled

    if not config.enabled:
        _tracing_enabled = False
        logger.info("tracing_disabled", reason="configuration")
        return

    _tracing_enabled = True

    if config.provider == "opentelemetry":
        _setup_opentelemetry(config)
    elif config.provider == "langsmith":
        _setup_langsmith(config)


def _setup_opentelemetry(config: TracingConfig) -> None:
    """Wire up OpenTelemetry with OTLP/gRPC exporter."""
    global _tracer, _tracing_enabled
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.trace.sampling import TraceIdRatioBased

        resource = Resource.create({"service.name": config.service_name})
        sampler = TraceIdRatioBased(config.sample_rate)
        provider = TracerProvider(resource=resource, sampler=sampler)

        exporter = OTLPSpanExporter(endpoint=config.endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))

        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer(config.service_name)

        logger.info(
            "opentelemetry_tracing_initialized",
            endpoint=config.endpoint,
            service=config.service_name,
            sample_rate=config.sample_rate,
        )
    except ImportError:
        logger.warning(
            "opentelemetry_packages_missing",
            hint="pip install 'advanced-rag[telemetry]'",
        )
        _tracing_enabled = False


def _setup_langsmith(config: TracingConfig) -> None:
    """Set environment variables for LangSmith tracing."""
    global _tracing_enabled
    try:
        import langsmith  # noqa: F401

        if config.api_key:
            os.environ.setdefault("LANGCHAIN_API_KEY", config.api_key)
        os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
        os.environ.setdefault("LANGCHAIN_PROJECT", config.service_name)

        logger.info(
            "langsmith_tracing_initialized",
            project=config.service_name,
        )
    except ImportError:
        logger.warning(
            "langsmith_package_missing",
            hint="pip install langsmith",
        )
        _tracing_enabled = False


# ─── Decorator ───────────────────────────────────────────────────────────


def trace_operation(
    stage: LifecycleStage,
    operation: str | None = None,
) -> Callable[[F], F]:
    """Decorator that wraps an async function in a tracing span.

    If tracing is disabled or the tracer is unavailable, the function
    executes normally with lightweight debug logging.

    Usage::

        @trace_operation(LifecycleStage.EMBED, "batch_embed")
        async def embed_batch(self, texts: list[str]) -> ...:
            ...

    Args:
        stage: The pipeline lifecycle stage for tagging.
        operation: Human-readable operation name (defaults to function name).

    Returns:
        A decorator that adds tracing to async functions.
    """
    import inspect

    def decorator(func: F) -> F:
        if inspect.isasyncgenfunction(func):
            @functools.wraps(func)
            async def async_generator_wrapper(*args: Any, **kwargs: Any) -> AsyncIterator[Any]:
                op_name = operation or func.__name__
                span_name = f"rag.{stage.value}.{op_name}"

                if _tracing_enabled and _tracer is not None:
                    with _tracer.start_as_current_span(span_name) as span:
                        span.set_attribute("rag.stage", stage.value)
                        span.set_attribute("rag.operation", op_name)
                        start = time.perf_counter()
                        try:
                            async for item in func(*args, **kwargs):
                                yield item
                            elapsed = (time.perf_counter() - start) * 1000
                            span.set_attribute("rag.duration_ms", elapsed)
                        except Exception as exc:
                            span.set_attribute("rag.error", str(exc))
                            span.record_exception(exc)
                            raise
                else:
                    start = time.perf_counter()
                    async for item in func(*args, **kwargs):
                        yield item
                    elapsed = (time.perf_counter() - start) * 1000
                    logger.debug(
                        "operation_completed",
                        stage=stage.value,
                        operation=op_name,
                        duration_ms=round(elapsed, 2),
                    )
            return async_generator_wrapper  # type: ignore[return-value]

        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            op_name = operation or func.__name__
            span_name = f"rag.{stage.value}.{op_name}"

            if _tracing_enabled and _tracer is not None:
                with _tracer.start_as_current_span(span_name) as span:
                    span.set_attribute("rag.stage", stage.value)
                    span.set_attribute("rag.operation", op_name)
                    start = time.perf_counter()
                    try:
                        result = await func(*args, **kwargs)
                        elapsed = (time.perf_counter() - start) * 1000
                        span.set_attribute("rag.duration_ms", elapsed)
                        return result
                    except Exception as exc:
                        span.set_attribute("rag.error", str(exc))
                        span.record_exception(exc)
                        raise
            else:
                start = time.perf_counter()
                result = await func(*args, **kwargs)
                elapsed = (time.perf_counter() - start) * 1000
                logger.debug(
                    "operation_completed",
                    stage=stage.value,
                    operation=op_name,
                    duration_ms=round(elapsed, 2),
                )
                return result

        return wrapper  # type: ignore[return-value]

    return decorator


# ─── Context Manager ─────────────────────────────────────────────────────


@asynccontextmanager
async def trace_span(
    stage: LifecycleStage,
    operation: str,
    attributes: dict[str, Any] | None = None,
) -> AsyncIterator[dict[str, Any]]:
    """Async context manager for manual span creation.

    Yields a mutable dict where callers can set attributes that will be
    recorded on the span at exit.

    Usage::

        async with trace_span(LifecycleStage.RETRIEVE, "hybrid_search") as attrs:
            results = await store.hybrid_search(...)
            attrs["result_count"] = len(results)

    Args:
        stage: Pipeline lifecycle stage.
        operation: Human-readable operation name.
        attributes: Optional initial span attributes.

    Yields:
        A mutable dict for adding span attributes during execution.
    """
    span_name = f"rag.{stage.value}.{operation}"
    extra_attrs: dict[str, Any] = {}

    if _tracing_enabled and _tracer is not None:
        with _tracer.start_as_current_span(span_name) as span:
            span.set_attribute("rag.stage", stage.value)
            span.set_attribute("rag.operation", operation)
            if attributes:
                for k, v in attributes.items():
                    span.set_attribute(k, v)
            start = time.perf_counter()
            try:
                yield extra_attrs
                for k, v in extra_attrs.items():
                    span.set_attribute(k, v)
                span.set_attribute(
                    "rag.duration_ms", (time.perf_counter() - start) * 1000
                )
            except Exception as exc:
                span.record_exception(exc)
                raise
    else:
        start = time.perf_counter()
        yield extra_attrs
        elapsed = (time.perf_counter() - start) * 1000
        logger.debug(
            "span_completed",
            stage=stage.value,
            operation=operation,
            duration_ms=round(elapsed, 2),
            **extra_attrs,
        )

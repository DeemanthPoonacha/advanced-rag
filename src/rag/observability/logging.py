"""Structured JSON logging using structlog.

Provides ``setup_logging`` to wire structlog with stdlib logging so every
library in the process emits consistent, machine-parseable JSON output.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

from ..config.schema import LoggingConfig


def setup_logging(config: LoggingConfig) -> structlog.stdlib.BoundLogger:
    """Configure structured logging for the entire application.

    This function:

    1. Selects a renderer (JSON for production, coloured console for dev).
    2. Installs a single ``StreamHandler`` or ``FileHandler``.
    3. Sets the root logger level.
    4. Returns a bound structlog logger ready for use.

    Args:
        config: The ``logging`` section of the pipeline configuration.

    Returns:
        A bound structlog logger instance.
    """
    log_level = getattr(logging, config.level, logging.INFO)

    # Shared processors run inside structlog before the final renderer.
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if config.format == "json":
        renderer: Any = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler: logging.Handler
    if config.output == "file" and config.file_path:
        handler = logging.FileHandler(config.file_path, encoding="utf-8")
    else:
        handler = logging.StreamHandler(sys.stdout)

    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    return structlog.get_logger("rag")

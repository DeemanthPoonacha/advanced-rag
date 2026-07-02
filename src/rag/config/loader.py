"""Configuration loader with environment-variable interpolation.

Loads ``config.yaml``, resolves ``${VAR}`` and ``${VAR:-default}`` references,
and validates the result against :class:`PipelineConfig`.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

load_dotenv()

from .schema import PipelineConfig

_ENV_VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")


def _resolve_env_vars(value: Any) -> Any:
    """Recursively resolve ``${VAR}`` and ``${VAR:-default}`` in config values.

    Supports three forms:
      - ``${VAR}``           — replaced with the env var; left as-is if unset.
      - ``${VAR:-default}``  — replaced with the env var or the default.

    Works on strings, dicts, and lists (recursive).
    """
    if isinstance(value, str):

        def _replacer(match: re.Match[str]) -> str:
            expr = match.group(1)
            if ":-" in expr:
                var_name, default = expr.split(":-", 1)
                return os.environ.get(var_name.strip(), default.strip())
            return os.environ.get(expr.strip(), match.group(0))

        return _ENV_VAR_PATTERN.sub(_replacer, value)

    if isinstance(value, dict):
        return {k: _resolve_env_vars(v) for k, v in value.items()}

    if isinstance(value, list):
        return [_resolve_env_vars(item) for item in value]

    return value


def load_config(path: str | Path = "config.yaml") -> PipelineConfig:
    """Load and validate pipeline configuration from a YAML file.

    Environment variables in the form ``${VAR}`` or ``${VAR:-default}``
    are interpolated *before* Pydantic validation.

    Args:
        path: Filesystem path to the YAML config file.

    Returns:
        A fully validated ``PipelineConfig`` instance.

    Raises:
        FileNotFoundError: If the config file does not exist.
        yaml.YAMLError: If the file contains invalid YAML.
        pydantic.ValidationError: If the config fails schema validation.
    """
    config_path = Path(path)
    if not config_path.exists():
        raise FileNotFoundError(
            f"Configuration file not found: {config_path.resolve()}"
        )

    raw_text = config_path.read_text(encoding="utf-8")
    raw_data: dict[str, Any] = yaml.safe_load(raw_text) or {}
    resolved_data = _resolve_env_vars(raw_data)

    return PipelineConfig.model_validate(resolved_data)


def load_config_from_dict(data: dict[str, Any]) -> PipelineConfig:
    """Validate a raw dictionary against the pipeline config schema.

    Useful for tests and programmatic configuration.

    Args:
        data: Raw config dictionary (same shape as YAML).

    Returns:
        A validated ``PipelineConfig`` instance.
    """
    resolved = _resolve_env_vars(data)
    return PipelineConfig.model_validate(resolved)

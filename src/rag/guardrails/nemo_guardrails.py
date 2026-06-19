"""NVIDIA NeMo Guardrails integration.

Secures inputs and outputs by executing configured rails using the
nemoguardrails package.
"""

from __future__ import annotations

import os
from typing import Any

import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..core.interfaces import BaseGuardrail
from ..core.registry import ComponentRegistry
from ..core.types import GuardrailResult, LifecycleStage
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("guardrail", "nemo")
class NeMoGuardrails(BaseGuardrail):
    """NeMo Guardrails security manager.

    Wraps the local RailsApp execution to block queries/responses that
    violate defined policy paths.
    """

    def __init__(
        self,
        config_path: str | None = None,
        config_dict: dict[str, Any] | None = None,
        fallback_messages: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        """Initialize NeMo Guardrails wrapper.

        Args:
            config_path: Path to the NeMo config directory containing YAML/Colang files.
            config_dict: Programmatic configuration dict to pass to RailsConfig.from_content.
            fallback_messages: Response messages that indicate safety blocks.
            **kwargs: Extra parameters.
        """
        self._config_path = config_path
        self._config_dict = config_dict
        self._fallback_messages = fallback_messages or [
            "I am not able to answer that question.",
            "I cannot answer that question.",
            "I cannot help with that.",
        ]
        self._rails_app: Any = None

    def _get_rails_app(self) -> Any:
        """Lazily initialize and load the NeMo RailsApp."""
        if self._rails_app is None:
            try:
                from nemoguardrails import RailsApp, RailsConfig
            except ImportError as exc:
                logger.error(
                    "nemo_guardrails_import_error",
                    msg="nemoguardrails package is not installed. Run `pip install nemoguardrails` to use this provider.",
                )
                raise exc

            # Set environment variables if needed
            logger.info("nemo_guardrails_init_start", config_path=self._config_path)

            if self._config_path:
                if not os.path.exists(self._config_path):
                    raise FileNotFoundError(f"NeMo config path not found: {self._config_path}")
                config = RailsConfig.from_path(self._config_path)
            elif self._config_dict:
                config = RailsConfig.from_content(
                    yaml_content=self._config_dict.get("yaml_content", ""),
                    colang_content=self._config_dict.get("colang_content", ""),
                )
            else:
                # Basic default configuration
                default_yaml = """
                models:
                  - type: main
                    engine: openai
                    model: gpt-4o-mini
                """
                config = RailsConfig.from_content(yaml_content=default_yaml)

            self._rails_app = RailsApp(config)
            logger.info("nemo_guardrails_init_complete")

        return self._rails_app

    @trace_operation(LifecycleStage.GUARDRAIL, "nemo_validate")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        reraise=True,
    )
    async def validate(
        self,
        text: str,
        context: str | None = None,
    ) -> GuardrailResult:
        """Execute guardrails check on input or output.

        If a safety policy is triggered, the RailsApp redirects conversation
        flow and returns one of the fallback/blocked response messages.
        """
        app = self._get_rails_app()

        try:
            logger.info("nemo_guardrails_check_start", text_len=len(text))
            
            # NeMo Guardrails expects a prompt or chat history
            # If context is present, we format it as part of the query context
            history = []
            if context:
                history.append({"role": "user", "content": context})
                history.append({"role": "assistant", "content": text})
                # Check response validation
                response = await app.generate_async(messages=history)
            else:
                response = await app.generate_async(prompt=text)

            # Response can be a string or a dict/object
            response_text = ""
            if isinstance(response, str):
                response_text = response
            elif hasattr(response, "content"):
                response_text = response.content
            elif isinstance(response, dict) and "content" in response:
                response_text = response["content"]
            elif isinstance(response, list) and len(response) > 0:
                # List of messages
                last_msg = response[-1]
                if isinstance(last_msg, dict) and "content" in last_msg:
                    response_text = last_msg["content"]
                elif hasattr(last_msg, "content"):
                    response_text = last_msg.content

            response_cleaned = response_text.strip()
            
            # Check if safety rails were triggered
            is_blocked = any(fallback.lower() in response_cleaned.lower() for fallback in self._fallback_messages)
            
            if is_blocked:
                explanation = f"Blocked by guardrail: response matched fallback '{response_cleaned}'"
                logger.warn("nemo_guardrails_violation", explanation=explanation)
                return GuardrailResult(
                    is_safe=False,
                    violation_category="NEMO_GUARDRAILS_POLICY",
                    explanation=explanation,
                    confidence=1.0,
                )

            return GuardrailResult(is_safe=True, confidence=1.0)

        except Exception as exc:
            logger.error("nemo_guardrails_check_failed", error=str(exc))
            raise exc

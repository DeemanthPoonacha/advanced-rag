"""Cohere LLM provider implementation.

Supports Cohere's Command R+ family with streaming and structured output.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

import structlog
from pydantic import BaseModel
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..core.interfaces import BaseLLM
from ..core.registry import ComponentRegistry
from ..core.types import LifecycleStage
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("llm", "cohere")
class CohereLLM(BaseLLM):
    """LLM provider backed by the Cohere Chat API.

    Args:
        model: Model identifier (e.g. ``"command-r-plus"``).
        api_key: Cohere API key (or set ``CO_API_KEY`` env var).
        temperature: Sampling temperature.
        max_tokens: Maximum completion tokens.
        top_p: Nucleus sampling threshold.
        preamble: System-level preamble for the model.
    """

    def __init__(
        self,
        model: str = "command-r-plus",
        api_key: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        top_p: float = 0.95,
        preamble: str | None = None,
        **kwargs: Any,
    ) -> None:
        self._model = model
        self._api_key = api_key
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._top_p = top_p
        self._preamble = preamble
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazily initialise the async Cohere client."""
        if self._client is None:
            import cohere

            kwargs: dict[str, Any] = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            self._client = cohere.AsyncClientV2(**kwargs)
        return self._client

    @trace_operation(LifecycleStage.GENERATE, "cohere_generate")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        reraise=True,
    )
    async def generate(self, prompt: str, **kwargs: Any) -> str:
        """Generate a single-shot completion.

        Args:
            prompt: The user prompt.
            **kwargs: Overrides.

        Returns:
            The generated text.
        """
        client = self._get_client()

        messages: list[dict[str, str]] = []
        if self._preamble:
            messages.append({"role": "system", "content": self._preamble})
        messages.append({"role": "user", "content": prompt})

        response = await client.chat(
            model=kwargs.get("model", self._model),
            messages=messages,
            temperature=kwargs.get("temperature", self._temperature),
            max_tokens=kwargs.get("max_tokens", self._max_tokens),
            p=kwargs.get("top_p", self._top_p),
        )

        content = ""
        if hasattr(response, "message") and hasattr(response.message, "content"):
            for block in response.message.content:
                if hasattr(block, "text"):
                    content += block.text

        logger.info(
            "cohere_generate_complete",
            model=self._model,
            tokens=getattr(response, "usage", None),
        )
        return content

    @trace_operation(LifecycleStage.GENERATE, "cohere_generate_stream")
    async def generate_stream(self, prompt: str, **kwargs: Any) -> AsyncIterator[str]:
        """Stream a completion via Cohere's streaming API.

        Args:
            prompt: The user prompt.
            **kwargs: Overrides.

        Yields:
            Token strings.
        """
        client = self._get_client()

        messages: list[dict[str, str]] = []
        if self._preamble:
            messages.append({"role": "system", "content": self._preamble})
        messages.append({"role": "user", "content": prompt})

        stream = client.chat_stream(
            model=kwargs.get("model", self._model),
            messages=messages,
            temperature=kwargs.get("temperature", self._temperature),
            max_tokens=kwargs.get("max_tokens", self._max_tokens),
        )

        async for event in stream:
            if hasattr(event, "type") and event.type == "content-delta":
                if hasattr(event, "delta") and hasattr(event.delta, "message"):
                    if hasattr(event.delta.message, "content"):
                        if hasattr(event.delta.message.content, "text"):
                            yield event.delta.message.content.text

    @trace_operation(LifecycleStage.GENERATE, "cohere_generate_structured")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        reraise=True,
    )
    async def generate_structured(
        self,
        prompt: str,
        output_schema: type[BaseModel],
        **kwargs: Any,
    ) -> BaseModel:
        """Generate a structured response validated against a Pydantic model.

        Args:
            prompt: The user prompt.
            output_schema: Pydantic model class for validation.
            **kwargs: Overrides.

        Returns:
            Validated instance of ``output_schema``.
        """
        schema_json = json.dumps(output_schema.model_json_schema(), indent=2)
        structured_prompt = (
            f"{prompt}\n\n"
            f"Respond ONLY with valid JSON matching this schema:\n"
            f"```json\n{schema_json}\n```"
        )

        raw = await self.generate(structured_prompt, temperature=0.0, **kwargs)

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            cleaned = "\n".join(lines)

        parsed_data = json.loads(cleaned)
        return output_schema.model_validate(parsed_data)

    async def close(self) -> None:
        """Close the underlying client."""
        if self._client is not None:
            await self._client.close()
            self._client = None

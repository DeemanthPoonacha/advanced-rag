"""Anthropic LLM provider implementation.

Supports Claude 3.5 / 4 family with streaming, structured output,
and tenacity retries.
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


@ComponentRegistry.register("llm", "anthropic")
class AnthropicLLM(BaseLLM):
    """LLM provider backed by the Anthropic Messages API.

    Args:
        model: Model identifier (e.g. ``"claude-sonnet-4-20250514"``).
        api_key: Anthropic API key (or set ``ANTHROPIC_API_KEY`` env var).
        temperature: Sampling temperature.
        max_tokens: Maximum completion tokens.
        top_p: Nucleus sampling threshold.
        max_retries: Retry attempts for transient errors.
        system_message: Default system prompt.
    """

    def __init__(
        self,
        model: str = "claude-sonnet-4-20250514",
        api_key: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        top_p: float = 0.95,
        max_retries: int = 3,
        system_message: str | None = None,
        **kwargs: Any,
    ) -> None:
        self._model = model
        self._api_key = api_key
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._top_p = top_p
        self._max_retries = max_retries
        self._system_message = system_message
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazily initialise the async Anthropic client."""
        if self._client is None:
            from anthropic import AsyncAnthropic

            kwargs: dict[str, Any] = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            self._client = AsyncAnthropic(**kwargs)
        return self._client

    @trace_operation(LifecycleStage.GENERATE, "anthropic_generate")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        reraise=True,
    )
    async def generate(self, prompt: str, **kwargs: Any) -> str:
        """Generate a single-shot completion via the Messages API.

        Args:
            prompt: The user prompt.
            **kwargs: Overrides for model, temperature, max_tokens, etc.

        Returns:
            The generated text.
        """
        client = self._get_client()

        images = kwargs.pop("images", None)
        messages = self._build_messages(prompt, images=images)

        params: dict[str, Any] = {
            "model": kwargs.get("model", self._model),
            "max_tokens": kwargs.get("max_tokens", self._max_tokens),
            "temperature": kwargs.get("temperature", self._temperature),
            "top_p": kwargs.get("top_p", self._top_p),
            "messages": messages,
        }
        if self._system_message:
            params["system"] = self._system_message

        response = await client.messages.create(**params)

        content = ""
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text

        logger.info(
            "anthropic_generate_complete",
            model=self._model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )
        return content

    @trace_operation(LifecycleStage.GENERATE, "anthropic_generate_stream")
    async def generate_stream(self, prompt: str, **kwargs: Any) -> AsyncIterator[str]:
        """Stream a completion, yielding text deltas.

        Args:
            prompt: The user prompt.
            **kwargs: Overrides.

        Yields:
            Token strings.
        """
        client = self._get_client()

        images = kwargs.pop("images", None)
        messages = self._build_messages(prompt, images=images)

        params: dict[str, Any] = {
            "model": kwargs.get("model", self._model),
            "max_tokens": kwargs.get("max_tokens", self._max_tokens),
            "temperature": kwargs.get("temperature", self._temperature),
            "messages": messages,
        }
        if self._system_message:
            params["system"] = self._system_message

        async with client.messages.stream(**params) as stream:
            async for text in stream.text_stream:
                yield text

    @trace_operation(LifecycleStage.GENERATE, "anthropic_generate_structured")
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

        Instructs Claude to output JSON matching the schema.

        Args:
            prompt: The user prompt.
            output_schema: Pydantic model class to validate against.
            **kwargs: Overrides.

        Returns:
            Validated instance of ``output_schema``.
        """
        schema_json = json.dumps(output_schema.model_json_schema(), indent=2)
        structured_prompt = (
            f"{prompt}\n\n"
            f"Respond ONLY with valid JSON matching this schema (no markdown, "
            f"no explanation, just the JSON object):\n"
            f"```json\n{schema_json}\n```"
        )

        raw = await self.generate(structured_prompt, temperature=0.0, **kwargs)

        # Strip markdown code fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            cleaned = "\n".join(lines)

        parsed_data = json.loads(cleaned)
        return output_schema.model_validate(parsed_data)

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client is not None:
            await self._client.close()
            self._client = None

    # ── Internal ─────────────────────────────────────────────────────

    def _build_messages(self, prompt: str, images: list[str] | None = None) -> list[dict[str, Any]]:
        """Build the messages array with base64 images for Anthropic."""
        if not images:
            return [{"role": "user", "content": prompt}]
        
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        for img in images:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": img,
                }
            })
        return [{"role": "user", "content": content}]

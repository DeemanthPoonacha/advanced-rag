"""OpenAI LLM provider implementation.

Supports GPT-4o, GPT-4-turbo, and any OpenAI-compatible endpoint with
streaming, structured output, and tenacity retries.
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


@ComponentRegistry.register("llm", "openai")
class OpenAILLM(BaseLLM):
    """LLM provider backed by the OpenAI Chat Completions API.

    Args:
        model: Model identifier (e.g. ``"gpt-4o"``).
        api_key: OpenAI API key (or set ``OPENAI_API_KEY`` env var).
        temperature: Sampling temperature.
        max_tokens: Maximum completion tokens.
        top_p: Nucleus sampling threshold.
        max_retries: Retry attempts for transient errors.
        base_url: Custom base URL for Azure or compatible endpoints.
        system_message: Default system message prepended to every call.
    """

    def __init__(
        self,
        model: str = "gpt-4o",
        api_key: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
        top_p: float = 0.95,
        max_retries: int = 3,
        base_url: str | None = None,
        system_message: str | None = None,
        **kwargs: Any,
    ) -> None:
        self._model = model
        self._api_key = api_key
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._top_p = top_p
        self._max_retries = max_retries
        self._base_url = base_url
        self._system_message = system_message
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazily initialise the async OpenAI client."""
        if self._client is None:
            from openai import AsyncOpenAI

            kwargs: dict[str, Any] = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            if self._base_url:
                kwargs["base_url"] = self._base_url
            self._client = AsyncOpenAI(**kwargs)
        return self._client

    @trace_operation(LifecycleStage.GENERATE, "openai_generate")
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
            **kwargs: Overrides for temperature, max_tokens, etc.

        Returns:
            The generated text.
        """
        client = self._get_client()
        messages = self._build_messages(prompt)

        response = await client.chat.completions.create(
            model=kwargs.get("model", self._model),
            messages=messages,
            temperature=kwargs.get("temperature", self._temperature),
            max_tokens=kwargs.get("max_tokens", self._max_tokens),
            top_p=kwargs.get("top_p", self._top_p),
        )

        content = response.choices[0].message.content or ""
        logger.info(
            "openai_generate_complete",
            model=self._model,
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
        )
        return content

    @trace_operation(LifecycleStage.GENERATE, "openai_generate_stream")
    async def generate_stream(self, prompt: str, **kwargs: Any) -> AsyncIterator[str]:
        """Stream a completion, yielding token chunks as they arrive.

        Args:
            prompt: The user prompt.
            **kwargs: Overrides for temperature, max_tokens, etc.

        Yields:
            Token strings.
        """
        client = self._get_client()
        messages = self._build_messages(prompt)

        stream = await client.chat.completions.create(
            model=kwargs.get("model", self._model),
            messages=messages,
            temperature=kwargs.get("temperature", self._temperature),
            max_tokens=kwargs.get("max_tokens", self._max_tokens),
            top_p=kwargs.get("top_p", self._top_p),
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    @trace_operation(LifecycleStage.GENERATE, "openai_generate_structured")
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

        Instructs the LLM to output JSON matching the schema and validates
        the response.

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
            f"Respond ONLY with valid JSON matching this schema:\n"
            f"```json\n{schema_json}\n```"
        )

        client = self._get_client()
        messages = self._build_messages(structured_prompt)

        response = await client.chat.completions.create(
            model=kwargs.get("model", self._model),
            messages=messages,
            temperature=kwargs.get("temperature", 0.0),
            max_tokens=kwargs.get("max_tokens", self._max_tokens),
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content or "{}"
        parsed_data = json.loads(content)
        return output_schema.model_validate(parsed_data)

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client is not None:
            await self._client.close()
            self._client = None

    # ── Internal ─────────────────────────────────────────────────────

    def _build_messages(self, prompt: str) -> list[dict[str, str]]:
        """Build the messages array with optional system message."""
        messages: list[dict[str, str]] = []
        if self._system_message:
            messages.append({"role": "system", "content": self._system_message})
        messages.append({"role": "user", "content": prompt})
        return messages

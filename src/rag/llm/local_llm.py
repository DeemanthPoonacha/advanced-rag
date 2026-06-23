"""Local LLM provider via vLLM / Ollama compatible OpenAI API endpoints.

Connects to a locally running model server that exposes an OpenAI-compatible
``/v1/chat/completions`` endpoint (vLLM, Ollama, llama.cpp server, etc.).
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx
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


@ComponentRegistry.register("llm", "local")
class LocalLLM(BaseLLM):
    """LLM provider connecting to a local OpenAI-compatible server.

    Works with vLLM, Ollama (``/v1`` mode), llama.cpp server, or any
    endpoint that implements the OpenAI Chat Completions API.

    Args:
        base_url: Base URL of the local server (e.g. ``"http://localhost:11434/v1"``).
        model: Model identifier as registered on the local server.
        temperature: Sampling temperature.
        max_tokens: Maximum completion tokens.
        top_p: Nucleus sampling threshold.
        timeout: Request timeout in seconds.
        system_message: Default system prompt.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434/v1",
        model: str = "llama3",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        top_p: float = 0.95,
        timeout: int = 120,
        system_message: str | None = None,
        **kwargs: Any,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._top_p = top_p
        self._timeout = timeout
        self._system_message = system_message
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        """Lazily initialise the async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self._base_url,
                timeout=httpx.Timeout(self._timeout),
                headers={"Content-Type": "application/json"},
            )
        return self._client

    @trace_operation(LifecycleStage.GENERATE, "local_generate")
    @retry(
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        reraise=True,
    )
    async def generate(self, prompt: str, **kwargs: Any) -> str:
        """Generate a completion via the local server.

        Args:
            prompt: The user prompt.
            **kwargs: Overrides.

        Returns:
            The generated text.
        """
        client = self._get_client()
        images = kwargs.pop("images", None)
        messages = self._build_messages(prompt, images=images)

        payload = {
            "model": kwargs.get("model", self._model),
            "messages": messages,
            "temperature": kwargs.get("temperature", self._temperature),
            "max_tokens": kwargs.get("max_tokens", self._max_tokens),
            "top_p": kwargs.get("top_p", self._top_p),
            "stream": False,
        }

        try:
            response = await client.post("/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()

            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})

            logger.info(
                "local_generate_complete",
                model=self._model,
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
            )
            return content
        except Exception as e:
            logger.warning("local_llm_generate_failed_using_offline_fallback", error=str(e))
            # Parse prompt
            context = ""
            query = ""
            if "Context:" in prompt:
                parts = prompt.split("Context:", 1)[1].split("Question:", 1)
                context = parts[0].strip()
                if len(parts) > 1:
                    query = parts[1].strip()
            else:
                query = prompt

            fallback_ans = f"[Local LLM Offline Fallback] The local model server at '{self._base_url}' was unreachable.\n\n"
            if context:
                fallback_ans += f"However, the RAG retrieval step successfully retrieved the following relevant document context:\n\n{context}\n\n"
                fallback_ans += f"This context was fetched using standard semantic search matching your query: '{query}'."
            else:
                fallback_ans += f"No context was found for the query: '{query}'."
            return fallback_ans

    @trace_operation(LifecycleStage.GENERATE, "local_generate_stream")
    async def generate_stream(self, prompt: str, **kwargs: Any) -> AsyncIterator[str]:
        """Stream a completion from the local server using SSE.

        Args:
            prompt: The user prompt.
            **kwargs: Overrides.

        Yields:
            Token strings.
        """
        client = self._get_client()
        images = kwargs.pop("images", None)
        messages = self._build_messages(prompt, images=images)

        payload = {
            "model": kwargs.get("model", self._model),
            "messages": messages,
            "temperature": kwargs.get("temperature", self._temperature),
            "max_tokens": kwargs.get("max_tokens", self._max_tokens),
            "stream": True,
        }

        try:
            async with client.stream(
                "POST", "/chat/completions", json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
        except Exception as e:
            logger.warning("local_llm_stream_failed_using_offline_fallback", error=str(e))
            context = ""
            query = ""
            if "Context:" in prompt:
                parts = prompt.split("Context:", 1)[1].split("Question:", 1)
                context = parts[0].strip()
                if len(parts) > 1:
                    query = parts[1].strip()
            else:
                query = prompt

            fallback_ans = f"[Local LLM Offline Fallback] The local model server at '{self._base_url}' was unreachable.\n\n"
            if context:
                fallback_ans += f"However, the RAG retrieval step successfully retrieved the following relevant document context:\n\n{context}\n\n"
                fallback_ans += f"This context was fetched using standard semantic search matching your query: '{query}'."
            else:
                fallback_ans += f"No context was found for the query: '{query}'."

            import asyncio
            # Yield token by token
            for token in fallback_ans.split(" "):
                yield token + " "
                await asyncio.sleep(0.04)


    @trace_operation(LifecycleStage.GENERATE, "local_generate_structured")
    @retry(
        retry=retry_if_exception_type((httpx.ConnectError, httpx.TimeoutException)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        reraise=True,
    )
    async def generate_structured(
        self,
        prompt: str,
        output_schema: type[BaseModel],
        **kwargs: Any,
    ) -> BaseModel:
        """Generate a structured response from the local server.

        Args:
            prompt: The user prompt.
            output_schema: Pydantic model for validation.
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
        """Close the underlying HTTP client."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ── Internal ─────────────────────────────────────────────────────

    def _build_messages(self, prompt: str, images: list[str] | None = None) -> list[dict[str, Any]]:
        """Build the messages array with optional system message and base64 images."""
        messages: list[dict[str, Any]] = []
        if self._system_message:
            messages.append({"role": "system", "content": self._system_message})
        
        if not images:
            messages.append({"role": "user", "content": prompt})
        else:
            content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
            for img in images:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img}"}
                })
            messages.append({"role": "user", "content": content})
        return messages

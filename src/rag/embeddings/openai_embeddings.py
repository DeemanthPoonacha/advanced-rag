"""OpenAI embedding model implementation.

Uses the OpenAI ``text-embedding-3-*`` family with automatic batching,
rate-limit retries, and optional dimensionality reduction.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..core.interfaces import BaseEmbeddingModel
from ..core.registry import ComponentRegistry
from ..core.types import LifecycleStage
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("embedding_model", "openai")
class OpenAIEmbeddingModel(BaseEmbeddingModel):
    """Embedding model backed by the OpenAI Embeddings API.

    Supports automatic batching, exponential-backoff retries on rate-limit
    and transient errors, and optional dimensionality reduction via the
    ``dimensions`` parameter.

    Args:
        model: Model identifier (e.g. ``"text-embedding-3-large"``).
        api_key: OpenAI API key (or set ``OPENAI_API_KEY`` env var).
        dimensions: Output dimensionality (model-dependent; ``None`` = default).
        batch_size: Maximum texts per API call.
        max_retries: Maximum retry attempts for transient failures.
        base_url: Optional custom base URL (for Azure or compatible endpoints).
    """

    def __init__(
        self,
        model: str = "text-embedding-3-large",
        api_key: str | None = None,
        dimensions: int | None = None,
        batch_size: int = 100,
        max_retries: int = 3,
        base_url: str | None = None,
        **kwargs: Any,
    ) -> None:
        self._model = model
        self._api_key = api_key
        self._dimensions_override = dimensions
        self._batch_size = batch_size
        self._max_retries = max_retries
        self._base_url = base_url
        self._client: Any = None

        # Default dimensions by model name
        self._default_dimensions: dict[str, int] = {
            "text-embedding-3-large": 3072,
            "text-embedding-3-small": 1536,
            "text-embedding-ada-002": 1536,
        }

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

    @property
    def dimensions(self) -> int:
        """Return the embedding dimensionality."""
        if self._dimensions_override:
            return self._dimensions_override
        return self._default_dimensions.get(self._model, 1536)

    @trace_operation(LifecycleStage.EMBED, "openai_embed")
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts with automatic sub-batching.

        Args:
            texts: Strings to embed.

        Returns:
            List of embedding vectors (same order as input).
        """
        if not texts:
            return []

        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i: i + self._batch_size]
            batch_embeddings = await self._embed_batch(batch)
            all_embeddings.extend(batch_embeddings)

        logger.info(
            "openai_embed_complete",
            model=self._model,
            texts=len(texts),
            batches=(len(texts) + self._batch_size - 1) // self._batch_size,
        )
        return all_embeddings

    @trace_operation(LifecycleStage.EMBED, "openai_embed_query")
    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query string.

        Args:
            query: The query text.

        Returns:
            Embedding vector.
        """
        results = await self._embed_batch([query])
        return results[0]

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client is not None:
            await self._client.close()
            self._client = None

    # ── Internal ─────────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        reraise=True,
    )
    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed a single batch via the OpenAI API with retries."""
        client = self._get_client()

        kwargs: dict[str, Any] = {
            "input": texts,
            "model": self._model,
        }
        if self._dimensions_override:
            kwargs["dimensions"] = self._dimensions_override

        try:
            response = await client.embeddings.create(**kwargs)
        except Exception as exc:
            # Catch rate-limit errors specifically for retry
            exc_str = str(exc).lower()
            if "rate" in exc_str or "429" in exc_str:
                logger.warning("openai_rate_limited", model=self._model)
                await asyncio.sleep(2)
                response = await client.embeddings.create(**kwargs)
            else:
                raise

        # Sort by index to guarantee order
        sorted_data = sorted(response.data, key=lambda x: x.index)
        return [item.embedding for item in sorted_data]

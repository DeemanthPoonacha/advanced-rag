"""Cohere embedding model implementation.

Supports Cohere's ``embed-v3`` family with automatic input-type handling
(``search_document`` vs ``search_query``), batching, and retries.
"""

from __future__ import annotations

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


@ComponentRegistry.register("embedding_model", "cohere")
class CohereEmbeddingModel(BaseEmbeddingModel):
    """Embedding model backed by the Cohere Embed API.

    Automatically uses ``input_type="search_document"`` for document
    embedding and ``input_type="search_query"`` for queries.

    Args:
        model: Model identifier (e.g. ``"embed-v4.0"``).
        api_key: Cohere API key (or set ``CO_API_KEY`` env var).
        dimensions: Output dimensionality (only for ``embed-v4.0`` and later).
        batch_size: Maximum texts per API call (Cohere limit: 96).
        input_type: Default input type for ``embed()`` calls.
    """

    def __init__(
        self,
        model: str = "embed-v4.0",
        api_key: str | None = None,
        dimensions: int | None = None,
        batch_size: int = 96,
        input_type: str = "search_document",
        **kwargs: Any,
    ) -> None:
        self._model = kwargs.pop("model_name", model)
        self._api_key = api_key
        self._dimensions_val = dimensions
        self._batch_size = min(batch_size, 96)  # Cohere hard limit
        self._input_type = input_type
        self._client: Any = None

        self._default_dimensions: dict[str, int] = {
            "embed-v4.0": 1024,
            "embed-english-v3.0": 1024,
            "embed-multilingual-v3.0": 1024,
            "embed-english-light-v3.0": 384,
            "embed-multilingual-light-v3.0": 384,
        }

    def _get_client(self) -> Any:
        """Lazily initialise the async Cohere client."""
        if self._client is None:
            import cohere

            kwargs: dict[str, Any] = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            self._client = cohere.AsyncClientV2(**kwargs)
        return self._client

    @property
    def dimensions(self) -> int:
        """Return the embedding dimensionality."""
        if self._dimensions_val:
            return self._dimensions_val
        return self._default_dimensions.get(self._model, 1024)

    @trace_operation(LifecycleStage.EMBED, "cohere_embed")
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed texts as documents with automatic sub-batching.

        Args:
            texts: Strings to embed.

        Returns:
            List of embedding vectors.
        """
        if not texts:
            return []

        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), self._batch_size):
            batch = texts[i: i + self._batch_size]
            batch_embeddings = await self._embed_batch(
                batch, input_type=self._input_type
            )
            all_embeddings.extend(batch_embeddings)

        logger.info(
            "cohere_embed_complete",
            model=self._model,
            texts=len(texts),
            input_type=self._input_type,
        )
        return all_embeddings

    @trace_operation(LifecycleStage.EMBED, "cohere_embed_query")
    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query with ``input_type='search_query'``.

        Args:
            query: The query text.

        Returns:
            Embedding vector.
        """
        results = await self._embed_batch([query], input_type="search_query")
        return results[0]

    async def close(self) -> None:
        """Close the underlying client."""
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
    async def _embed_batch(
        self, texts: list[str], input_type: str
    ) -> list[list[float]]:
        """Call the Cohere embed API for a single batch."""
        client = self._get_client()

        kwargs: dict[str, Any] = {
            "texts": texts,
            "model": self._model,
            "input_type": input_type,
            "embedding_types": ["float"],
        }

        response = await client.embed(**kwargs)

        # v2 API returns embeddings under response.embeddings.float_
        if hasattr(response, "embeddings"):
            embeddings_obj = response.embeddings
            if hasattr(embeddings_obj, "float_"):
                return [list(e) for e in embeddings_obj.float_]
            if hasattr(embeddings_obj, "float"):
                return [list(e) for e in getattr(embeddings_obj, "float")]

        # Fallback for v1-style responses
        if hasattr(response, "embeddings") and isinstance(response.embeddings, list):
            return [list(e) for e in response.embeddings]

        raise RuntimeError(f"Unexpected Cohere response structure: {type(response)}")

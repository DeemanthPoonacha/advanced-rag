"""Cohere Rerank API reranker.

Uses Cohere's ``rerank`` endpoint (v3.5+) to re-score retrieval results
with a cross-encoder trained for relevance ranking.
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

from ...core.interfaces import BaseReranker
from ...core.registry import ComponentRegistry
from ...core.types import LifecycleStage, RetrievalResult
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("reranker", "cohere")
class CohereReranker(BaseReranker):
    """Reranker using the Cohere Rerank API.

    Args:
        model: Reranker model ID (e.g. ``"rerank-v3.5"``).
        api_key: Cohere API key (or set ``CO_API_KEY`` env var).
        max_chunks_per_doc: Maximum tokens per document sent to rerank.
    """

    def __init__(
        self,
        model: str = "rerank-v3.5",
        api_key: str | None = None,
        max_chunks_per_doc: int | None = None,
        **kwargs: Any,
    ) -> None:
        self._model = model
        self._api_key = api_key or os.getenv("COHERE_API_KEY") or os.getenv("CO_API_KEY")
        self._max_chunks_per_doc = max_chunks_per_doc
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazily initialise the Cohere client."""
        if self._client is None:
            import cohere

            kwargs: dict[str, Any] = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            self._client = cohere.AsyncClientV2(**kwargs)
        return self._client

    @trace_operation(LifecycleStage.RERANK, "cohere_rerank")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        reraise=True,
    )
    async def rerank(
        self,
        query: str,
        results: list[RetrievalResult],
        top_n: int = 5,
    ) -> list[RetrievalResult]:
        """Rerank results using the Cohere Rerank API.

        Args:
            query: The original user query.
            results: Retrieval results to rerank.
            top_n: Number of results to return.

        Returns:
            Top-N results sorted by rerank score.
        """
        if not results:
            return []

        client = self._get_client()
        documents = [r.chunk.content for r in results]

        kwargs: dict[str, Any] = {
            "query": query,
            "documents": documents,
            "model": self._model,
            "top_n": min(top_n, len(results)),
        }
        if self._max_chunks_per_doc:
            kwargs["max_chunks_per_doc"] = self._max_chunks_per_doc

        response = await client.rerank(**kwargs)

        reranked: list[RetrievalResult] = []
        for item in response.results:
            idx = item.index
            original = results[idx].model_copy(deep=True)
            original.rerank_score = item.relevance_score
            original.retrieval_method = (
                f"{original.retrieval_method}+cohere_rerank"
                if original.retrieval_method
                else "cohere_rerank"
            )
            reranked.append(original)

        reranked.sort(key=lambda r: r.rerank_score or 0, reverse=True)

        logger.info(
            "cohere_rerank_complete",
            model=self._model,
            input=len(results),
            output=len(reranked),
        )
        return reranked

    async def close(self) -> None:
        """Close the Cohere client."""
        if self._client is not None:
            await self._client.close()
            self._client = None

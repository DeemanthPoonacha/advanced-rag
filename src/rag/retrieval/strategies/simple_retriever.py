"""Simple single-query retriever.

Performs a straightforward dense vector search — no query expansion,
no compression, no merging.  Suitable as a baseline and for simple use cases.
"""

from __future__ import annotations

from typing import Any

import structlog

from ...core.interfaces import BaseEmbeddingModel, BaseRetriever, BaseVectorStore
from ...core.registry import ComponentRegistry
from ...core.types import LifecycleStage, QueryContext, RetrievalResult
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("retriever", "simple")
class SimpleRetriever(BaseRetriever):
    """Baseline retriever: embed query → search vector store → return results.

    Args:
        vector_store: Initialised vector store.
        embedding_model: Initialised embedding model.
        top_k: Default number of results.
        similarity_threshold: Minimum score to include a result.
    """

    def __init__(
        self,
        vector_store: BaseVectorStore,
        embedding_model: BaseEmbeddingModel,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        **kwargs: Any,
    ) -> None:
        self._vector_store = vector_store
        self._embedding_model = embedding_model
        self._top_k = top_k
        self._similarity_threshold = similarity_threshold

    @trace_operation(LifecycleStage.RETRIEVE, "simple_retrieve")
    async def retrieve(self, context: QueryContext) -> list[RetrievalResult]:
        """Embed the query and perform a dense search.

        Args:
            context: Query context.

        Returns:
            Ranked retrieval results.
        """
        query_embedding = await self._embedding_model.embed_query(
            context.original_query
        )

        top_k = context.top_k or self._top_k

        results = await self._vector_store.search(
            query_embedding=query_embedding,
            top_k=top_k,
            filters=context.filters or None,
        )

        # Apply similarity threshold
        threshold = context.similarity_threshold or self._similarity_threshold
        if threshold > 0:
            results = [r for r in results if r.score >= threshold]

        logger.info(
            "simple_retrieve_complete",
            query=context.original_query[:100],
            results=len(results),
        )
        return results

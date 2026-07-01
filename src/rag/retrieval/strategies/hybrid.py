"""Hybrid retriever.

Combines dense (semantic) and sparse (keyword) search results.
"""

from __future__ import annotations

from typing import Any

import structlog

from ...core.interfaces import BaseEmbeddingModel, BaseRetriever, BaseVectorStore
from ...core.registry import ComponentRegistry
from ...core.types import LifecycleStage, QueryContext, RetrievalResult
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("retriever", "hybrid")
class HybridRetriever(BaseRetriever):
    """Retriever that executes a hybrid search.

    It embeds the query into both a dense vector and a sparse vector,
    then executes hybrid search on the vector store.

    Args:
        vector_store: Initialised vector store.
        embedding_model: Initialised embedding model.
        top_k: Default number of results to retrieve.
        similarity_threshold: Minimum score to include a result.
        alpha: Weight for dense scores (1 - alpha applied to sparse).
    """

    def __init__(
        self,
        vector_store: BaseVectorStore,
        embedding_model: BaseEmbeddingModel,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        alpha: float = 0.5,
        **kwargs: Any,
    ) -> None:
        self._vector_store = vector_store
        self._embedding_model = embedding_model
        self._top_k = top_k
        self._similarity_threshold = similarity_threshold
        self._alpha = alpha

    @trace_operation(LifecycleStage.RETRIEVE, "hybrid_retrieve")
    async def retrieve(self, context: QueryContext) -> list[RetrievalResult]:
        """Perform dense + sparse hybrid search.

        Args:
            context: Query context.

        Returns:
            Ranked and filtered retrieval results.
        """
        # Generate dense query embedding
        query_embedding = await self._embedding_model.embed_query(
            context.original_query
        )

        # Generate sparse query embedding
        sparse_vectors = await self._embedding_model.embed_sparse(
            [context.original_query]
        )
        sparse_vector = sparse_vectors[0]

        top_k = context.top_k or self._top_k
        # Extract alpha from context metadata or use the default
        alpha = context.metadata.get("alpha", self._alpha) if context.metadata else self._alpha

        # Execute hybrid search
        results = await self._vector_store.hybrid_search(
            query_embedding=query_embedding,
            sparse_vector=sparse_vector,
            top_k=top_k,
            alpha=alpha,
            filters=context.filters or None,
            query_text=context.original_query,
        )

        # Apply similarity threshold
        threshold = context.similarity_threshold or self._similarity_threshold
        if threshold > 0:
            results = [r for r in results if r.score >= threshold]

        logger.info(
            "hybrid_retrieve_complete",
            query=context.original_query[:100],
            results_count=len(results),
        )
        return results

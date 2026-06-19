"""Contextual Compression retriever.

Retrieves an initial candidate set, then uses an LLM to compress each
context passage — extracting only the sentences relevant to the query.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from pydantic import BaseModel, Field

from ...core.interfaces import BaseEmbeddingModel, BaseLLM, BaseRetriever, BaseVectorStore
from ...core.registry import ComponentRegistry
from ...core.types import LifecycleStage, QueryContext, RetrievalResult
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


class CompressedContent(BaseModel):
    """Schema for LLM-compressed context."""
    compressed: str = Field(description="The compressed, relevant portion of the context")
    is_relevant: bool = Field(description="Whether the context is relevant to the query at all")


@ComponentRegistry.register("retriever", "contextual_compression")
class ContextualCompressionRetriever(BaseRetriever):
    """Retriever that compresses retrieved contexts to only relevant content.

    Algorithm:
    1. Run a standard dense search to get initial candidates.
    2. For each candidate, use the LLM to extract only the query-relevant
       sentences from the passage.
    3. Filter out passages deemed irrelevant by the LLM.

    This dramatically improves context quality when chunks contain
    mixed relevant/irrelevant content.

    Args:
        vector_store: Initialised vector store.
        embedding_model: Initialised embedding model.
        llm: LLM for context compression.
        top_k: Number of initial candidates to retrieve.
        similarity_threshold: Minimum score threshold.
        compression_concurrency: Max parallel LLM compression calls.
    """

    def __init__(
        self,
        vector_store: BaseVectorStore,
        embedding_model: BaseEmbeddingModel,
        llm: BaseLLM,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        compression_concurrency: int = 5,
        **kwargs: Any,
    ) -> None:
        self._vector_store = vector_store
        self._embedding_model = embedding_model
        self._llm = llm
        self._top_k = top_k
        self._similarity_threshold = similarity_threshold
        self._compression_concurrency = compression_concurrency

    @trace_operation(LifecycleStage.RETRIEVE, "contextual_compression_retrieve")
    async def retrieve(self, context: QueryContext) -> list[RetrievalResult]:
        """Retrieve and compress contexts.

        Args:
            context: Query context.

        Returns:
            Compressed, filtered results.
        """
        # 1. Initial dense retrieval (fetch extra candidates for filtering)
        query_embedding = await self._embedding_model.embed_query(
            context.original_query
        )
        top_k = context.top_k or self._top_k
        candidates = await self._vector_store.search(
            query_embedding=query_embedding,
            top_k=top_k * 2,  # Retrieve extra since some will be filtered
            filters=context.filters or None,
        )

        if not candidates:
            return []

        # 2. Compress each candidate in parallel with bounded concurrency
        semaphore = asyncio.Semaphore(self._compression_concurrency)

        async def _compress_one(result: RetrievalResult) -> RetrievalResult | None:
            async with semaphore:
                return await self._compress_context(
                    context.original_query, result
                )

        tasks = [_compress_one(r) for r in candidates]
        compressed_results = await asyncio.gather(*tasks, return_exceptions=True)

        # 3. Filter out irrelevant results and errors
        final: list[RetrievalResult] = []
        for result in compressed_results:
            if isinstance(result, Exception):
                logger.warning("compression_failed", error=str(result))
                continue
            if result is not None:
                final.append(result)

        # 4. Apply threshold and limit
        threshold = context.similarity_threshold or self._similarity_threshold
        if threshold > 0:
            final = [r for r in final if r.score >= threshold]

        final = final[:top_k]

        logger.info(
            "contextual_compression_complete",
            candidates=len(candidates),
            compressed=len(final),
        )
        return final

    # ── Internal ─────────────────────────────────────────────────────

    async def _compress_context(
        self,
        query: str,
        result: RetrievalResult,
    ) -> RetrievalResult | None:
        """Use the LLM to compress a single context passage."""
        prompt = (
            f"Given the following query and context passage, extract ONLY the "
            f"sentences and information from the context that are directly "
            f"relevant to answering the query. If the context contains no "
            f"relevant information, set is_relevant to false.\n\n"
            f"Query: {query}\n\n"
            f"Context:\n{result.chunk.content}\n\n"
            f"Return a JSON object with 'compressed' (the relevant text) and "
            f"'is_relevant' (boolean)."
        )

        try:
            compressed = await self._llm.generate_structured(
                prompt, output_schema=CompressedContent
            )

            if not compressed.is_relevant or not compressed.compressed.strip():
                return None

            # Create a new result with compressed content
            new_result = result.model_copy(deep=True)
            new_result.chunk.content = compressed.compressed
            new_result.chunk.token_count = len(compressed.compressed.split())
            new_result.retrieval_method = "contextual_compression"
            return new_result

        except Exception as exc:
            logger.warning(
                "compression_parse_failed",
                chunk_id=result.chunk.id,
                error=str(exc),
            )
            # Fall back to uncompressed result
            result.retrieval_method = "contextual_compression_fallback"
            return result

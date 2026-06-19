"""Multi-Query retriever.

Uses an LLM to generate multiple reformulations of the original query,
runs parallel searches for each, and deduplicates/fuses the results
using Reciprocal Rank Fusion (RRF).
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


class ExpandedQueries(BaseModel):
    """Schema for LLM-generated query expansions."""
    queries: list[str] = Field(
        description="List of alternative query reformulations"
    )


@ComponentRegistry.register("retriever", "multi_query")
class MultiQueryRetriever(BaseRetriever):
    """Retriever that generates multiple query reformulations via an LLM.

    Algorithm:
    1. Use the LLM to generate ``num_queries`` reformulations.
    2. Embed each reformulation and run parallel vector searches.
    3. Merge and deduplicate results using Reciprocal Rank Fusion.

    Args:
        vector_store: Initialised vector store.
        embedding_model: Initialised embedding model.
        llm: LLM for query expansion.
        top_k: Results per individual query.
        similarity_threshold: Minimum score threshold.
        num_queries: Number of alternative queries to generate.
        rrf_k: RRF constant (default 60).
    """

    def __init__(
        self,
        vector_store: BaseVectorStore,
        embedding_model: BaseEmbeddingModel,
        llm: BaseLLM,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        num_queries: int = 3,
        rrf_k: int = 60,
        **kwargs: Any,
    ) -> None:
        self._vector_store = vector_store
        self._embedding_model = embedding_model
        self._llm = llm
        self._top_k = top_k
        self._similarity_threshold = similarity_threshold
        self._num_queries = num_queries
        self._rrf_k = rrf_k

    @trace_operation(LifecycleStage.RETRIEVE, "multi_query_retrieve")
    async def retrieve(self, context: QueryContext) -> list[RetrievalResult]:
        """Execute the multi-query retrieval strategy.

        Args:
            context: Query context.

        Returns:
            Deduplicated, RRF-fused results.
        """
        # 1. Generate alternative queries
        alt_queries = await self._expand_queries(context.original_query)
        all_queries = [context.original_query] + alt_queries
        context.expanded_queries = alt_queries

        logger.info(
            "multi_query_expanded",
            original=context.original_query[:100],
            alternatives=len(alt_queries),
        )

        # 2. Embed all queries in parallel
        embeddings = await asyncio.gather(
            *[self._embedding_model.embed_query(q) for q in all_queries]
        )

        # 3. Search with each query embedding in parallel
        top_k = context.top_k or self._top_k
        search_tasks = [
            self._vector_store.search(
                query_embedding=emb,
                top_k=top_k,
                filters=context.filters or None,
            )
            for emb in embeddings
        ]
        all_results = await asyncio.gather(*search_tasks)

        # 4. Reciprocal Rank Fusion
        fused = self._reciprocal_rank_fusion(all_results)

        # 5. Apply threshold and limit
        threshold = context.similarity_threshold or self._similarity_threshold
        if threshold > 0:
            fused = [r for r in fused if r.score >= threshold]

        final = fused[:top_k]

        logger.info(
            "multi_query_retrieve_complete",
            total_candidates=sum(len(r) for r in all_results),
            fused_results=len(final),
        )
        return final

    # ── Internal ─────────────────────────────────────────────────────

    async def _expand_queries(self, original_query: str) -> list[str]:
        """Use the LLM to generate alternative query reformulations."""
        prompt = (
            f"You are a search query expansion expert. Given the following query, "
            f"generate {self._num_queries} alternative reformulations that capture "
            f"different aspects or phrasings of the same information need. "
            f"Return them as a JSON object with a 'queries' key containing a list "
            f"of strings.\n\n"
            f"Original query: {original_query}\n\n"
            f"Return ONLY the JSON object."
        )

        try:
            result = await self._llm.generate_structured(
                prompt, output_schema=ExpandedQueries
            )
            return result.queries[: self._num_queries]
        except Exception as exc:
            logger.warning(
                "multi_query_expansion_failed",
                error=str(exc),
                fallback="using original query only",
            )
            return []

    def _reciprocal_rank_fusion(
        self, result_lists: list[list[RetrievalResult]]
    ) -> list[RetrievalResult]:
        """Merge multiple ranked lists using Reciprocal Rank Fusion.

        RRF score = Σ (1 / (k + rank_i)) for each list where the doc appears.
        """
        scores: dict[str, float] = {}
        best_result: dict[str, RetrievalResult] = {}

        for results in result_lists:
            for rank, result in enumerate(results):
                chunk_id = result.chunk.id
                rrf_score = 1.0 / (self._rrf_k + rank + 1)
                scores[chunk_id] = scores.get(chunk_id, 0.0) + rrf_score

                # Keep the result with the highest original score
                if chunk_id not in best_result or result.score > best_result[chunk_id].score:
                    best_result[chunk_id] = result

        # Sort by RRF score and update the score field
        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

        fused: list[RetrievalResult] = []
        for chunk_id in sorted_ids:
            result = best_result[chunk_id].model_copy()
            result.score = scores[chunk_id]
            result.retrieval_method = "multi_query_rrf"
            fused.append(result)

        return fused

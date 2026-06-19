"""Auto-Merging retriever.

Designed to work with the HierarchicalChunker.  When multiple child chunks
from the same parent are retrieved, they are "merged up" into the parent
chunk for richer, more coherent context.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import structlog

from ...core.interfaces import BaseEmbeddingModel, BaseRetriever, BaseVectorStore
from ...core.registry import ComponentRegistry
from ...core.types import Chunk, LifecycleStage, QueryContext, RetrievalResult
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("retriever", "auto_merging")
class AutoMergingRetriever(BaseRetriever):
    """Retriever that merges child chunks back into parent chunks.

    When used with the HierarchicalChunker, this retriever:
    1. Searches at the child-chunk level for fine-grained matching.
    2. Groups retrieved children by parent ID.
    3. If enough children from one parent are retrieved (≥ ``merge_threshold``),
       replaces them with the parent chunk for broader context.
    4. Deduplicates and scores the merged results.

    Args:
        vector_store: Initialised vector store.
        embedding_model: Initialised embedding model.
        top_k: Results to return after merging.
        similarity_threshold: Minimum score threshold.
        merge_threshold: Fraction of a parent's children that must be
            retrieved before merging up (0.0 – 1.0).
        fetch_multiplier: Multiplier on top_k for the initial candidate fetch.
    """

    def __init__(
        self,
        vector_store: BaseVectorStore,
        embedding_model: BaseEmbeddingModel,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        merge_threshold: float = 0.4,
        fetch_multiplier: int = 3,
        **kwargs: Any,
    ) -> None:
        self._vector_store = vector_store
        self._embedding_model = embedding_model
        self._top_k = top_k
        self._similarity_threshold = similarity_threshold
        self._merge_threshold = merge_threshold
        self._fetch_multiplier = fetch_multiplier

    @trace_operation(LifecycleStage.RETRIEVE, "auto_merging_retrieve")
    async def retrieve(self, context: QueryContext) -> list[RetrievalResult]:
        """Execute the auto-merging retrieval strategy.

        Args:
            context: Query context.

        Returns:
            Merged and deduplicated results.
        """
        # 1. Retrieve a large candidate set at child level
        query_embedding = await self._embedding_model.embed_query(
            context.original_query
        )
        top_k = context.top_k or self._top_k
        fetch_k = top_k * self._fetch_multiplier

        candidates = await self._vector_store.search(
            query_embedding=query_embedding,
            top_k=fetch_k,
            filters=context.filters or None,
        )

        if not candidates:
            return []

        # 2. Group by parent_id
        parent_groups: dict[str, list[RetrievalResult]] = defaultdict(list)
        orphans: list[RetrievalResult] = []

        for result in candidates:
            parent_id = result.chunk.parent_id
            if parent_id:
                parent_groups[parent_id].append(result)
            else:
                orphans.append(result)

        # 3. Decide which parents to merge
        merged_results: list[RetrievalResult] = []
        consumed_child_ids: set[str] = set()

        for parent_id, children in parent_groups.items():
            # Try to fetch the parent to check total children count
            parent_result = await self._fetch_parent(parent_id, query_embedding)

            if parent_result is not None:
                total_children = len(parent_result.chunk.children_ids) or 1
                retrieved_fraction = len(children) / total_children

                if retrieved_fraction >= self._merge_threshold:
                    # Merge: use parent chunk instead of children
                    avg_score = sum(c.score for c in children) / len(children)
                    parent_result.score = avg_score
                    parent_result.retrieval_method = "auto_merged"
                    merged_results.append(parent_result)
                    consumed_child_ids.update(c.chunk.id for c in children)

                    logger.debug(
                        "auto_merge_applied",
                        parent_id=parent_id,
                        children_retrieved=len(children),
                        total_children=total_children,
                        fraction=round(retrieved_fraction, 2),
                    )
                    continue

            # Not enough children to merge — keep individuals
            for child in children:
                if child.chunk.id not in consumed_child_ids:
                    child.retrieval_method = "auto_merging_child"
                    merged_results.append(child)

        # 4. Add orphans (chunks without parents)
        for orphan in orphans:
            orphan.retrieval_method = "auto_merging_orphan"
            merged_results.append(orphan)

        # 5. Sort by score, apply threshold, limit
        merged_results.sort(key=lambda r: r.score, reverse=True)

        threshold = context.similarity_threshold or self._similarity_threshold
        if threshold > 0:
            merged_results = [r for r in merged_results if r.score >= threshold]

        final = merged_results[:top_k]

        logger.info(
            "auto_merging_retrieve_complete",
            candidates=len(candidates),
            parents_merged=sum(
                1 for r in final if r.retrieval_method == "auto_merged"
            ),
            final_results=len(final),
        )
        return final

    # ── Internal ─────────────────────────────────────────────────────

    async def _fetch_parent(
        self, parent_id: str, query_embedding: list[float]
    ) -> RetrievalResult | None:
        """Attempt to retrieve a parent chunk by ID.

        Uses a filtered search for the specific parent ID.
        """
        try:
            results = await self._vector_store.search(
                query_embedding=query_embedding,
                top_k=1,
                filters={"id": parent_id},
            )
            if results:
                return results[0]
        except Exception:
            pass

        # Fallback: search by parent_id field
        try:
            all_results = await self._vector_store.search(
                query_embedding=query_embedding,
                top_k=50,
            )
            for r in all_results:
                if r.chunk.id == parent_id:
                    return r
        except Exception as exc:
            logger.debug("parent_fetch_failed", parent_id=parent_id, error=str(exc))

        return None

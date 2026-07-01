"""Self-Querying retriever.

Uses an LLM to extract metadata filters and query terms from natural language queries,
then executes a vector search (or hybrid search) with those filters.
"""

from __future__ import annotations

from typing import Any

import structlog
from pydantic import BaseModel, Field

from ...core.interfaces import BaseEmbeddingModel, BaseLLM, BaseRetriever, BaseVectorStore
from ...core.registry import ComponentRegistry
from ...core.types import LifecycleStage, QueryContext, RetrievalResult
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


class SelfQueryOutput(BaseModel):
    """Schema for LLM-extracted search terms and metadata filters."""
    query: str = Field(description="The reformulated semantic search query, stripping out metadata filter details")
    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="Key-value filters extracted from the user query. The values must match the metadata types exactly (e.g. integer page_number, string file_name)."
    )


@ComponentRegistry.register("retriever", "self_query")
class SelfQueryRetriever(BaseRetriever):
    """Retriever that extracts metadata filters from query text using an LLM.

    Args:
        vector_store: Initialised vector store.
        embedding_model: Initialised embedding model.
        llm: LLM for parsing the query.
        top_k: Results to return.
        similarity_threshold: Minimum score threshold.
        allowed_keys: List of allowed metadata keys to filter on.
        search_type: Backing retrieval method ("dense" or "hybrid", default "dense").
        alpha: Weight parameter for hybrid search (if search_type is hybrid).
    """

    def __init__(
        self,
        vector_store: BaseVectorStore,
        embedding_model: BaseEmbeddingModel,
        llm: BaseLLM,
        top_k: int = 10,
        similarity_threshold: float = 0.0,
        allowed_keys: list[str] | None = None,
        search_type: str = "dense",
        alpha: float = 0.5,
        **kwargs: Any,
    ) -> None:
        self._vector_store = vector_store
        self._embedding_model = embedding_model
        self._llm = llm
        self._top_k = top_k
        self._similarity_threshold = similarity_threshold
        self._allowed_keys = allowed_keys or [
            "file_name",
            "file_type",
            "source",
            "page_number",
            "language",
        ]
        self._search_type = search_type
        self._alpha = alpha

    @trace_operation(LifecycleStage.RETRIEVE, "self_query_retrieve")
    async def retrieve(self, context: QueryContext) -> list[RetrievalResult]:
        """Parse query context filters via LLM and execute search."""
        # 1. Parse and extract filters from query
        extracted = await self._parse_query(context.original_query)
        
        # Merge manual filters and LLM-extracted filters
        merged_filters = {**(context.filters or {})}
        if extracted.filters:
            # Filter extracted keys to only allowed keys to prevent SQL injection or vector store errors
            valid_extracted = {
                k: v for k, v in extracted.filters.items()
                if k in self._allowed_keys
            }
            merged_filters.update(valid_extracted)

        logger.info(
            "self_query_parsed",
            original=context.original_query[:100],
            extracted_query=extracted.query[:100],
            extracted_filters=extracted.filters,
            merged_filters=merged_filters,
        )

        search_query = extracted.query or context.original_query

        # 2. Execute retrieval based on search_type
        if self._search_type == "hybrid":
            query_embedding = await self._embedding_model.embed_query(search_query)
            sparse_vectors = await self._embedding_model.embed_sparse([search_query])
            results = await self._vector_store.hybrid_search(
                query_embedding=query_embedding,
                sparse_vector=sparse_vectors[0],
                top_k=context.top_k or self._top_k,
                alpha=self._alpha,
                filters=merged_filters or None,
                query_text=search_query,
            )
        else:
            query_embedding = await self._embedding_model.embed_query(search_query)
            results = await self._vector_store.search(
                query_embedding=query_embedding,
                top_k=context.top_k or self._top_k,
                filters=merged_filters or None,
            )

        # Apply similarity threshold
        threshold = context.similarity_threshold or self._similarity_threshold
        if threshold > 0:
            results = [r for r in results if r.score >= threshold]

        for r in results:
            r.retrieval_method = f"self_query_{self._search_type}"

        return results

    async def _parse_query(self, original_query: str) -> SelfQueryOutput:
        """Call the LLM to extract the query and filters."""
        prompt = (
            f"You are a search query parsing assistant. Your task is to analyze the user's search query, "
            f"extract metadata filters, and produce a cleaned semantic search query.\n\n"
            f"Allowed metadata keys for filtering are: {self._allowed_keys}\n\n"
            f"Example:\n"
            f"Query: 'Show me reports about sales from page 5 of document.pdf'\n"
            f"Output: {{\n"
            f"  \"query\": \"sales reports\",\n"
            f"  \"filters\": {{\n"
            f"    \"file_name\": \"document.pdf\",\n"
            f"    \"page_number\": 5\n"
            f"  }}\n"
            f"}}\n\n"
            f"User Query: {original_query}\n\n"
            f"Return a JSON object containing the parsed 'query' and 'filters'."
        )

        try:
            return await self._llm.generate_structured(
                prompt, output_schema=SelfQueryOutput
            )
        except Exception as exc:
            logger.warning(
                "self_query_parse_failed",
                error=str(exc),
                fallback="using original query without metadata filters",
            )
            return SelfQueryOutput(query=original_query, filters={})

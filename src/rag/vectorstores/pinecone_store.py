"""Pinecone vector store implementation.

Supports serverless and pod-based indexes, metadata filtering,
namespace isolation, and batched upserts with retries.
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

from ..core.interfaces import BaseVectorStore
from ..core.registry import ComponentRegistry
from ..core.types import Chunk, DocumentMetadata, LifecycleStage, RetrievalResult, SparseVector
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("vector_store", "pinecone")
class PineconeVectorStore(BaseVectorStore):
    """Vector store backed by Pinecone.

    Args:
        api_key: Pinecone API key (or set ``PINECONE_API_KEY`` env var).
        index_name: Name of the Pinecone index.
        namespace: Optional namespace for multi-tenant isolation.
        cloud: Cloud provider for serverless (e.g. ``"aws"``).
        region: Region for serverless (e.g. ``"us-east-1"``).
        dimension: Vector dimensionality.
        metric: Distance metric (``"cosine"``, ``"euclidean"``, ``"dotproduct"``).
        batch_size: Vectors per upsert batch.
    """

    def __init__(
        self,
        api_key: str | None = None,
        index_name: str = "documents",
        namespace: str = "",
        cloud: str = "aws",
        region: str = "us-east-1",
        dimension: int = 1536,
        metric: str = "cosine",
        batch_size: int = 100,
        **kwargs: Any,
    ) -> None:
        self._api_key = api_key
        self._index_name = index_name
        self._namespace = namespace
        self._cloud = cloud
        self._region = region
        self._dimension = dimension
        self._metric = metric
        self._batch_size = batch_size
        self._pc: Any = None
        self._index: Any = None

    def _get_index(self) -> Any:
        """Lazily initialise the Pinecone client and index."""
        if self._index is None:
            from pinecone import Pinecone

            kwargs: dict[str, Any] = {}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            self._pc = Pinecone(**kwargs)
            self._index = self._pc.Index(self._index_name)
        return self._index

    @trace_operation(LifecycleStage.UPSERT, "pinecone_initialize")
    async def initialize(self) -> None:
        """Create the index if it does not exist (serverless spec)."""
        from pinecone import Pinecone, ServerlessSpec

        kwargs: dict[str, Any] = {}
        if self._api_key:
            kwargs["api_key"] = self._api_key
        pc = Pinecone(**kwargs)
        self._pc = pc

        existing = [idx.name for idx in pc.list_indexes()]
        if self._index_name not in existing:
            pc.create_index(
                name=self._index_name,
                dimension=self._dimension,
                metric=self._metric,
                spec=ServerlessSpec(cloud=self._cloud, region=self._region),
            )
            logger.info(
                "pinecone_index_created",
                index=self._index_name,
                dimension=self._dimension,
                metric=self._metric,
            )
        else:
            logger.info("pinecone_index_exists", index=self._index_name)

        self._index = pc.Index(self._index_name)

    @trace_operation(LifecycleStage.UPSERT, "pinecone_upsert")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        reraise=True,
    )
    async def upsert(self, chunks: list[Chunk]) -> list[str]:
        """Upsert chunks into Pinecone in batches.

        Args:
            chunks: Chunks with embeddings.

        Returns:
            List of upserted IDs.
        """
        import asyncio

        index = self._get_index()
        vectors: list[dict[str, Any]] = []

        for chunk in chunks:
            if chunk.embedding is None:
                continue

            metadata = {
                "content": chunk.content[:40960],  # Pinecone 40KB limit
                "document_id": chunk.document_id,
                "source": chunk.metadata.source,
                "file_name": chunk.metadata.file_name,
                "chunk_index": chunk.chunk_index,
                "token_count": chunk.token_count,
            }
            if chunk.parent_id:
                metadata["parent_id"] = chunk.parent_id

            vec: dict[str, Any] = {
                "id": chunk.id,
                "values": chunk.embedding,
                "metadata": metadata,
            }

            if chunk.sparse_embedding:
                vec["sparse_values"] = {
                    "indices": list(chunk.sparse_embedding.keys()),
                    "values": list(chunk.sparse_embedding.values()),
                }

            vectors.append(vec)

        loop = asyncio.get_running_loop()
        for i in range(0, len(vectors), self._batch_size):
            batch = vectors[i: i + self._batch_size]
            await loop.run_in_executor(
                None,
                lambda b=batch: index.upsert(
                    vectors=b, namespace=self._namespace
                ),
            )

        logger.info(
            "pinecone_upsert_complete",
            index=self._index_name,
            vectors=len(vectors),
        )
        return [v["id"] for v in vectors]

    @trace_operation(LifecycleStage.RETRIEVE, "pinecone_search")
    async def search(
        self,
        query_embedding: list[float],
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
    ) -> list[RetrievalResult]:
        """Dense vector search.

        Args:
            query_embedding: Dense query vector.
            top_k: Maximum results.
            filters: Pinecone metadata filters.

        Returns:
            Scored results.
        """
        import asyncio

        index = self._get_index()
        kwargs: dict[str, Any] = {
            "vector": query_embedding,
            "top_k": top_k,
            "include_metadata": True,
            "namespace": self._namespace,
        }
        if filters:
            kwargs["filter"] = filters

        results = await asyncio.get_running_loop().run_in_executor(
            None, lambda: index.query(**kwargs)
        )

        return [self._match_to_result(m, "dense") for m in results.matches]

    @trace_operation(LifecycleStage.RETRIEVE, "pinecone_hybrid_search")
    async def hybrid_search(
        self,
        query_embedding: list[float],
        sparse_vector: SparseVector,
        top_k: int = 10,
        alpha: float = 0.5,
        filters: dict[str, Any] | None = None,
        query_text: str | None = None,
    ) -> list[RetrievalResult]:
        """Hybrid dense + sparse search.

        Args:
            query_embedding: Dense query vector.
            sparse_vector: Sparse query vector.
            top_k: Maximum results.
            alpha: Dense weight (1 − alpha = sparse weight).
            filters: Metadata filters.

        Returns:
            Fused scored results.
        """
        import asyncio

        index = self._get_index()

        # Scale vectors by alpha weights
        dense_scaled = [v * alpha for v in query_embedding]
        sparse_scaled_values = [v * (1 - alpha) for v in sparse_vector.values]

        kwargs: dict[str, Any] = {
            "vector": dense_scaled,
            "sparse_vector": {
                "indices": sparse_vector.indices,
                "values": sparse_scaled_values,
            },
            "top_k": top_k,
            "include_metadata": True,
            "namespace": self._namespace,
        }
        if filters:
            kwargs["filter"] = filters

        results = await asyncio.get_running_loop().run_in_executor(
            None, lambda: index.query(**kwargs)
        )

        return [self._match_to_result(m, "hybrid") for m in results.matches]

    @trace_operation(LifecycleStage.UPSERT, "pinecone_delete")
    async def delete(self, ids: list[str]) -> None:
        """Delete vectors by ID."""
        import asyncio

        index = self._get_index()
        await asyncio.get_running_loop().run_in_executor(
            None, lambda: index.delete(ids=ids, namespace=self._namespace)
        )
        logger.info("pinecone_delete_complete", count=len(ids))

    async def count(self) -> int:
        """Return total vector count."""
        import asyncio

        index = self._get_index()
        stats = await asyncio.get_running_loop().run_in_executor(
            None, lambda: index.describe_index_stats()
        )
        ns_stats = stats.namespaces.get(self._namespace or "", None)
        return ns_stats.vector_count if ns_stats else stats.total_vector_count

    @trace_operation(LifecycleStage.UPSERT, "pinecone_delete_by_metadata")
    async def delete_by_metadata(self, key: str, value: Any) -> None:
        """Delete vectors matching a specific metadata key/value filter."""
        import asyncio
        index = self._get_index()
        await asyncio.get_running_loop().run_in_executor(
            None, lambda: index.delete(filter={key: value}, namespace=self._namespace)
        )
        logger.info("pinecone_delete_by_metadata_complete", key=key, value=value)

    @trace_operation(LifecycleStage.RETRIEVE, "pinecone_list_chunks")
    async def list_chunks(self, limit: int = 10000) -> list[Chunk]:
        """List chunks stored in the vector store collection up to a limit."""
        import asyncio
        index = self._get_index()
        
        try:
            loop = asyncio.get_running_loop()
            # list returns a generator of IDs in the namespace
            results = await loop.run_in_executor(
                None,
                lambda: list(index.list(namespace=self._namespace, limit=min(limit, 100)))
            )
            
            if not results:
                return []
                
            fetch_res = await loop.run_in_executor(
                None,
                lambda: index.fetch(ids=results, namespace=self._namespace)
            )
            
            chunks = []
            for match_id, match in fetch_res.vectors.items():
                # match_to_result expects a class with id, score, metadata
                class DummyMatch:
                    id = match.id
                    score = 0.0
                    metadata = match.metadata
                res = self._match_to_result(DummyMatch(), "list")
                chunks.append(res.chunk)
            return chunks
        except Exception as exc:
            logger.warning("pinecone_list_chunks_not_supported_or_failed", error=str(exc))
            return []

    @trace_operation(LifecycleStage.RETRIEVE, "pinecone_get_by_id")
    async def get_by_id(self, id: str) -> Chunk | None:
        """Retrieve a single chunk by its unique ID."""
        import asyncio
        index = self._get_index()
        try:
            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(
                None,
                lambda: index.fetch(ids=[id], namespace=self._namespace)
            )
            if response and response.vectors and id in response.vectors:
                match = response.vectors[id]
                class DummyMatch:
                    id = match.id
                    score = 0.0
                    metadata = match.metadata
                res = self._match_to_result(DummyMatch(), "fetch")
                return res.chunk
        except Exception as exc:
            logger.debug("pinecone_get_by_id_failed", id=id, error=str(exc))
        return None

    async def close(self) -> None:
        """Release resources."""
        self._index = None
        self._pc = None

    # ── Internal ─────────────────────────────────────────────────────

    @staticmethod
    def _match_to_result(match: Any, method: str) -> RetrievalResult:
        """Convert a Pinecone match to a RetrievalResult."""
        metadata = match.metadata or {}
        doc_meta = DocumentMetadata(
            source=metadata.get("source", ""),
            file_name=metadata.get("file_name", ""),
        )
        chunk = Chunk(
            id=match.id,
            content=metadata.get("content", ""),
            document_id=metadata.get("document_id", ""),
            metadata=doc_meta,
            parent_id=metadata.get("parent_id"),
            chunk_index=metadata.get("chunk_index", 0),
            token_count=metadata.get("token_count", 0),
        )
        return RetrievalResult(
            chunk=chunk,
            score=match.score,
            retrieval_method=method,
        )

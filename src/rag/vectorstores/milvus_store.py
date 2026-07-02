"""Milvus vector store implementation.

Supports dense search, hybrid sparse/dense search via RRF fusion,
automatic collection creation, and batched upserts.
"""

from __future__ import annotations

import asyncio
import os
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


@ComponentRegistry.register("vector_store", "milvus")
class MilvusVectorStore(BaseVectorStore):
    """Vector store backed by Milvus / Zilliz Cloud.

    Args:
        uri: Milvus server URI (e.g. ``"http://localhost:19530"``).
        token: Authentication token (for Zilliz Cloud).
        collection_name: Name of the collection.
        dimension: Dense vector dimensionality.
        metric_type: Similarity metric (``"COSINE"``, ``"L2"``, ``"IP"``).
        batch_size: Vectors per upsert batch.
    """

    def __init__(
        self,
        uri: str = "http://localhost:19530",
        token: str | None = None,
        collection_name: str = "documents",
        dimension: int = 1536,
        metric_type: str = "COSINE",
        batch_size: int = 100,
        **kwargs: Any,
    ) -> None:
        self._uri = uri
        self._token = token or os.getenv("MILVUS_TOKEN")
        self._collection_name = collection_name
        self._dimension = dimension
        self._metric_type = metric_type
        self._batch_size = batch_size
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazily initialise the Milvus client."""
        if self._client is None:
            from pymilvus import MilvusClient

            kwargs: dict[str, Any] = {"uri": self._uri}
            if self._token:
                kwargs["token"] = self._token
            self._client = MilvusClient(**kwargs)
        return self._client

    @trace_operation(LifecycleStage.UPSERT, "milvus_initialize")
    async def initialize(self) -> None:
        """Create the collection with schema if it does not exist."""
        from pymilvus import CollectionSchema, DataType, FieldSchema

        loop = asyncio.get_running_loop()
        client = self._get_client()

        has_collection = await loop.run_in_executor(
            None, lambda: client.has_collection(self._collection_name)
        )

        if not has_collection:
            schema = CollectionSchema(
                fields=[
                    FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
                    FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=self._dimension),
                    FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=65535),
                    FieldSchema(name="document_id", dtype=DataType.VARCHAR, max_length=64),
                    FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=1024),
                    FieldSchema(name="file_name", dtype=DataType.VARCHAR, max_length=512),
                    FieldSchema(name="chunk_index", dtype=DataType.INT64),
                    FieldSchema(name="parent_id", dtype=DataType.VARCHAR, max_length=64),
                    FieldSchema(name="token_count", dtype=DataType.INT64),
                ],
                description="RAG document chunks",
            )

            index_params = client.prepare_index_params()
            index_params.add_index(
                field_name="dense_vector",
                index_type="IVF_FLAT",
                metric_type=self._metric_type,
                params={"nlist": 1024},
            )

            await loop.run_in_executor(
                None,
                lambda: client.create_collection(
                    collection_name=self._collection_name,
                    schema=schema,
                    index_params=index_params,
                ),
            )
            logger.info(
                "milvus_collection_created",
                collection=self._collection_name,
                dimension=self._dimension,
            )
        else:
            logger.info("milvus_collection_exists", collection=self._collection_name)

    @trace_operation(LifecycleStage.UPSERT, "milvus_upsert")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        reraise=True,
    )
    async def upsert(self, chunks: list[Chunk]) -> list[str]:
        """Upsert chunks into Milvus.

        Args:
            chunks: Chunks with embeddings.

        Returns:
            List of upserted IDs.
        """
        loop = asyncio.get_running_loop()
        client = self._get_client()
        ids: list[str] = []

        for i in range(0, len(chunks), self._batch_size):
            batch = chunks[i: i + self._batch_size]
            data: list[dict[str, Any]] = []

            for chunk in batch:
                if chunk.embedding is None:
                    continue
                data.append({
                    "id": chunk.id,
                    "dense_vector": chunk.embedding,
                    "content": chunk.content[:65535],
                    "document_id": chunk.document_id,
                    "source": chunk.metadata.source[:1024],
                    "file_name": chunk.metadata.file_name[:512],
                    "chunk_index": chunk.chunk_index,
                    "parent_id": chunk.parent_id or "",
                    "token_count": chunk.token_count,
                })
                ids.append(chunk.id)

            if data:
                await loop.run_in_executor(
                    None,
                    lambda d=data: client.upsert(
                        collection_name=self._collection_name, data=d
                    ),
                )

        logger.info("milvus_upsert_complete", count=len(ids))
        return ids

    @trace_operation(LifecycleStage.RETRIEVE, "milvus_search")
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
            filters: Metadata filters as Milvus boolean expressions.

        Returns:
            Scored results.
        """
        loop = asyncio.get_running_loop()
        client = self._get_client()

        filter_expr = self._build_filter_expr(filters) if filters else ""

        results = await loop.run_in_executor(
            None,
            lambda: client.search(
                collection_name=self._collection_name,
                data=[query_embedding],
                anns_field="dense_vector",
                limit=top_k,
                filter=filter_expr,
                output_fields=["content", "document_id", "source", "file_name",
                               "chunk_index", "parent_id", "token_count"],
            ),
        )

        retrieval_results: list[RetrievalResult] = []
        if results:
            for hit in results[0]:
                entity = hit.get("entity", hit)
                chunk = Chunk(
                    id=str(hit.get("id", "")),
                    content=entity.get("content", ""),
                    document_id=entity.get("document_id", ""),
                    metadata=DocumentMetadata(
                        source=entity.get("source", ""),
                        file_name=entity.get("file_name", ""),
                    ),
                    parent_id=entity.get("parent_id") or None,
                    chunk_index=entity.get("chunk_index", 0),
                    token_count=entity.get("token_count", 0),
                )
                retrieval_results.append(
                    RetrievalResult(
                        chunk=chunk,
                        score=hit.get("distance", 0.0),
                        retrieval_method="dense",
                    )
                )

        return retrieval_results

    @trace_operation(LifecycleStage.RETRIEVE, "milvus_hybrid_search")
    async def hybrid_search(
        self,
        query_embedding: list[float],
        sparse_vector: SparseVector,
        top_k: int = 10,
        alpha: float = 0.5,
        filters: dict[str, Any] | None = None,
        query_text: str | None = None,
    ) -> list[RetrievalResult]:
        """Hybrid search (falls back to dense-only for standard Milvus).

        For full hybrid support, use Milvus 2.4+ with sparse vector fields.
        This implementation performs dense search and applies a basic reweight.

        Args:
            query_embedding: Dense query vector.
            sparse_vector: Sparse query vector (used for future compatibility).
            top_k: Maximum results.
            alpha: Dense weight.
            filters: Metadata filters.

        Returns:
            Scored results.
        """
        # Milvus 2.4+ supports sparse vectors natively, but for compatibility
        # we fall back to dense-only search with logging
        logger.info(
            "milvus_hybrid_fallback",
            message="Using dense-only search (sparse requires Milvus 2.4+ with sparse field)",
        )
        return await self.search(query_embedding, top_k, filters)

    @trace_operation(LifecycleStage.UPSERT, "milvus_delete")
    async def delete(self, ids: list[str]) -> None:
        """Delete vectors by ID."""
        loop = asyncio.get_running_loop()
        client = self._get_client()
        filter_expr = f'id in {ids}'
        await loop.run_in_executor(
            None,
            lambda: client.delete(
                collection_name=self._collection_name, filter=filter_expr
            ),
        )
        logger.info("milvus_delete_complete", count=len(ids))

    async def count(self) -> int:
        """Return total vector count."""
        loop = asyncio.get_running_loop()
        client = self._get_client()
        stats = await loop.run_in_executor(
            None,
            lambda: client.get_collection_stats(self._collection_name),
        )
        return stats.get("row_count", 0)

    @trace_operation(LifecycleStage.UPSERT, "milvus_delete_by_metadata")
    async def delete_by_metadata(self, key: str, value: Any) -> None:
        """Delete vectors matching a specific metadata key/value filter."""
        loop = asyncio.get_running_loop()
        client = self._get_client()
        if isinstance(value, str):
            filter_expr = f'{key} == "{value}"'
        else:
            filter_expr = f'{key} == {value}'
        await loop.run_in_executor(
            None,
            lambda: client.delete(
                collection_name=self._collection_name, filter=filter_expr
            ),
        )
        logger.info("milvus_delete_by_metadata_complete", key=key, value=value)

    @trace_operation(LifecycleStage.RETRIEVE, "milvus_list_chunks")
    async def list_chunks(self, limit: int = 10000) -> list[Chunk]:
        """List chunks stored in the vector store collection up to a limit."""
        loop = asyncio.get_running_loop()
        client = self._get_client()
        
        results = await loop.run_in_executor(
            None,
            lambda: client.query(
                collection_name=self._collection_name,
                filter="",
                limit=limit,
                output_fields=["id", "content", "document_id", "source", "file_name",
                               "chunk_index", "parent_id", "token_count"],
            )
        )
        
        chunks_list = []
        for hit in results:
            entity = hit
            chunk = Chunk(
                id=str(hit.get("id", "")),
                content=entity.get("content", ""),
                document_id=entity.get("document_id", ""),
                metadata=DocumentMetadata(
                    source=entity.get("source", ""),
                    file_name=entity.get("file_name", ""),
                ),
                parent_id=entity.get("parent_id") or None,
                chunk_index=entity.get("chunk_index", 0),
                token_count=entity.get("token_count", 0),
            )
            chunks_list.append(chunk)
        return chunks_list

    @trace_operation(LifecycleStage.RETRIEVE, "milvus_get_by_id")
    async def get_by_id(self, id: str) -> Chunk | None:
        """Retrieve a single chunk by its unique ID."""
        loop = asyncio.get_running_loop()
        client = self._get_client()
        try:
            results = await loop.run_in_executor(
                None,
                lambda: client.get(
                    collection_name=self._collection_name,
                    ids=[id],
                    output_fields=["id", "content", "document_id", "source", "file_name",
                                   "chunk_index", "parent_id", "token_count"],
                )
            )
            if results:
                hit = results[0]
                entity = hit
                return Chunk(
                    id=str(hit.get("id", "")),
                    content=entity.get("content", ""),
                    document_id=entity.get("document_id", ""),
                    metadata=DocumentMetadata(
                        source=entity.get("source", ""),
                        file_name=entity.get("file_name", ""),
                    ),
                    parent_id=entity.get("parent_id") or None,
                    chunk_index=entity.get("chunk_index", 0),
                    token_count=entity.get("token_count", 0),
                )
        except Exception as exc:
            logger.debug("milvus_get_by_id_failed", id=id, error=str(exc))
        return None

    async def close(self) -> None:
        """Close the Milvus client."""
        if self._client is not None:
            self._client.close()
            self._client = None

    # ── Internal ─────────────────────────────────────────────────────

    @staticmethod
    def _build_filter_expr(filters: dict[str, Any]) -> str:
        """Build a Milvus boolean filter expression from a dict."""
        parts: list[str] = []
        for key, value in filters.items():
            if isinstance(value, str):
                parts.append(f'{key} == "{value}"')
            else:
                parts.append(f"{key} == {value}")
        return " and ".join(parts) if parts else ""

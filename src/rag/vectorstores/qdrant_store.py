"""Qdrant vector store implementation.

Supports dense search, native sparse/dense hybrid search, metadata
filtering, and automatic collection creation with configurable distance metrics.
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
from ..core.types import Chunk, LifecycleStage, RetrievalResult, SparseVector
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("vector_store", "qdrant")
class QdrantVectorStore(BaseVectorStore):
    """Vector store backed by Qdrant.

    Features native sparse/dense hybrid search, payload-based metadata
    filtering, and automatic collection provisioning.

    Args:
        url: Qdrant server URL (e.g. ``"http://localhost:6333"``).
        api_key: Optional API key for Qdrant Cloud.
        collection_name: Name of the vector collection.
        vector_size: Dimensionality of dense vectors.
        distance: Distance metric (``"cosine"``, ``"euclid"``, ``"dot"``).
        sparse_vector_name: Name for the sparse vector field (hybrid search).
        on_disk: Whether to store vectors on disk.
        prefer_grpc: Whether to prefer gRPC over HTTP.
    """

    def __init__(
        self,
        url: str = "http://localhost:6333",
        api_key: str | None = None,
        collection_name: str = "documents",
        vector_size: int = 1536,
        distance: str = "cosine",
        sparse_vector_name: str = "sparse",
        on_disk: bool = False,
        prefer_grpc: bool = True,
        **kwargs: Any,
    ) -> None:
        self._url = url
        self._api_key = api_key
        self._collection_name = collection_name
        self._vector_size = vector_size
        self._distance = distance
        self._sparse_vector_name = sparse_vector_name
        self._on_disk = on_disk
        self._prefer_grpc = prefer_grpc
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazily initialise the async Qdrant client."""
        if self._client is None:
            from qdrant_client import AsyncQdrantClient

            kwargs: dict[str, Any] = {}
            if self._url.startswith("http://") or self._url.startswith("https://"):
                kwargs["url"] = self._url
                kwargs["prefer_grpc"] = self._prefer_grpc
            elif self._url == ":memory:":
                kwargs["location"] = ":memory:"
            else:
                # Treat self._url as a local database directory path for serverless Qdrant
                kwargs["path"] = self._url

            if self._api_key:
                kwargs["api_key"] = self._api_key

            self._client = AsyncQdrantClient(**kwargs)
        return self._client


    @trace_operation(LifecycleStage.UPSERT, "qdrant_initialize")
    async def initialize(self) -> None:
        """Create the collection if it does not exist."""
        from qdrant_client.models import (
            Distance,
            SparseIndexParams,
            SparseVectorParams,
            VectorParams,
        )

        client = self._get_client()

        distance_map = {
            "cosine": Distance.COSINE,
            "euclid": Distance.EUCLID,
            "dot": Distance.DOT,
        }
        qdrant_distance = distance_map.get(self._distance, Distance.COSINE)

        collections = await client.get_collections()
        existing_names = [c.name for c in collections.collections]

        if self._collection_name not in existing_names:
            await client.create_collection(
                collection_name=self._collection_name,
                vectors_config=VectorParams(
                    size=self._vector_size,
                    distance=qdrant_distance,
                    on_disk=self._on_disk,
                ),
                sparse_vectors_config={
                    self._sparse_vector_name: SparseVectorParams(
                        index=SparseIndexParams(on_disk=self._on_disk),
                    )
                },
            )
            logger.info(
                "qdrant_collection_created",
                collection=self._collection_name,
                vector_size=self._vector_size,
                distance=self._distance,
            )
        else:
            logger.info(
                "qdrant_collection_exists",
                collection=self._collection_name,
            )

    @trace_operation(LifecycleStage.UPSERT, "qdrant_upsert")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        reraise=True,
    )
    async def upsert(self, chunks: list[Chunk]) -> list[str]:
        """Upsert chunks into Qdrant.

        Args:
            chunks: Chunks with embeddings attached.

        Returns:
            List of upserted IDs.
        """
        from qdrant_client.models import PointStruct, SparseVector as QdrantSparseVector

        client = self._get_client()
        points: list[PointStruct] = []

        for chunk in chunks:
            if chunk.embedding is None:
                logger.warning(
                    "qdrant_skip_no_embedding", chunk_id=chunk.id
                )
                continue

            payload = {
                "content": chunk.content,
                "document_id": chunk.document_id,
                "chunk_index": chunk.chunk_index,
                "source": chunk.metadata.source,
                "file_name": chunk.metadata.file_name,
                "file_type": chunk.metadata.file_type,
                "language": chunk.metadata.language,
                "page_number": chunk.metadata.page_number,
                "total_pages": chunk.metadata.total_pages,
                "parent_id": chunk.parent_id,
                "token_count": chunk.token_count,
                **chunk.metadata.custom,
            }

            vectors: dict[str, Any] = {"": chunk.embedding}

            if chunk.sparse_embedding:
                indices = list(chunk.sparse_embedding.keys())
                values = list(chunk.sparse_embedding.values())
                vectors[self._sparse_vector_name] = QdrantSparseVector(
                    indices=indices, values=values
                )

            points.append(
                PointStruct(
                    id=chunk.id,
                    vector=vectors,
                    payload=payload,
                )
            )

        if points:
            # Batch upsert in groups of 100
            batch_size = 100
            for i in range(0, len(points), batch_size):
                batch = points[i: i + batch_size]
                await client.upsert(
                    collection_name=self._collection_name,
                    points=batch,
                )

        logger.info(
            "qdrant_upsert_complete",
            collection=self._collection_name,
            points=len(points),
        )
        return [p.id for p in points]

    @trace_operation(LifecycleStage.RETRIEVE, "qdrant_search")
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
            filters: Metadata filters.

        Returns:
            Scored results.
        """
        client = self._get_client()
        query_filter = self._build_filter(filters) if filters else None

        results = await client.query_points(
            collection_name=self._collection_name,
            query=query_embedding,
            limit=top_k,
            query_filter=query_filter,
            with_payload=True,
        )

        return [self._point_to_result(hit, "dense") for hit in results.points]

    @trace_operation(LifecycleStage.RETRIEVE, "qdrant_hybrid_search")
    async def hybrid_search(
        self,
        query_embedding: list[float],
        sparse_vector: SparseVector,
        top_k: int = 10,
        alpha: float = 0.5,
        filters: dict[str, Any] | None = None,
    ) -> list[RetrievalResult]:
        """Hybrid dense + sparse search using Qdrant's query API.

        Args:
            query_embedding: Dense query vector.
            sparse_vector: Sparse query vector.
            top_k: Maximum results.
            alpha: Weight for dense scores (1 − alpha for sparse).
            filters: Metadata filters.

        Returns:
            Fused scored results.
        """
        from qdrant_client.models import (
            FusionQuery,
            Prefetch,
            QueryRequest,
            SparseVector as QdrantSparseVector,
        )

        client = self._get_client()
        query_filter = self._build_filter(filters) if filters else None

        # Use Qdrant's native prefetch + fusion for hybrid search
        prefetch = [
            Prefetch(
                query=query_embedding,
                using="",
                limit=top_k * 2,
                filter=query_filter,
            ),
            Prefetch(
                query=QdrantSparseVector(
                    indices=sparse_vector.indices,
                    values=sparse_vector.values,
                ),
                using=self._sparse_vector_name,
                limit=top_k * 2,
                filter=query_filter,
            ),
        ]

        results = await client.query_points(
            collection_name=self._collection_name,
            prefetch=prefetch,
            query=FusionQuery(fusion="rrf"),
            limit=top_k,
            with_payload=True,
        )

        return [
            self._point_to_result(hit, "hybrid")
            for hit in results.points
        ]

    @trace_operation(LifecycleStage.UPSERT, "qdrant_delete")
    async def delete(self, ids: list[str]) -> None:
        """Delete vectors by ID.

        Args:
            ids: Vector IDs to remove.
        """
        from qdrant_client.models import PointIdsList

        client = self._get_client()
        await client.delete(
            collection_name=self._collection_name,
            points_selector=PointIdsList(points=ids),
        )
        logger.info("qdrant_delete_complete", count=len(ids))

    async def count(self) -> int:
        """Return total vector count in the collection."""
        client = self._get_client()
        info = await client.get_collection(self._collection_name)
        return info.points_count or 0

    @trace_operation(LifecycleStage.UPSERT, "qdrant_delete_by_metadata")
    async def delete_by_metadata(self, key: str, value: Any) -> None:
        """Delete vectors matching a specific metadata key/value filter."""
        from qdrant_client.models import FilterSelector, Filter, FieldCondition, MatchValue
        client = self._get_client()
        await client.delete(
            collection_name=self._collection_name,
            points_selector=FilterSelector(
                filter=Filter(
                    must=[
                        FieldCondition(
                            key=key,
                            match=MatchValue(value=value)
                        )
                    ]
                )
            )
        )
        logger.info("qdrant_delete_by_metadata_complete", key=key, value=value)

    @trace_operation(LifecycleStage.RETRIEVE, "qdrant_list_chunks")
    async def list_chunks(self, limit: int = 10000) -> list[Chunk]:
        """List chunks stored in the vector store collection up to a limit."""
        client = self._get_client()
        chunks_list = []
        offset = None
        has_more = True
        
        while has_more:
            scroll_limit = min(limit - len(chunks_list), 1000) if limit else 1000
            if scroll_limit <= 0:
                break
                
            records, offset = await client.scroll(
                collection_name=self._collection_name,
                limit=scroll_limit,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )
            
            for record in records:
                class DummyHit:
                    id = record.id
                    payload = record.payload
                    score = 0.0
                
                res = self._point_to_result(DummyHit(), "scroll")
                chunks_list.append(res.chunk)
                
            if not offset or len(records) < scroll_limit or (limit and len(chunks_list) >= limit):
                has_more = False
                
        return chunks_list

    @trace_operation(LifecycleStage.RETRIEVE, "qdrant_list_chunks_by_metadata")
    async def list_chunks_by_metadata(
        self, key: str, value: Any, limit: int = 1000
    ) -> list[Chunk]:
        """List chunks matching a specific metadata filter using server-side filtering.

        Pushes filtering to Qdrant instead of loading all chunks and filtering in Python.

        Args:
            key: Metadata field name to filter on.
            value: Expected value for the metadata field.
            limit: Maximum number of chunks to return.

        Returns:
            List of matching chunks.
        """
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        client = self._get_client()
        chunks_list: list[Chunk] = []
        offset = None
        has_more = True

        scroll_filter = Filter(must=[
            FieldCondition(key=key, match=MatchValue(value=value))
        ])

        while has_more:
            scroll_limit = min(limit - len(chunks_list), 1000) if limit else 1000
            if scroll_limit <= 0:
                break

            records, offset = await client.scroll(
                collection_name=self._collection_name,
                scroll_filter=scroll_filter,
                limit=scroll_limit,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )

            for record in records:
                class DummyHit:
                    id = record.id
                    payload = record.payload
                    score = 0.0

                res = self._point_to_result(DummyHit(), "scroll_filtered")
                chunks_list.append(res.chunk)

            if not offset or len(records) < scroll_limit or (limit and len(chunks_list) >= limit):
                has_more = False

        return chunks_list

    async def get_unique_metadata_values(self, key: str, limit: int = 10000) -> list[str]:
        """Get unique values for a metadata field by scrolling through all records.

        Used by /api/documents to get the list of unique filenames without
        loading full payloads for grouping.

        Args:
            key: Metadata field name to collect unique values from.
            limit: Safety cap on total records scanned.

        Returns:
            List of unique string values.
        """
        client = self._get_client()
        unique_values: set[str] = set()
        offset = None
        has_more = True
        scanned = 0

        while has_more:
            scroll_limit = min(limit - scanned, 1000)
            if scroll_limit <= 0:
                break

            records, offset = await client.scroll(
                collection_name=self._collection_name,
                limit=scroll_limit,
                offset=offset,
                with_payload=[key],  # Only fetch the one field we need
                with_vectors=False,
            )

            for record in records:
                val = (record.payload or {}).get(key)
                if val:
                    unique_values.add(str(val))

            scanned += len(records)
            if not offset or len(records) < scroll_limit:
                has_more = False

        return list(unique_values)

    @trace_operation(LifecycleStage.RETRIEVE, "qdrant_get_by_id")
    async def get_by_id(self, id: str) -> Chunk | None:
        """Retrieve a single chunk by its unique ID."""
        client = self._get_client()
        try:
            records = await client.retrieve(
                collection_name=self._collection_name,
                ids=[id],
                with_payload=True,
                with_vectors=False,
            )
            if records:
                class DummyHit:
                    id = records[0].id
                    payload = records[0].payload
                    score = 0.0
                res = self._point_to_result(DummyHit(), "retrieve")
                return res.chunk
        except Exception as exc:
            logger.debug("qdrant_get_by_id_failed", id=id, error=str(exc))
        return None

    async def close(self) -> None:
        """Close the Qdrant client."""
        if self._client is not None:
            await self._client.close()
            self._client = None

    # ── Internal ─────────────────────────────────────────────────────

    @staticmethod
    def _build_filter(filters: dict[str, Any]) -> Any:
        """Convert a flat dict of filters to a Qdrant Filter."""
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        conditions = []
        for key, value in filters.items():
            conditions.append(
                FieldCondition(key=key, match=MatchValue(value=value))
            )
        return Filter(must=conditions) if conditions else None

    @staticmethod
    def _point_to_result(hit: Any, method: str) -> RetrievalResult:
        """Convert a Qdrant scored point to a RetrievalResult."""
        payload = hit.payload or {}
        from ..core.types import DocumentMetadata

        # De-serialize all extra payload fields back into custom or standard fields
        meta_dict = {
            "source": payload.get("source", ""),
            "file_name": payload.get("file_name", ""),
            "file_type": payload.get("file_type", ""),
            "language": payload.get("language", "en"),
        }
        if "page_number" in payload:
            meta_dict["page_number"] = payload["page_number"]
        if "total_pages" in payload:
            meta_dict["total_pages"] = payload["total_pages"]
        if "created_at" in payload:
            try:
                from datetime import datetime
                meta_dict["created_at"] = datetime.fromisoformat(payload["created_at"])
            except Exception:
                pass

        custom = {}
        core_keys = {"content", "document_id", "chunk_index", "source", "file_name", "file_type", "language", "parent_id", "token_count", "page_number", "total_pages", "created_at"}
        for k, v in payload.items():
            if k not in core_keys:
                custom[k] = v
        meta_dict["custom"] = custom

        metadata = DocumentMetadata(**meta_dict)

        chunk = Chunk(
            id=str(hit.id),
            content=payload.get("content", ""),
            document_id=payload.get("document_id", ""),
            metadata=metadata,
            parent_id=payload.get("parent_id"),
            chunk_index=payload.get("chunk_index", 0),
            token_count=payload.get("token_count", 0),
        )

        return RetrievalResult(
            chunk=chunk,
            score=hit.score,
            retrieval_method=method,
        )

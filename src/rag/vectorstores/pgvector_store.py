"""pgvector (PostgreSQL) vector store implementation.

Uses asyncpg for fully async I/O with connection pooling, automatic
table creation, and hybrid search via cosine + tsvector full-text scoring.
"""

from __future__ import annotations

import json
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


@ComponentRegistry.register("vector_store", "pgvector")
class PgvectorStore(BaseVectorStore):
    """Vector store backed by PostgreSQL with the pgvector extension.

    Uses asyncpg for true async I/O and connection pooling.

    Args:
        dsn: PostgreSQL connection string.
        table_name: Name of the vectors table.
        dimension: Vector dimensionality.
        distance: Distance operator (``"cosine"``, ``"l2"``, ``"inner_product"``).
        pool_min_size: Minimum connections in the pool.
        pool_max_size: Maximum connections in the pool.
    """

    def __init__(
        self,
        dsn: str = "postgresql://localhost:5432/rag",
        table_name: str = "chunks",
        dimension: int = 1536,
        distance: str = "cosine",
        pool_min_size: int = 2,
        pool_max_size: int = 10,
        **kwargs: Any,
    ) -> None:
        self._dsn = dsn
        self._table_name = table_name
        self._dimension = dimension
        self._distance = distance
        self._pool_min_size = pool_min_size
        self._pool_max_size = pool_max_size
        self._pool: Any = None

        self._distance_ops = {
            "cosine": "<=>",
            "l2": "<->",
            "inner_product": "<#>",
        }

    async def _get_pool(self) -> Any:
        """Lazily initialise the asyncpg connection pool."""
        if self._pool is None:
            import asyncpg

            self._pool = await asyncpg.create_pool(
                dsn=self._dsn,
                min_size=self._pool_min_size,
                max_size=self._pool_max_size,
            )
        return self._pool

    @trace_operation(LifecycleStage.UPSERT, "pgvector_initialize")
    async def initialize(self) -> None:
        """Create the pgvector extension and chunks table if needed."""
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {self._table_name} (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    document_id TEXT NOT NULL,
                    embedding vector({self._dimension}),
                    metadata JSONB DEFAULT '{{}}',
                    parent_id TEXT,
                    chunk_index INTEGER DEFAULT 0,
                    token_count INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Create HNSW index for fast ANN search
            dist_op = self._distance_ops.get(self._distance, "<=>")
            ops_class = {
                "<=>": "vector_cosine_ops",
                "<->": "vector_l2_ops",
                "<#>": "vector_ip_ops",
            }.get(dist_op, "vector_cosine_ops")

            await conn.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{self._table_name}_embedding
                ON {self._table_name}
                USING hnsw (embedding {ops_class})
            """)

            # GIN index for full-text search (hybrid)
            await conn.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_{self._table_name}_content_fts
                ON {self._table_name}
                USING gin (to_tsvector('english', content))
            """)

        logger.info(
            "pgvector_initialized",
            table=self._table_name,
            dimension=self._dimension,
        )

    @trace_operation(LifecycleStage.UPSERT, "pgvector_upsert")
    @retry(
        retry=retry_if_exception_type((ConnectionError, OSError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=15),
        reraise=True,
    )
    async def upsert(self, chunks: list[Chunk]) -> list[str]:
        """Upsert chunks into PostgreSQL.

        Uses ``ON CONFLICT DO UPDATE`` for idempotent upserts.

        Args:
            chunks: Chunks with embeddings.

        Returns:
            List of upserted IDs.
        """
        pool = await self._get_pool()
        ids: list[str] = []

        async with pool.acquire() as conn:
            for chunk in chunks:
                if chunk.embedding is None:
                    continue

                metadata = {
                    "source": chunk.metadata.source,
                    "file_name": chunk.metadata.file_name,
                    "file_type": chunk.metadata.file_type,
                    "language": chunk.metadata.language,
                    **chunk.metadata.custom,
                }

                embedding_str = "[" + ",".join(str(v) for v in chunk.embedding) + "]"

                await conn.execute(
                    f"""
                    INSERT INTO {self._table_name}
                        (id, content, document_id, embedding, metadata,
                         parent_id, chunk_index, token_count)
                    VALUES ($1, $2, $3, $4::vector, $5::jsonb, $6, $7, $8)
                    ON CONFLICT (id) DO UPDATE SET
                        content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding,
                        metadata = EXCLUDED.metadata,
                        parent_id = EXCLUDED.parent_id,
                        chunk_index = EXCLUDED.chunk_index,
                        token_count = EXCLUDED.token_count
                    """,
                    chunk.id,
                    chunk.content,
                    chunk.document_id,
                    embedding_str,
                    json.dumps(metadata),
                    chunk.parent_id,
                    chunk.chunk_index,
                    chunk.token_count,
                )
                ids.append(chunk.id)

        logger.info("pgvector_upsert_complete", count=len(ids))
        return ids

    @trace_operation(LifecycleStage.RETRIEVE, "pgvector_search")
    async def search(
        self,
        query_embedding: list[float],
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
    ) -> list[RetrievalResult]:
        """Dense vector search using pgvector.

        Args:
            query_embedding: Dense query vector.
            top_k: Maximum results.
            filters: JSONB metadata filters.

        Returns:
            Scored results.
        """
        pool = await self._get_pool()
        dist_op = self._distance_ops.get(self._distance, "<=>")
        embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

        where_clause, params = self._build_where(filters, param_offset=2)

        query = f"""
            SELECT id, content, document_id, metadata, parent_id,
                   chunk_index, token_count,
                   1 - (embedding {dist_op} $1::vector) as score
            FROM {self._table_name}
            {where_clause}
            ORDER BY embedding {dist_op} $1::vector
            LIMIT $2
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, embedding_str, top_k, *params)

        return [self._row_to_result(row, "dense") for row in rows]

    @trace_operation(LifecycleStage.RETRIEVE, "pgvector_hybrid_search")
    async def hybrid_search(
        self,
        query_embedding: list[float],
        sparse_vector: SparseVector,
        top_k: int = 10,
        alpha: float = 0.5,
        filters: dict[str, Any] | None = None,
        query_text: str | None = None,
    ) -> list[RetrievalResult]:
        """Hybrid search combining vector similarity with PostgreSQL full-text ranking.

        Uses a SQL-level Reciprocal Rank Fusion (RRF) to combine results from
        the pgvector cosine index and pg_tsvector full-text index.

        Args:
            query_embedding: Dense query vector.
            sparse_vector: Not directly used; full-text search query is derived from query_text.
            top_k: Maximum results.
            alpha: Weight for dense rank (1 - alpha applied to sparse rank).
            filters: JSONB metadata filters.
            query_text: Raw query text used for full-text search.

        Returns:
            Fused scored results.
        """
        if not query_text or not query_text.strip():
            logger.info("pgvector_hybrid_fallback_dense", reason="empty_query_text")
            return await self.search(query_embedding, top_k, filters)

        pool = await self._get_pool()
        dist_op = self._distance_ops.get(self._distance, "<=>")
        embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

        where_clause, params = self._build_where(filters, param_offset=4)
        and_where_clause = where_clause.replace("WHERE", "AND", 1) if where_clause else ""

        # Using SQL CTEs to perform dense and sparse retrievals,
        # then FULL OUTER JOINing and scoring them using RRF formula.
        query = f"""
            WITH dense_results AS (
                SELECT id, content, document_id, metadata, parent_id,
                       chunk_index, token_count,
                       ROW_NUMBER() OVER (ORDER BY embedding {dist_op} $1::vector) as rank
                FROM {self._table_name}
                {where_clause}
                ORDER BY embedding {dist_op} $1::vector
                LIMIT $2 * 2
            ),
            sparse_results AS (
                SELECT id, content, document_id, metadata, parent_id,
                       chunk_index, token_count,
                       ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery('english', $3)) DESC) as rank
                FROM {self._table_name}
                WHERE to_tsvector('english', content) @@ websearch_to_tsquery('english', $3)
                {and_where_clause}
                ORDER BY ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery('english', $3)) DESC
                LIMIT $2 * 2
            ),
            fused AS (
                SELECT 
                    COALESCE(d.id, s.id) as id,
                    COALESCE(d.content, s.content) as content,
                    COALESCE(d.document_id, s.document_id) as document_id,
                    COALESCE(d.metadata, s.metadata) as metadata,
                    COALESCE(d.parent_id, s.parent_id) as parent_id,
                    COALESCE(d.chunk_index, s.chunk_index) as chunk_index,
                    COALESCE(d.token_count, s.token_count) as token_count,
                    (COALESCE(1.0 / (60.0 + d.rank), 0.0) * $4) + (COALESCE(1.0 / (60.0 + s.rank), 0.0) * (1.0 - $4)) as combined_score
                FROM dense_results d
                FULL OUTER JOIN sparse_results s ON d.id = s.id
            )
            SELECT * FROM fused
            ORDER BY combined_score DESC
            LIMIT $2
        """

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, embedding_str, top_k, query_text, alpha, *params)

        return [self._row_to_result(row, "hybrid") for row in rows]

    @trace_operation(LifecycleStage.UPSERT, "pgvector_delete")
    async def delete(self, ids: list[str]) -> None:
        """Delete vectors by ID."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                f"DELETE FROM {self._table_name} WHERE id = ANY($1)", ids
            )
        logger.info("pgvector_delete_complete", count=len(ids))

    async def count(self) -> int:
        """Return total row count."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"SELECT count(*) as cnt FROM {self._table_name}"
            )
            return row["cnt"] if row else 0

    @trace_operation(LifecycleStage.UPSERT, "pgvector_delete_by_metadata")
    async def delete_by_metadata(self, key: str, value: Any) -> None:
        """Delete vectors matching a specific metadata key/value filter."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                f"DELETE FROM {self._table_name} WHERE metadata->>'{key}' = $1", str(value)
            )
        logger.info("pgvector_delete_by_metadata_complete", key=key, value=value)

    @trace_operation(LifecycleStage.RETRIEVE, "pgvector_list_chunks")
    async def list_chunks(self, limit: int = 10000) -> list[Chunk]:
        """List chunks stored in the vector store collection up to a limit."""
        pool = await self._get_pool()
        query = f"""
            SELECT id, content, document_id, metadata, parent_id,
                   chunk_index, token_count
            FROM {self._table_name}
            LIMIT $1
        """
        async with pool.acquire() as conn:
            rows = await conn.fetch(query, limit)
            
        chunks_list = []
        for row in rows:
            res = self._row_to_result(row, "list")
            chunks_list.append(res.chunk)
        return chunks_list

    @trace_operation(LifecycleStage.RETRIEVE, "pgvector_get_by_id")
    async def get_by_id(self, id: str) -> Chunk | None:
        """Retrieve a single chunk by its unique ID."""
        pool = await self._get_pool()
        query = f"""
            SELECT id, content, document_id, metadata, parent_id,
                   chunk_index, token_count
            FROM {self._table_name}
            WHERE id = $1
        """
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(query, id)
                if row:
                    res = self._row_to_result(row, "fetch")
                    return res.chunk
        except Exception as exc:
            logger.debug("pgvector_get_by_id_failed", id=id, error=str(exc))
        return None

    async def close(self) -> None:
        """Close the connection pool."""
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    # ── Internal ─────────────────────────────────────────────────────

    @staticmethod
    def _build_where(
        filters: dict[str, Any] | None, param_offset: int
    ) -> tuple[str, list[Any]]:
        """Build a WHERE clause from JSONB filters."""
        if not filters:
            return "", []

        conditions: list[str] = []
        params: list[Any] = []
        idx = param_offset + 1

        for key, value in filters.items():
            conditions.append(f"metadata->>'{key}' = ${idx}")
            params.append(str(value))
            idx += 1

        where = "WHERE " + " AND ".join(conditions)
        return where, params

    @staticmethod
    def _row_to_result(row: Any, method: str) -> RetrievalResult:
        """Convert a database row to a RetrievalResult."""
        meta_dict = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else (row["metadata"] or {})
        metadata = DocumentMetadata(
            source=meta_dict.get("source", ""),
            file_name=meta_dict.get("file_name", ""),
            file_type=meta_dict.get("file_type", ""),
            language=meta_dict.get("language", "en"),
        )
        chunk = Chunk(
            id=row["id"],
            content=row["content"],
            document_id=row["document_id"],
            metadata=metadata,
            parent_id=row["parent_id"],
            chunk_index=row["chunk_index"],
            token_count=row["token_count"],
        )
        score = row.get("combined_score") or row.get("score") or 0.0
        return RetrievalResult(
            chunk=chunk,
            score=float(score),
            retrieval_method=method,
        )

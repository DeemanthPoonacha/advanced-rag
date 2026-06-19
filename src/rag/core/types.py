"""Core domain types for the RAG framework.

All shared data structures, enums, and value objects used across every layer
of the pipeline are defined here as strict Pydantic v2 models.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ─── Helpers ─────────────────────────────────────────────────────────────


def _uuid() -> str:
    """Generate a new UUID4 string."""
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    """Return the current UTC timestamp (timezone-aware)."""
    return datetime.now(timezone.utc)


# ─── Enums ───────────────────────────────────────────────────────────────


class DistanceMetric(str, Enum):
    """Supported vector distance/similarity metrics."""

    COSINE = "cosine"
    EUCLIDEAN = "euclidean"
    DOT_PRODUCT = "dot_product"


class ChunkingStrategy(str, Enum):
    """Available document chunking strategies."""

    SEMANTIC = "semantic"
    RECURSIVE = "recursive"
    HIERARCHICAL = "hierarchical"
    FIXED_SIZE = "fixed_size"


class RetrievalStrategy(str, Enum):
    """Available retrieval strategies."""

    SIMPLE = "simple"
    MULTI_QUERY = "multi_query"
    CONTEXTUAL_COMPRESSION = "contextual_compression"
    AUTO_MERGING = "auto_merging"


class LifecycleStage(str, Enum):
    """Pipeline lifecycle stages for observability tagging."""

    INGEST = "ingest"
    PARSE = "parse"
    CHUNK = "chunk"
    EMBED = "embed"
    UPSERT = "upsert"
    RETRIEVE = "retrieve"
    RERANK = "rerank"
    GENERATE = "generate"
    GUARDRAIL = "guardrail"
    EVALUATE = "evaluate"


# ─── Value Objects ───────────────────────────────────────────────────────


class DocumentMetadata(BaseModel):
    """Rich metadata attached to a parsed document."""

    model_config = {"extra": "allow"}

    source: str = ""
    file_name: str = ""
    file_type: str = ""
    page_number: int | None = None
    total_pages: int | None = None
    language: str = "en"
    created_at: datetime = Field(default_factory=_utcnow)
    custom: dict[str, Any] = Field(default_factory=dict)


class Document(BaseModel):
    """A parsed document before chunking."""

    id: str = Field(default_factory=_uuid)
    content: str
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)
    embedding: list[float] | None = None
    sparse_embedding: dict[int, float] | None = None

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Document content must not be empty or whitespace-only")
        return v


class Chunk(BaseModel):
    """A chunk derived from a Document, ready for embedding and vector storage."""

    id: str = Field(default_factory=_uuid)
    content: str
    document_id: str
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)
    embedding: list[float] | None = None
    sparse_embedding: dict[int, float] | None = None
    parent_id: str | None = None
    children_ids: list[str] = Field(default_factory=list)
    chunk_index: int = 0
    token_count: int = 0

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Chunk content must not be empty or whitespace-only")
        return v


class SparseVector(BaseModel):
    """Sparse vector representation for hybrid search (BOW / SPLADE)."""

    indices: list[int]
    values: list[float]

    @field_validator("values")
    @classmethod
    def lengths_must_match(cls, v: list[float], info: Any) -> list[float]:
        indices = info.data.get("indices", [])
        if len(v) != len(indices):
            raise ValueError(
                f"Sparse vector indices ({len(indices)}) and values ({len(v)}) "
                "must have the same length"
            )
        return v


class RetrievalResult(BaseModel):
    """A single retrieval result with scoring metadata."""

    chunk: Chunk
    score: float
    rerank_score: float | None = None
    retrieval_method: str = ""

    @property
    def effective_score(self) -> float:
        """Return the rerank score when available, otherwise the retrieval score."""
        return self.rerank_score if self.rerank_score is not None else self.score


class TokenUsage(BaseModel):
    """Token consumption statistics for a single LLM call."""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    model: str = ""


class GenerationResult(BaseModel):
    """Final output of a complete RAG query pipeline run."""

    answer: str
    sources: list[RetrievalResult] = Field(default_factory=list)
    token_usage: TokenUsage = Field(default_factory=TokenUsage)
    latency_ms: float = 0.0
    trace_id: str = Field(default_factory=_uuid)
    metadata: dict[str, Any] = Field(default_factory=dict)


class QueryContext(BaseModel):
    """Encapsulates all context needed for a retrieval query."""

    original_query: str
    expanded_queries: list[str] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)
    top_k: int = 10
    similarity_threshold: float = 0.0
    trace_id: str = Field(default_factory=_uuid)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GuardrailResult(BaseModel):
    """Result of a guardrail validation check."""

    is_safe: bool
    violation_category: str | None = None
    explanation: str | None = None
    confidence: float = 1.0


class EvaluationResult(BaseModel):
    """Result of an automated evaluation run."""

    metrics: dict[str, float] = Field(default_factory=dict)
    details: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=_utcnow)

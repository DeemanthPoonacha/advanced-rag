"""Abstract Base Classes defining the contract for every swappable component.

Each interface declares the async method signatures that concrete implementations
must fulfil.  No business logic lives here — this module is a pure contract layer.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

from pydantic import BaseModel

from .types import (
    Chunk,
    Document,
    EvaluationResult,
    GuardrailResult,
    QueryContext,
    RetrievalResult,
    SparseVector,
)


class BaseParser(ABC):
    """Parses raw file sources (paths or bytes) into structured Documents."""

    @abstractmethod
    async def parse(
        self,
        source: str | bytes,
        metadata: dict[str, Any] | None = None,
    ) -> list[Document]:
        """Parse a single source into one or more Documents.

        Args:
            source: A file path (str) or raw bytes to parse.
            metadata: Optional extra metadata to attach to each Document.

        Returns:
            A list of parsed Documents.
        """
        ...

    @abstractmethod
    async def parse_batch(
        self,
        sources: list[str | bytes],
        metadata: list[dict[str, Any]] | None = None,
    ) -> list[Document]:
        """Parse multiple sources concurrently.

        Args:
            sources: List of file paths or raw bytes.
            metadata: Per-source metadata dicts (must match ``sources`` length).

        Returns:
            Flat list of all parsed Documents.
        """
        ...

    async def close(self) -> None:
        """Release any held resources (API clients, file handles)."""


class BaseChunker(ABC):
    """Splits a Document into Chunks using a configurable strategy."""

    @abstractmethod
    async def chunk(self, document: Document) -> list[Chunk]:
        """Split a single Document into Chunks.

        Args:
            document: The document to chunk.

        Returns:
            Ordered list of Chunks derived from the document.
        """
        ...

    @abstractmethod
    async def chunk_batch(self, documents: list[Document]) -> list[Chunk]:
        """Split multiple Documents, returning a flat list of all Chunks.

        Args:
            documents: Documents to chunk.

        Returns:
            Flat list of all resulting Chunks.
        """
        ...


class BaseEmbeddingModel(ABC):
    """Produces dense (and optionally sparse) vector embeddings."""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of texts, returning one dense vector per text.

        Args:
            texts: Strings to embed.

        Returns:
            List of embedding vectors (same length as ``texts``).
        """
        ...

    @abstractmethod
    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query string.

        Some providers use different models / prefixes for queries vs documents.

        Args:
            query: The query text.

        Returns:
            A single embedding vector.
        """
        ...

    @property
    @abstractmethod
    def dimensions(self) -> int:
        """Dimensionality of the embedding vectors produced by this model."""
        ...

    async def embed_sparse(self, texts: list[str]) -> list[SparseVector]:
        """Produce sparse embeddings for hybrid search.

        Default implementation raises ``NotImplementedError`` — override in
        providers that support sparse representations (SPLADE, BOW, etc.).
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} does not support sparse embeddings"
        )

    async def close(self) -> None:
        """Release resources (HTTP clients, GPU memory)."""


class BaseLLM(ABC):
    """Unified interface for large-language-model inference."""

    @abstractmethod
    async def generate(self, prompt: str, **kwargs: Any) -> str:
        """Single-shot text completion.

        Args:
            prompt: The full prompt string.
            **kwargs: Provider-specific overrides (temperature, max_tokens, …).

        Returns:
            The generated text.
        """
        ...

    @abstractmethod
    async def generate_stream(
        self, prompt: str, **kwargs: Any
    ) -> AsyncIterator[str]:
        """Streaming completion yielding token chunks.

        Args:
            prompt: The full prompt string.
            **kwargs: Provider-specific overrides.

        Yields:
            Individual token strings as they arrive.
        """
        ...

    @abstractmethod
    async def generate_structured(
        self,
        prompt: str,
        output_schema: type[BaseModel],
        **kwargs: Any,
    ) -> BaseModel:
        """Completion that returns a validated Pydantic model.

        The provider should instruct the LLM to output JSON matching
        ``output_schema`` and validate the response.

        Args:
            prompt: The full prompt string.
            output_schema: The Pydantic model class to validate against.
            **kwargs: Provider-specific overrides.

        Returns:
            An instance of ``output_schema``.
        """
        ...

    async def close(self) -> None:
        """Release resources (HTTP sessions, gRPC channels)."""


class BaseVectorStore(ABC):
    """Interface for vector storage backends supporting dense + hybrid search."""

    @abstractmethod
    async def initialize(self) -> None:
        """Create collections / indexes if they do not already exist."""
        ...

    @abstractmethod
    async def upsert(self, chunks: list[Chunk]) -> list[str]:
        """Insert or update chunks, returning their IDs.

        Chunks must have ``embedding`` set before upserting.

        Args:
            chunks: Chunks with embeddings attached.

        Returns:
            List of upserted IDs.
        """
        ...

    @abstractmethod
    async def search(
        self,
        query_embedding: list[float],
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
    ) -> list[RetrievalResult]:
        """Dense-only vector search.

        Args:
            query_embedding: The query's dense embedding vector.
            top_k: Maximum results to return.
            filters: Optional metadata filters.

        Returns:
            Scored results sorted by descending similarity.
        """
        ...

    @abstractmethod
    async def hybrid_search(
        self,
        query_embedding: list[float],
        sparse_vector: SparseVector,
        top_k: int = 10,
        alpha: float = 0.5,
        filters: dict[str, Any] | None = None,
    ) -> list[RetrievalResult]:
        """Combined dense + sparse search with alpha-weighted fusion.

        Args:
            query_embedding: Dense query vector.
            sparse_vector: Sparse query vector.
            top_k: Maximum results to return.
            alpha: Weight for dense scores (1 − alpha applied to sparse).
            filters: Optional metadata filters.

        Returns:
            Fused scored results sorted by descending combined score.
        """
        ...

    @abstractmethod
    async def delete(self, ids: list[str]) -> None:
        """Delete vectors by ID.

        Args:
            ids: Vector IDs to remove.
        """
        ...

    @abstractmethod
    async def count(self) -> int:
        """Return total number of vectors in the collection."""
        ...

    @abstractmethod
    async def delete_by_metadata(self, key: str, value: Any) -> None:
        """Delete vectors matching a specific metadata key/value filter.

        Args:
            key: The metadata field key.
            value: The metadata field value to match.
        """
        ...

    @abstractmethod
    async def list_chunks(self, limit: int = 10000) -> list[Chunk]:
        """List chunks stored in the vector store collection up to a limit.

        Args:
            limit: Maximum number of chunks to return.

        Returns:
            A list of Chunk objects.
        """
        ...

    @abstractmethod
    async def get_by_id(self, id: str) -> Chunk | None:
        """Retrieve a single chunk by its unique ID.

        Args:
            id: The unique chunk ID string.

        Returns:
            The Chunk object if found, otherwise None.
        """
        ...

    @abstractmethod
    async def close(self) -> None:
        """Release connections and resources."""
        ...



class BaseRetriever(ABC):
    """Orchestrates a retrieval strategy (simple, multi-query, etc.)."""

    @abstractmethod
    async def retrieve(self, context: QueryContext) -> list[RetrievalResult]:
        """Execute the retrieval strategy.

        Args:
            context: Query context containing the query, filters, and settings.

        Returns:
            Ranked list of retrieval results.
        """
        ...


class BaseReranker(ABC):
    """Re-scores retrieval results using a cross-encoder or reranking API."""

    @abstractmethod
    async def rerank(
        self,
        query: str,
        results: list[RetrievalResult],
        top_n: int = 5,
    ) -> list[RetrievalResult]:
        """Rerank retrieval results and return the top N.

        Args:
            query: The original user query.
            results: Retrieval results to rerank.
            top_n: Number of results to return after reranking.

        Returns:
            Reranked results (highest-score first), truncated to ``top_n``.
        """
        ...

    async def close(self) -> None:
        """Release resources."""


class BaseGuardrail(ABC):
    """Input/output safety validation."""

    @abstractmethod
    async def validate(
        self,
        text: str,
        context: str | None = None,
    ) -> GuardrailResult:
        """Check whether text is safe according to the guardrail policy.

        Args:
            text: The text to validate.
            context: Optional surrounding context for output validation.

        Returns:
            A ``GuardrailResult`` indicating safety status.
        """
        ...


class BaseEvaluator(ABC):
    """Automated quality evaluation (Ragas / TruLens style)."""

    @abstractmethod
    async def evaluate(
        self,
        query: str,
        answer: str,
        contexts: list[str],
        ground_truth: str | None = None,
    ) -> EvaluationResult:
        """Evaluate a RAG response against quality metrics.

        Args:
            query: The user's original question.
            answer: The generated answer.
            contexts: Retrieved context passages used for generation.
            ground_truth: Optional ground-truth answer for reference-based metrics.

        Returns:
            An ``EvaluationResult`` with computed metric scores.
        """
        ...

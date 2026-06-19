"""Semantic chunker — splits documents at natural topic boundaries.

Uses an embedding model to detect semantic shifts between sentences,
splitting where the cosine similarity drops below a configurable threshold.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any

import numpy as np
import structlog

from ...core.interfaces import BaseChunker, BaseEmbeddingModel
from ...core.registry import ComponentRegistry
from ...core.types import Chunk, Document, LifecycleStage
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences using a regex-based heuristic.

    Handles abbreviations, decimal numbers, and common edge cases.
    """
    pattern = r"(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|!)\s+"
    sentences = re.split(pattern, text)
    return [s.strip() for s in sentences if s.strip()]


@ComponentRegistry.register("chunker", "semantic")
class SemanticChunker(BaseChunker):
    """Splits documents at semantic boundaries detected by embedding similarity.

    The algorithm:
    1. Split the document into sentences.
    2. Embed each sentence using the configured embedding model.
    3. Compute pairwise cosine similarity between consecutive sentences.
    4. Split at positions where similarity drops below ``breakpoint_threshold``.
    5. Merge small chunks and split oversized chunks to respect size limits.

    Args:
        embedding_model: The embedding model for sentence-level similarity.
        breakpoint_threshold: Cosine similarity threshold below which a split occurs.
        max_chunk_size: Maximum chunk size in characters.
        min_chunk_size: Minimum chunk size in characters (smaller chunks are merged).
        buffer_size: Number of sentences to consider on each side of a breakpoint.
    """

    def __init__(
        self,
        embedding_model: BaseEmbeddingModel | None = None,
        breakpoint_threshold: float = 0.7,
        max_chunk_size: int = 1024,
        min_chunk_size: int = 128,
        buffer_size: int = 1,
        **kwargs: Any,
    ) -> None:
        self._embedding_model = embedding_model
        self._breakpoint_threshold = breakpoint_threshold
        self._max_chunk_size = max_chunk_size
        self._min_chunk_size = min_chunk_size
        self._buffer_size = buffer_size

    def set_embedding_model(self, model: BaseEmbeddingModel) -> None:
        """Inject the embedding model after construction (for DI)."""
        self._embedding_model = model

    @trace_operation(LifecycleStage.CHUNK, "semantic_chunk")
    async def chunk(self, document: Document) -> list[Chunk]:
        """Split a document into semantically coherent chunks.

        Args:
            document: The document to split.

        Returns:
            Ordered list of Chunks.
        """
        if self._embedding_model is None:
            raise RuntimeError(
                "SemanticChunker requires an embedding model. "
                "Call set_embedding_model() or pass it in the constructor."
            )

        sentences = _split_sentences(document.content)
        if not sentences:
            return []

        if len(sentences) == 1:
            return [
                Chunk(
                    content=sentences[0],
                    document_id=document.id,
                    metadata=document.metadata.model_copy(),
                    chunk_index=0,
                    token_count=len(sentences[0].split()),
                )
            ]

        # Embed all sentences in batches
        embeddings = await self._embedding_model.embed(sentences)
        emb_array = np.array(embeddings)

        # Find breakpoints
        breakpoints = self._find_breakpoints(emb_array)

        # Group sentences into chunks at breakpoints
        raw_chunks = self._group_sentences(sentences, breakpoints)

        # Post-process: merge small, split large
        processed = self._post_process(raw_chunks)

        chunks: list[Chunk] = []
        for idx, text in enumerate(processed):
            chunks.append(
                Chunk(
                    content=text,
                    document_id=document.id,
                    metadata=document.metadata.model_copy(),
                    chunk_index=idx,
                    token_count=len(text.split()),
                )
            )

        logger.info(
            "semantic_chunk_complete",
            document_id=document.id,
            sentences=len(sentences),
            chunks=len(chunks),
        )
        return chunks

    @trace_operation(LifecycleStage.CHUNK, "semantic_chunk_batch")
    async def chunk_batch(self, documents: list[Document]) -> list[Chunk]:
        """Chunk multiple documents, returning a flat list of all Chunks.

        Args:
            documents: Documents to chunk.

        Returns:
            Flat list of all resulting Chunks.
        """
        tasks = [self.chunk(doc) for doc in documents]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_chunks: list[Chunk] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(
                    "semantic_chunk_batch_item_failed",
                    document_index=i,
                    error=str(result),
                )
                continue
            all_chunks.extend(result)

        return all_chunks

    # ── Internal ─────────────────────────────────────────────────────

    def _find_breakpoints(self, embeddings: np.ndarray) -> list[int]:
        """Find sentence indices where a semantic break should occur.

        Compares consecutive sentence embeddings and marks positions where
        the cosine similarity drops below the threshold.
        """
        breakpoints: list[int] = []
        for i in range(1, len(embeddings)):
            sim = _cosine_similarity(embeddings[i - 1], embeddings[i])
            if sim < self._breakpoint_threshold:
                breakpoints.append(i)
        return breakpoints

    def _group_sentences(
        self, sentences: list[str], breakpoints: list[int]
    ) -> list[str]:
        """Group sentences into text blocks based on breakpoint positions."""
        groups: list[str] = []
        start = 0
        for bp in breakpoints:
            group_text = " ".join(sentences[start:bp])
            if group_text.strip():
                groups.append(group_text)
            start = bp
        # Remaining sentences
        remainder = " ".join(sentences[start:])
        if remainder.strip():
            groups.append(remainder)
        return groups

    def _post_process(self, chunks: list[str]) -> list[str]:
        """Merge chunks that are too small; split chunks that are too large."""
        # First pass: merge small chunks
        merged: list[str] = []
        buffer = ""
        for chunk in chunks:
            if buffer:
                combined = buffer + " " + chunk
                if len(combined) <= self._max_chunk_size:
                    buffer = combined
                    continue
                else:
                    merged.append(buffer)
                    buffer = chunk
            elif len(chunk) < self._min_chunk_size:
                buffer = chunk
            else:
                buffer = chunk

            if len(buffer) >= self._min_chunk_size:
                merged.append(buffer)
                buffer = ""

        if buffer:
            if merged:
                last = merged[-1]
                if len(last) + len(buffer) + 1 <= self._max_chunk_size:
                    merged[-1] = last + " " + buffer
                else:
                    merged.append(buffer)
            else:
                merged.append(buffer)

        # Second pass: split oversized chunks
        final: list[str] = []
        for chunk in merged:
            if len(chunk) <= self._max_chunk_size:
                final.append(chunk)
            else:
                sub_sentences = _split_sentences(chunk)
                sub_buffer = ""
                for sent in sub_sentences:
                    if sub_buffer and len(sub_buffer) + len(sent) + 1 > self._max_chunk_size:
                        final.append(sub_buffer)
                        sub_buffer = sent
                    else:
                        sub_buffer = (sub_buffer + " " + sent).strip() if sub_buffer else sent
                if sub_buffer:
                    final.append(sub_buffer)

        return final

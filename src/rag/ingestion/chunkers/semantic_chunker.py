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

        if len(sentences) == 1 and len(sentences[0]) <= self._max_chunk_size:
            return [
                Chunk(
                    content=sentences[0],
                    document_id=document.id,
                    metadata=document.metadata.model_copy(),
                    chunk_index=0,
                    token_count=len(sentences[0].split()),
                )
            ]

        # Embed all sentences in batches (only if we have multiple sentences)
        if len(sentences) > 1:
            embeddings = await self._embedding_model.embed(sentences)
            emb_array = np.array(embeddings)

            # Find breakpoints
            breakpoints = self._find_breakpoints(emb_array)

            # Group sentences into chunks at breakpoints
            raw_chunks = self._group_sentences(sentences, breakpoints)
        else:
            raw_chunks = sentences

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

        Compares sliding windows of sentence embeddings using buffer_size and marks
        positions where the cosine similarity drops below the threshold.
        """
        breakpoints: list[int] = []
        for i in range(1, len(embeddings)):
            # Define sliding windows around the breakpoint index i
            left_start = max(0, i - self._buffer_size)
            left_window = embeddings[left_start:i]
            
            right_end = min(len(embeddings), i + self._buffer_size)
            right_window = embeddings[i:right_end]
            
            # Compute window-averaged embeddings
            left_emb = np.mean(left_window, axis=0)
            right_emb = np.mean(right_window, axis=0)
            
            sim = _cosine_similarity(left_emb, right_emb)
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
        # First pass: merge small chunks safely
        merged: list[str] = []
        buffer: list[str] = []

        for chunk in chunks:
            if len(chunk) >= self._min_chunk_size and not buffer:
                merged.append(chunk)
            else:
                # Calculate what the length would be if we merge
                combined_len = sum(len(x) for x in buffer) + len(buffer) + len(chunk)
                if combined_len > self._max_chunk_size and buffer:
                    # Flush existing buffer
                    merged.append(" ".join(buffer))
                    buffer = [chunk]
                else:
                    buffer.append(chunk)

                # If buffer is now large enough, flush it
                buffer_len = sum(len(x) for x in buffer) + max(0, len(buffer) - 1)
                if buffer_len >= self._min_chunk_size:
                    merged.append(" ".join(buffer))
                    buffer = []

        if buffer:
            leftover = " ".join(buffer)
            if merged:
                # Try to append to the last chunk if it fits
                last = merged[-1]
                if len(last) + len(leftover) + 1 <= self._max_chunk_size:
                    merged[-1] = last + " " + leftover
                else:
                    merged.append(leftover)
            else:
                merged.append(leftover)

        # Second pass: split oversized chunks with character-level fallback
        final: list[str] = []
        for chunk in merged:
            if len(chunk) <= self._max_chunk_size:
                final.append(chunk)
            else:
                sub_sentences = _split_sentences(chunk)
                sub_buffer = ""
                for sent in sub_sentences:
                    if len(sent) > self._max_chunk_size:
                        # Flush current sub_buffer first
                        if sub_buffer:
                            final.append(sub_buffer)
                            sub_buffer = ""
                        # Fallback to hard character-splitting for the long sentence
                        for start in range(0, len(sent), self._max_chunk_size):
                            sub = sent[start: start + self._max_chunk_size].strip()
                            if sub:
                                final.append(sub)
                    elif sub_buffer and len(sub_buffer) + len(sent) + 1 > self._max_chunk_size:
                        final.append(sub_buffer)
                        sub_buffer = sent
                    else:
                        sub_buffer = (sub_buffer + " " + sent).strip() if sub_buffer else sent
                if sub_buffer:
                    final.append(sub_buffer)

        return final

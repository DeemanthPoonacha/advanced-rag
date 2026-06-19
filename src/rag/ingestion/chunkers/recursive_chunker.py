"""Recursive character text splitter.

Splits text by trying a hierarchy of separators (double newline, single
newline, sentence boundary, space, character) — falling back to the next
separator when chunks exceed ``max_chunk_size``.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog

from ...core.interfaces import BaseChunker
from ...core.registry import ComponentRegistry
from ...core.types import Chunk, Document, LifecycleStage
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)

DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


@ComponentRegistry.register("chunker", "recursive")
class RecursiveChunker(BaseChunker):
    """Recursively splits documents using a configurable separator hierarchy.

    This is the workhorse chunker for most use-cases: fast, deterministic,
    and produces consistently-sized chunks.

    Args:
        max_chunk_size: Maximum chunk size in characters.
        chunk_overlap: Number of overlapping characters between consecutive chunks.
        separators: Ordered list of separator strings to try.
        keep_separator: Whether to keep the separator in the output.
        strip_whitespace: Whether to strip leading/trailing whitespace.
    """

    def __init__(
        self,
        max_chunk_size: int = 1024,
        chunk_overlap: int = 200,
        separators: list[str] | None = None,
        keep_separator: bool = True,
        strip_whitespace: bool = True,
        **kwargs: Any,
    ) -> None:
        self._max_chunk_size = max_chunk_size
        self._chunk_overlap = chunk_overlap
        self._separators = separators or DEFAULT_SEPARATORS
        self._keep_separator = keep_separator
        self._strip_whitespace = strip_whitespace

    @trace_operation(LifecycleStage.CHUNK, "recursive_chunk")
    async def chunk(self, document: Document) -> list[Chunk]:
        """Split a document using recursive character splitting.

        Args:
            document: The document to split.

        Returns:
            Ordered list of Chunks.
        """
        raw_texts = self._split_text(document.content, self._separators)
        merged = self._merge_splits(raw_texts)

        chunks: list[Chunk] = []
        for idx, text in enumerate(merged):
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
            "recursive_chunk_complete",
            document_id=document.id,
            chunks=len(chunks),
            avg_size=sum(len(c.content) for c in chunks) // max(len(chunks), 1),
        )
        return chunks

    @trace_operation(LifecycleStage.CHUNK, "recursive_chunk_batch")
    async def chunk_batch(self, documents: list[Document]) -> list[Chunk]:
        """Chunk multiple documents concurrently.

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
                    "recursive_chunk_batch_item_failed",
                    document_index=i,
                    error=str(result),
                )
                continue
            all_chunks.extend(result)

        return all_chunks

    # ── Internal ─────────────────────────────────────────────────────

    def _split_text(self, text: str, separators: list[str]) -> list[str]:
        """Recursively split text using the separator hierarchy."""
        final_chunks: list[str] = []

        # Find the appropriate separator
        separator = separators[-1]
        new_separators: list[str] = []
        for i, sep in enumerate(separators):
            if sep == "":
                separator = sep
                break
            if sep in text:
                separator = sep
                new_separators = separators[i + 1:]
                break

        # Split by chosen separator
        if separator:
            splits = text.split(separator)
        else:
            splits = list(text)

        # Process splits
        good_splits: list[str] = []
        for s in splits:
            piece = s
            if self._keep_separator and separator:
                piece = separator + s if s != splits[0] else s

            if self._strip_whitespace:
                piece = piece.strip()

            if not piece:
                continue

            if len(piece) < self._max_chunk_size:
                good_splits.append(piece)
            elif new_separators:
                # Recursively split with the next separator
                sub_chunks = self._split_text(piece, new_separators)
                final_chunks.extend(sub_chunks)
            else:
                # At character level, hard-split
                for start in range(0, len(piece), self._max_chunk_size):
                    sub = piece[start: start + self._max_chunk_size]
                    if sub.strip():
                        final_chunks.append(sub)

        # Merge good splits that fit within chunk size
        if good_splits:
            merged = self._merge_splits(good_splits)
            final_chunks.extend(merged)

        return final_chunks

    def _merge_splits(self, splits: list[str]) -> list[str]:
        """Merge small splits into chunks respecting max_chunk_size and overlap."""
        chunks: list[str] = []
        current_parts: list[str] = []
        current_length = 0

        for split in splits:
            split_len = len(split)

            if current_length + split_len + (1 if current_parts else 0) > self._max_chunk_size:
                if current_parts:
                    chunk_text = " ".join(current_parts)
                    if self._strip_whitespace:
                        chunk_text = chunk_text.strip()
                    if chunk_text:
                        chunks.append(chunk_text)

                    # Keep overlap
                    while current_length > self._chunk_overlap and current_parts:
                        removed = current_parts.pop(0)
                        current_length -= len(removed) + (1 if current_parts else 0)

                current_parts.append(split)
                current_length = sum(len(p) for p in current_parts) + (len(current_parts) - 1 if current_parts else 0)
            else:
                current_parts.append(split)
                current_length += split_len + (1 if len(current_parts) > 1 else 0)

        if current_parts:
            chunk_text = " ".join(current_parts)
            if self._strip_whitespace:
                chunk_text = chunk_text.strip()
            if chunk_text:
                chunks.append(chunk_text)

        return chunks

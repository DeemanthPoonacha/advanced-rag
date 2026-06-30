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
        merged = raw_texts

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
        """Recursively split text using the separator hierarchy, preserving order."""
        if len(text) <= self._max_chunk_size:
            return [text]

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

        final_chunks: list[str] = []
        current_splits: list[str] = []

        for s in splits:
            if self._strip_whitespace:
                s = s.strip()
            if not s:
                continue

            if len(s) <= self._max_chunk_size:
                current_splits.append(s)
            else:
                # Flush existing accumulated splits first
                if current_splits:
                    merged = self._merge_splits(current_splits, separator)
                    final_chunks.extend(merged)
                    current_splits = []

                # Recursively split the large split
                if new_separators:
                    sub_chunks = self._split_text(s, new_separators)
                    final_chunks.extend(sub_chunks)
                else:
                    # At character level, hard-split
                    for start in range(0, len(s), self._max_chunk_size):
                        sub = s[start: start + self._max_chunk_size]
                        if self._strip_whitespace:
                            sub = sub.strip()
                        if sub:
                            final_chunks.append(sub)

        # Flush any remaining accumulated splits
        if current_splits:
            merged = self._merge_splits(current_splits, separator)
            final_chunks.extend(merged)

        return final_chunks

    def _merge_splits(self, splits: list[str], separator: str = "") -> list[str]:
        """Merge small splits into chunks respecting max_chunk_size and overlap."""
        chunks: list[str] = []
        current_parts: list[str] = []
        current_length = 0

        # Determine joiner based on keep_separator
        joiner = separator if self._keep_separator else ""

        for split in splits:
            split_len = len(split)
            # The length of separator we would insert
            separator_len = len(joiner) if current_parts else 0

            # Check if this split fits in the current chunk
            if current_length + separator_len + split_len > self._max_chunk_size:
                if current_parts:
                    chunk_text = joiner.join(current_parts)
                    if self._strip_whitespace:
                        chunk_text = chunk_text.strip()
                    if chunk_text:
                        chunks.append(chunk_text)

                    # Keep overlap: remove parts from start until length is within overlap
                    while current_parts:
                        if len(current_parts) == 1:
                            current_parts = []
                            current_length = 0
                            break

                        current_parts.pop(0)
                        current_length = sum(len(p) for p in current_parts) + len(joiner) * (len(current_parts) - 1)
                        if current_length <= self._chunk_overlap:
                            break

                current_parts.append(split)
                current_length = sum(len(p) for p in current_parts) + len(joiner) * (len(current_parts) - 1)
            else:
                current_parts.append(split)
                current_length += (separator_len if len(current_parts) > 1 else 0) + split_len

        if current_parts:
            chunk_text = joiner.join(current_parts)
            if self._strip_whitespace:
                chunk_text = chunk_text.strip()
            if chunk_text:
                chunks.append(chunk_text)

        return chunks

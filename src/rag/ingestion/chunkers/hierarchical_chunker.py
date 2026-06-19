"""Hierarchical / Parent-Child chunker.

Creates a two-level hierarchy: large parent chunks that are stored as
context, and smaller child chunks that are embedded and retrieved.  During
retrieval, matched child chunks can be expanded back to their parent for
richer context (auto-merging retrieval pattern).
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


@ComponentRegistry.register("chunker", "hierarchical")
class HierarchicalChunker(BaseChunker):
    """Creates parent/child chunk hierarchies for auto-merging retrieval.

    The algorithm:
    1. Split the document into large "parent" chunks.
    2. Split each parent into smaller "child" chunks.
    3. Link children to their parent via ``parent_id``.
    4. Store parent IDs in ``children_ids`` on the parent chunk.

    During retrieval, when multiple children from the same parent are
    retrieved, the retriever can "merge up" to the parent for broader context.

    Args:
        parent_chunk_size: Maximum size (chars) of parent chunks.
        child_chunk_size: Maximum size (chars) of child chunks.
        parent_overlap: Overlap (chars) between consecutive parent chunks.
        child_overlap: Overlap (chars) between consecutive child chunks.
        separators: Separator hierarchy for splitting (same as RecursiveChunker).
    """

    def __init__(
        self,
        parent_chunk_size: int = 2048,
        child_chunk_size: int = 512,
        parent_overlap: int = 256,
        child_overlap: int = 64,
        separators: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        self._parent_chunk_size = parent_chunk_size
        self._child_chunk_size = child_chunk_size
        self._parent_overlap = parent_overlap
        self._child_overlap = child_overlap
        self._separators = separators or ["\n\n", "\n", ". ", " ", ""]

    @trace_operation(LifecycleStage.CHUNK, "hierarchical_chunk")
    async def chunk(self, document: Document) -> list[Chunk]:
        """Split a document into a parent/child chunk hierarchy.

        Returns both parent and child chunks.  Parent chunks have
        ``children_ids`` populated; child chunks have ``parent_id`` set.

        Args:
            document: The document to split.

        Returns:
            Flat list of all Chunks (parents first, then children).
        """
        # 1. Create parent chunks
        parent_texts = self._split_text(
            document.content,
            self._parent_chunk_size,
            self._parent_overlap,
        )

        all_chunks: list[Chunk] = []
        parent_index = 0

        for p_idx, parent_text in enumerate(parent_texts):
            # Create parent chunk
            parent_chunk = Chunk(
                content=parent_text,
                document_id=document.id,
                metadata=document.metadata.model_copy(deep=True),
                chunk_index=parent_index,
                token_count=len(parent_text.split()),
            )
            parent_chunk.metadata.custom["hierarchy_level"] = "parent"
            parent_index += 1

            # 2. Create child chunks from this parent
            child_texts = self._split_text(
                parent_text,
                self._child_chunk_size,
                self._child_overlap,
            )

            child_chunks: list[Chunk] = []
            for c_idx, child_text in enumerate(child_texts):
                child_chunk = Chunk(
                    content=child_text,
                    document_id=document.id,
                    metadata=document.metadata.model_copy(deep=True),
                    parent_id=parent_chunk.id,
                    chunk_index=parent_index,
                    token_count=len(child_text.split()),
                )
                child_chunk.metadata.custom["hierarchy_level"] = "child"
                child_chunk.metadata.custom["child_index"] = c_idx
                parent_index += 1
                child_chunks.append(child_chunk)

            # 3. Link parent to children
            parent_chunk.children_ids = [c.id for c in child_chunks]

            all_chunks.append(parent_chunk)
            all_chunks.extend(child_chunks)

        logger.info(
            "hierarchical_chunk_complete",
            document_id=document.id,
            parents=len(parent_texts),
            total_chunks=len(all_chunks),
        )
        return all_chunks

    @trace_operation(LifecycleStage.CHUNK, "hierarchical_chunk_batch")
    async def chunk_batch(self, documents: list[Document]) -> list[Chunk]:
        """Chunk multiple documents with hierarchical splitting.

        Args:
            documents: Documents to chunk.

        Returns:
            Flat list of all parent and child Chunks.
        """
        tasks = [self.chunk(doc) for doc in documents]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_chunks: list[Chunk] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(
                    "hierarchical_chunk_batch_item_failed",
                    document_index=i,
                    error=str(result),
                )
                continue
            all_chunks.extend(result)

        return all_chunks

    # ── Internal ─────────────────────────────────────────────────────

    def _split_text(
        self,
        text: str,
        max_size: int,
        overlap: int,
    ) -> list[str]:
        """Split text into chunks using the separator hierarchy with overlap.

        Tries separators in order; for each separator that appears in the text,
        splits on it and merges the resulting pieces to fit within ``max_size``.
        """
        # Find the best separator
        separator = ""
        for sep in self._separators:
            if sep == "" or sep in text:
                separator = sep
                break

        if separator:
            raw_splits = text.split(separator)
        else:
            raw_splits = list(text)

        # Clean splits
        splits = [s.strip() for s in raw_splits if s.strip()]

        if not splits:
            return [text] if text.strip() else []

        # Merge splits into chunks with overlap
        chunks: list[str] = []
        current_parts: list[str] = []
        current_len = 0

        for split in splits:
            split_len = len(split)
            separator_len = len(separator) if current_parts else 0

            if current_len + separator_len + split_len > max_size and current_parts:
                chunk_text = separator.join(current_parts).strip()
                if chunk_text:
                    chunks.append(chunk_text)

                # Build overlap from the end of current_parts
                overlap_parts: list[str] = []
                overlap_len = 0
                for part in reversed(current_parts):
                    if overlap_len + len(part) > overlap:
                        break
                    overlap_parts.insert(0, part)
                    overlap_len += len(part)

                current_parts = overlap_parts
                current_len = sum(len(p) for p in current_parts) + len(separator) * max(
                    len(current_parts) - 1, 0
                )

            current_parts.append(split)
            current_len += (separator_len if len(current_parts) > 1 else 0) + split_len

        if current_parts:
            chunk_text = separator.join(current_parts).strip()
            if chunk_text:
                chunks.append(chunk_text)

        # Final pass: hard-split any chunks that still exceed max_size
        final: list[str] = []
        for chunk in chunks:
            if len(chunk) <= max_size:
                final.append(chunk)
            else:
                for start in range(0, len(chunk), max_size - overlap):
                    sub = chunk[start: start + max_size].strip()
                    if sub:
                        final.append(sub)

        return final

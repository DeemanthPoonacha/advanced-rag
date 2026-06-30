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
from .recursive_chunker import RecursiveChunker

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
        
        # Instantiate recursive splitters for parents and children
        self._parent_splitter = RecursiveChunker(
            max_chunk_size=parent_chunk_size,
            chunk_overlap=parent_overlap,
            separators=self._separators,
            **kwargs
        )
        self._child_splitter = RecursiveChunker(
            max_chunk_size=child_chunk_size,
            chunk_overlap=child_overlap,
            separators=self._separators,
            **kwargs
        )

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
        # 1. Create parent chunks using the parent splitter
        parent_chunks = await self._parent_splitter.chunk(document)

        all_chunks: list[Chunk] = []
        chunk_idx = 0

        for parent_chunk in parent_chunks:
            parent_chunk.chunk_index = chunk_idx
            if not parent_chunk.metadata.custom:
                parent_chunk.metadata.custom = {}
            parent_chunk.metadata.custom["hierarchy_level"] = "parent"
            chunk_idx += 1

            # 2. Create child chunks from this parent
            temp_doc = Document(content=parent_chunk.content, metadata=document.metadata)
            child_chunks = await self._child_splitter.chunk(temp_doc)

            for c_idx, child_chunk in enumerate(child_chunks):
                child_chunk.parent_id = parent_chunk.id
                child_chunk.chunk_index = chunk_idx
                if not child_chunk.metadata.custom:
                    child_chunk.metadata.custom = {}
                child_chunk.metadata.custom["hierarchy_level"] = "child"
                child_chunk.metadata.custom["child_index"] = c_idx
                chunk_idx += 1

            # 3. Link parent to children
            parent_chunk.children_ids = [c.id for c in child_chunks]

            all_chunks.append(parent_chunk)
            all_chunks.extend(child_chunks)

        logger.info(
            "hierarchical_chunk_complete",
            document_id=document.id,
            parents=len(parent_chunks),
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

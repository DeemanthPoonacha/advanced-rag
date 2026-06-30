"""Title-based layout-aware document chunker.

Groups text blocks under their preceding section titles/headers.
If a section exceeds max size, it splits the section recursively and
optionally prepends the title header to each sub-chunk for context retrieval.
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


@ComponentRegistry.register("chunker", "by_title")
class ByTitleChunker(BaseChunker):
    """Groups text blocks under their preceding layout titles.

    Args:
        max_chunk_size: Maximum chunk size in characters.
        chunk_overlap: Overlap (chars) between splits.
        prepend_title: Prepends the section title header to each sub-chunk.
    """

    def __init__(
        self,
        max_chunk_size: int = 1024,
        chunk_overlap: int = 200,
        prepend_title: bool = True,
        **kwargs: Any,
    ) -> None:
        self._max_chunk_size = max_chunk_size
        self._chunk_overlap = chunk_overlap
        self._prepend_title = prepend_title
        # Sub-splitter to split text within a section recursively if it exceeds bounds
        self._sub_splitter = RecursiveChunker(
            max_chunk_size=max_chunk_size,
            chunk_overlap=chunk_overlap,
            **kwargs
        )

    @trace_operation(LifecycleStage.CHUNK, "by_title_chunk")
    async def chunk(self, document: Document) -> list[Chunk]:
        """Split a standalone document. Falls back to standard recursive splitting."""
        return await self._sub_splitter.chunk(document)

    @trace_operation(LifecycleStage.CHUNK, "by_title_chunk_batch")
    async def chunk_batch(self, documents: list[Document]) -> list[Chunk]:
        """Batch process documents, grouping sequential elements under layout titles."""
        if not documents:
            return []

        # Group documents by source file
        from collections import defaultdict
        source_groups = defaultdict(list)
        for doc in documents:
            source = doc.metadata.source or "unknown"
            source_groups[source].append(doc)

        all_chunks: list[Chunk] = []

        for source, docs in source_groups.items():
            # Sort elements by page number, keeping the original layout order of elements on the same page
            docs_sorted = sorted(
                docs,
                key=lambda d: d.metadata.page_number or 0
            )

            current_title = ""
            current_section_docs: list[Document] = []
            chunk_idx = 0

            def process_current_section():
                nonlocal current_title, current_section_docs, chunk_idx
                if not current_section_docs:
                    return

                # Combine text content from section elements
                section_text = "\n\n".join([d.content for d in current_section_docs])
                if not section_text.strip():
                    current_section_docs = []
                    return

                title_header = f"Section: {current_title}\n\n" if (self._prepend_title and current_title) else ""

                # Split section text to fit within max bounds (accounting for prepended header size)
                sub_max = max(100, self._max_chunk_size - len(title_header))
                
                # Use a local splitter to avoid modifying shared instance state concurrently
                sub_splitter = RecursiveChunker(
                    max_chunk_size=sub_max,
                    chunk_overlap=self._chunk_overlap,
                    separators=self._sub_splitter._separators,
                    keep_separator=self._sub_splitter._keep_separator,
                    strip_whitespace=self._sub_splitter._strip_whitespace,
                )
                merged_splits = sub_splitter._split_text(section_text, sub_splitter._separators)

                for text in merged_splits:
                    ref_doc = current_section_docs[0]
                    final_content = f"{title_header}{text}"

                    all_chunks.append(
                        Chunk(
                            content=final_content,
                            document_id=ref_doc.id,
                            metadata=ref_doc.metadata.model_copy(),
                            chunk_index=chunk_idx,
                            token_count=len(final_content.split()),
                        )
                    )
                    chunk_idx += 1

                current_section_docs = []

            for doc in docs_sorted:
                custom = doc.metadata.custom or {}
                el_type = custom.get("element_type", "text")

                if el_type == "title":
                    # Title triggers section flush
                    process_current_section()
                    current_title = doc.content.strip()
                    current_section_docs.append(doc)
                elif el_type in ("table", "image"):
                    # Table/image triggers section flush, then chunked as indivisible block
                    process_current_section()
                    
                    title_header = f"Section: {current_title}\n\n" if (self._prepend_title and current_title) else ""
                    final_content = f"{title_header}{doc.content}"
                    
                    all_chunks.append(
                        Chunk(
                            content=final_content,
                            document_id=doc.id,
                            metadata=doc.metadata.model_copy(),
                            chunk_index=chunk_idx,
                            token_count=len(final_content.split()),
                        )
                    )
                    chunk_idx += 1
                else:
                    current_section_docs.append(doc)

            # Flush final section
            process_current_section()

        logger.info(
            "by_title_chunk_batch_complete",
            num_sources=len(source_groups),
            total_chunks=len(all_chunks),
        )
        return all_chunks

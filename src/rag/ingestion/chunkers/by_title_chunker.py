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
                combined_len = len(title_header) + len(section_text)
                
                # Check if section contains layout blocks
                has_layout_blocks = any(
                    (d.metadata.custom or {}).get("element_type") in ("table", "image")
                    for d in current_section_docs
                )

                if combined_len <= self._max_chunk_size or not has_layout_blocks:
                    # Case 1: The section fits, or has no layout blocks. Standard split.
                    sub_max = max(100, self._max_chunk_size - len(title_header))
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
                else:
                    # Case 2: Section is too large and has layout blocks. Keep layout blocks indivisible.
                    # Bind short adjacent text elements (headers/captions <= 150 chars) to layout blocks.
                    n_docs = len(current_section_docs)
                    merged_to_layout = {i: i for i in range(n_docs)}

                    for i in range(n_docs):
                        doc = current_section_docs[i]
                        doc_type = (doc.metadata.custom or {}).get("element_type")
                        if doc_type in ("table", "image"):
                            # Check preceding document
                            p_idx = i - 1
                            if p_idx >= 0:
                                p_doc = current_section_docs[p_idx]
                                p_type = (p_doc.metadata.custom or {}).get("element_type")
                                if (
                                    p_type not in ("table", "image")
                                    and len(p_doc.content) <= 150
                                    and merged_to_layout[p_idx] == p_idx
                                ):
                                    merged_to_layout[p_idx] = i

                            # Check succeeding document
                            s_idx = i + 1
                            if s_idx < n_docs:
                                s_doc = current_section_docs[s_idx]
                                s_type = (s_doc.metadata.custom or {}).get("element_type")
                                if (
                                    s_type not in ("table", "image")
                                    and len(s_doc.content) <= 150
                                    and merged_to_layout[s_idx] == s_idx
                                ):
                                    merged_to_layout[s_idx] = i

                    temp_text_docs = []

                    def flush_text_docs():
                        nonlocal chunk_idx
                        if not temp_text_docs:
                            return
                        combined_text = "\n\n".join([d.content for d in temp_text_docs])
                        if combined_text.strip():
                            sub_max = max(100, self._max_chunk_size - len(title_header))
                            sub_splitter = RecursiveChunker(
                                max_chunk_size=sub_max,
                                chunk_overlap=self._chunk_overlap,
                                separators=self._sub_splitter._separators,
                                keep_separator=self._sub_splitter._keep_separator,
                                strip_whitespace=self._sub_splitter._strip_whitespace,
                            )
                            splits = sub_splitter._split_text(combined_text, sub_splitter._separators)
                            for text in splits:
                                ref_d = temp_text_docs[0]
                                final_c = f"{title_header}{text}"
                                all_chunks.append(
                                    Chunk(
                                        content=final_c,
                                        document_id=ref_d.id,
                                        metadata=ref_d.metadata.model_copy(),
                                        chunk_index=chunk_idx,
                                        token_count=len(final_c.split()),
                                    )
                                )
                                chunk_idx += 1
                        temp_text_docs.clear()

                    for i in range(n_docs):
                        doc = current_section_docs[i]
                        doc_type = (doc.metadata.custom or {}).get("element_type")

                        if doc_type in ("table", "image"):
                            # Flush normal text accumulated before this layout block
                            flush_text_docs()

                            # Gather merged elements
                            layout_parts = []
                            # Check if preceding was merged
                            if i - 1 >= 0 and merged_to_layout[i - 1] == i:
                                layout_parts.append(current_section_docs[i - 1].content)

                            # Add layout block content itself
                            layout_parts.append(doc.content)

                            # Check if succeeding was merged
                            if i + 1 < n_docs and merged_to_layout[i + 1] == i:
                                layout_parts.append(current_section_docs[i + 1].content)

                            combined_layout_text = "\n\n".join(layout_parts)
                            final_c = f"{title_header}{combined_layout_text}"

                            all_chunks.append(
                                Chunk(
                                    content=final_c,
                                    document_id=doc.id,
                                    metadata=doc.metadata.model_copy(),
                                    chunk_index=chunk_idx,
                                    token_count=len(final_c.split()),
                                )
                            )
                            chunk_idx += 1
                        else:
                            # Only add if it wasn't merged to a layout block
                            if merged_to_layout[i] == i:
                                temp_text_docs.append(doc)
                    flush_text_docs()

                current_section_docs = []

            for doc in docs_sorted:
                custom = doc.metadata.custom or {}
                el_type = custom.get("element_type", "text")

                if el_type == "title":
                    process_current_section()
                    current_title = doc.content.strip()
                    current_section_docs.append(doc)
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

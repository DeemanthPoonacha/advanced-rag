"""Markdown-header-aware document chunker."""

from __future__ import annotations

import asyncio
import re
from typing import Any

import structlog

from ...core.interfaces import BaseChunker
from ...core.registry import ComponentRegistry
from ...core.types import Chunk, Document, LifecycleStage
from ...observability.tracing import trace_operation
from .recursive_chunker import RecursiveChunker

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("chunker", "markdown_header")
class MarkdownHeaderChunker(BaseChunker):
    """Splits documents on Markdown headers (# through ######).

    Optionally prepends active headers to sub-chunks to maintain search context.
    """

    def __init__(
        self,
        max_chunk_size: int = 1024,
        chunk_overlap: int = 200,
        prepend_headers: bool = True,
        **kwargs: Any,
    ) -> None:
        self._max_chunk_size = max_chunk_size
        self._chunk_overlap = chunk_overlap
        self._prepend_headers = prepend_headers
        self._sub_splitter = RecursiveChunker(
            max_chunk_size=max_chunk_size,
            chunk_overlap=chunk_overlap,
            **kwargs
        )

    @trace_operation(LifecycleStage.CHUNK, "markdown_header_chunk")
    async def chunk(self, document: Document) -> list[Chunk]:
        """Split a Markdown document by header levels."""
        content = document.content
        if not content:
            return []

        # Split content into lines and scan for headers
        header_regex = re.compile(r"^(#{1,6})\s+(.+)$")
        lines = content.split("\n")

        sections: list[dict[str, Any]] = []
        current_headers: dict[int, str] = {}
        current_text: list[str] = []

        for line in lines:
            match = header_regex.match(line)
            if match:
                # Flush existing section
                if current_text:
                    sections.append({
                        "headers": current_headers.copy(),
                        "text": "\n".join(current_text).strip()
                    })
                    current_text = []

                # Parse header level
                level = len(match.group(1))
                title = match.group(2).strip()

                # Clean up deeper headers in hierarchy
                current_headers = {k: v for k, v in current_headers.items() if k < level}
                current_headers[level] = title
            else:
                current_text.append(line)

        # Flush final section
        if current_text or not sections:
            sections.append({
                "headers": current_headers.copy(),
                "text": "\n".join(current_text).strip()
            })

        chunks: list[Chunk] = []
        chunk_idx = 0

        for section in sections:
            sec_text = section["text"]
            if not sec_text:
                continue

            # Build header prefix context
            header_parts = []
            for level in sorted(section["headers"].keys()):
                header_parts.append(f"{'#' * level} {section['headers'][level]}")
            header_prefix = "\n".join(header_parts) + "\n\n" if (self._prepend_headers and header_parts) else ""

            # Split section text to fit within bounds
            sub_max = max(100, self._max_chunk_size - len(header_prefix))
            
            # Use temporary document for sub-splitting
            temp_doc = Document(content=sec_text, metadata=document.metadata)
            self._sub_splitter._max_chunk_size = sub_max
            sub_chunks = await self._sub_splitter.chunk(temp_doc)

            for sub_c in sub_chunks:
                final_content = f"{header_prefix}{sub_c.content}"
                meta = document.metadata.model_copy()
                if not meta.custom:
                    meta.custom = {}
                meta.custom["markdown_headers"] = section["headers"]

                chunks.append(
                    Chunk(
                        content=final_content,
                        document_id=document.id,
                        metadata=meta,
                        chunk_index=chunk_idx,
                        token_count=len(final_content.split()),
                    )
                )
                chunk_idx += 1

        return chunks

    @trace_operation(LifecycleStage.CHUNK, "markdown_header_chunk_batch")
    async def chunk_batch(self, documents: list[Document]) -> list[Chunk]:
        tasks = [self.chunk(doc) for doc in documents]
        results = await asyncio.gather(*tasks)
        
        flat_chunks: list[Chunk] = []
        for chunks in results:
            flat_chunks.extend(chunks)
        return flat_chunks

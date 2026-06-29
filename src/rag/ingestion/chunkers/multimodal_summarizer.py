"""Multi-modal Chunker.

Generates AI-enhanced search descriptions for chunks containing tables and images.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import structlog

from ...core.interfaces import BaseChunker, BaseLLM
from ...core.registry import ComponentRegistry
from ...core.types import Chunk, Document
from ...observability.tracing import trace_operation
from ...core.types import LifecycleStage

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("chunker", "multimodal_summarizer")
class MultimodalSummarizerChunker(BaseChunker):
    """Generates search-optimized summaries for mixed documents (text, tables, images)."""

    def __init__(
        self,
        llm: BaseLLM | None = None,
        model_name: str = "gpt-4o",
        temperature: float = 0.0,
        api_key: str | None = None,
        base_url: str | None = None,
        **kwargs: Any,
    ) -> None:
        self._model_name = model_name
        self._temperature = temperature
        
        if llm is not None:
            self._llm = llm
        else:
            # Fallback to direct OpenAILLM client if no BaseLLM is passed
            # to preserve compatibility with existing unit tests.
            from ...llm.openai_llm import OpenAILLM
            self._llm = OpenAILLM(
                model=model_name,
                temperature=temperature,
                api_key=api_key,
                base_url=base_url
            )

    @trace_operation(LifecycleStage.CHUNK, "multimodal_summarizer_chunk")
    async def chunk(self, document: Document) -> list[Chunk]:
        """Convert a document with multimodal elements in custom metadata into an AI-summarized chunk."""
        custom = document.metadata.custom or {}
        raw_text = custom.get("raw_text", document.content)
        tables = custom.get("tables_html", [])
        images = custom.get("images_base64", [])

        # Skip summarization for standard text documents to optimize latency and costs
        if not tables and not images:
            return [
                Chunk(
                    content=raw_text,
                    document_id=document.id,
                    metadata=document.metadata,
                    chunk_index=0,
                    token_count=len(raw_text.split()),
                )
            ]

        prompt = f"""You are creating a searchable description for document content retrieval.

CONTENT TO ANALYZE:
TEXT CONTENT:
{raw_text}
"""
        if tables:
            prompt += "\nTABLES:\n"
            for idx, html in enumerate(tables):
                prompt += f"Table {idx+1}:\n{html}\n\n"

        prompt += """
YOUR TASK:
Generate a comprehensive, searchable description that covers:
1. Key facts, numbers, and data points from text and tables.
2. Main topics and concepts discussed.
3. Questions this content could answer.
4. Visual content analysis (charts, diagrams, patterns in images).
5. Alternative search terms users might use.

Make it detailed and searchable - prioritize findability over brevity.

SEARCHABLE DESCRIPTION:"""

        summary_text = None
        try:
            summary_text = await self._llm.generate(
                prompt,
                images=images,
                temperature=self._temperature,
                raise_on_error=True
            )
            enhanced_content = summary_text or raw_text
        except Exception as e:
            logger.error("multimodal_summarization_failed", error=str(e))
            # Fallback
            enhanced_content = raw_text

        chunk_metadata = document.metadata.model_copy()
        if summary_text:
            if not chunk_metadata.custom:
                chunk_metadata.custom = {}
            chunk_metadata.custom["summary_text"] = summary_text

        return [
            Chunk(
                content=enhanced_content,
                document_id=document.id,
                metadata=chunk_metadata,
                chunk_index=0,
                token_count=len(enhanced_content.split()),
            )
        ]

    def _group_layout_documents(self, documents: list[Document]) -> list[Document]:
        """Group granular layout elements into logical pages/sections.
        
        If documents do not contain layout metadata, they are returned as-is.
        """
        has_granular_layout = any(
            doc.metadata and doc.metadata.custom and "element_type" in doc.metadata.custom
            for doc in documents
        )
        if not has_granular_layout:
            return documents

        from collections import defaultdict
        source_groups = defaultdict(list)
        for doc in documents:
            source = doc.metadata.source or "unknown"
            source_groups[source].append(doc)

        grouped_docs: list[Document] = []

        for source, docs in source_groups.items():
            # Sort by page number first, then order. Section titles trigger first on same page.
            docs_sorted = sorted(
                docs,
                key=lambda d: (
                    d.metadata.page_number or 1,
                    0 if (d.metadata.custom or {}).get("element_type") == "title" else 1
                )
            )

            current_section_text: list[str] = []
            current_tables: list[str] = []
            current_images: list[str] = []
            current_title = ""
            ref_doc = None

            def flush_section():
                nonlocal current_section_text, current_tables, current_images, current_title, ref_doc
                combined_text = "\n\n".join(current_section_text).strip()
                if not combined_text and not current_tables and not current_images:
                    return

                if ref_doc is None:
                    ref_doc = docs_sorted[0]

                doc_meta = ref_doc.metadata.model_copy()
                if not doc_meta.custom:
                    doc_meta.custom = {}
                
                doc_meta.custom.update({
                    "raw_text": combined_text,
                    "tables_html": current_tables,
                    "images_base64": current_images,
                    "section_title": current_title,
                })

                grouped_docs.append(
                    Document(
                        id=ref_doc.id,
                        content=combined_text,
                        metadata=doc_meta
                    )
                )

                current_section_text = []
                current_tables = []
                current_images = []
                ref_doc = None

            for doc in docs_sorted:
                custom = doc.metadata.custom or {}
                el_type = custom.get("element_type", "text")

                acc_size = sum(len(t) for t in current_section_text)
                if el_type == "title" or acc_size > 3000:
                    flush_section()
                    if el_type == "title":
                        current_title = doc.content.strip()

                if ref_doc is None:
                    ref_doc = doc

                if el_type == "table":
                    current_tables.append(doc.content)
                elif el_type == "image":
                    img_b64 = custom.get("image_base64")
                    if img_b64:
                        current_images.append(img_b64)
                    if doc.content:
                        current_section_text.append(doc.content)
                else:
                    current_section_text.append(doc.content)

            flush_section()

        return grouped_docs

    @trace_operation(LifecycleStage.CHUNK, "multimodal_summarizer_chunk_batch")
    async def chunk_batch(self, documents: list[Document]) -> list[Chunk]:
        # Group layout elements first
        grouped_documents = self._group_layout_documents(documents)

        tasks = [self.chunk(doc) for doc in grouped_documents]
        results = await asyncio.gather(*tasks)

        flat_chunks: list[Chunk] = []
        for i, chunks in enumerate(results):
            for chunk_idx, chunk in enumerate(chunks):
                chunk.chunk_index = chunk_idx
                flat_chunks.append(chunk)
        return flat_chunks


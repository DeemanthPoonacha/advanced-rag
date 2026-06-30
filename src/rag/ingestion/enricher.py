"""Multimodal document enricher utilizing Vision LLMs."""

from __future__ import annotations
from rag.config.schema import IMAGE_SUMMARIZER_PROMPT
from rag.config.schema import TABLE_SUMMARIZER_PROMPT

import asyncio
from typing import Any

import structlog

from ..core.types import Chunk, Document, LifecycleStage
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


class MultimodalEnricher:
    """Enriches layout-specific elements with text summaries.

    Can operate on individual elements (Documents) before chunking, or
    on combined Chunks containing text/tables/images after chunking.
    """

    def __init__(
        self,
        llm: Any,
        temperature: float = 0.0,
        table_prompt: str | None = None,
        image_prompt: str | None = None,
    ) -> None:
        self._llm = llm
        self._temperature = temperature
        self._table_prompt = table_prompt
        self._image_prompt = image_prompt

    @trace_operation(LifecycleStage.CHUNK, "multimodal_enrich_chunk")
    async def enrich_chunk(self, chunk: Chunk) -> Chunk:
        """Analyze chunk containing tables/images and update its content with LLM textual summary."""
        custom = chunk.metadata.custom or {}
        el_type = custom.get("element_type", "text")

        # Gather tables
        tables: list[str] = []
        if isinstance(custom.get("tables_html"), list):
            tables.extend(custom["tables_html"])
        elif el_type == "table" and chunk.content:
            tables.append(chunk.content)

        # Gather images
        images: list[str] = []
        if isinstance(custom.get("images_base64"), list):
            images.extend(custom["images_base64"])
        elif el_type == "image":
            img_b64 = custom.get("image_base64")
            if img_b64:
                images.append(img_b64)

        if not tables and not images:
            return chunk

        # Build a structured, adaptable, and token-efficient prompt
        prompt_parts = [
            "ROLE: AI Document Assistant specializing in search indexing and content retrieval.\n",
            "CONTENT TO ANALYZE:",
            f"TEXT CONTENT:\n{chunk.content}"
        ]
        
        if tables:
            prompt_parts.append("\nTABLES:")
            for i, table in enumerate(tables):
                prompt_parts.append(f"Table {i+1}:\n{table}")

        # Determine the task instructions using custom prompts or defaults
        if images:
            task_instruction = self._image_prompt or IMAGE_SUMMARIZER_PROMPT
        else:
            task_instruction = self._table_prompt or TABLE_SUMMARIZER_PROMPT
        
        prompt_parts.append(f"\nINSTRUCTIONS:\n{task_instruction}")
        prompt = "\n".join(prompt_parts)

        try:
            summary = await self._llm.generate(
                prompt,
                images=images,
                temperature=self._temperature,
                raise_on_error=True
            )
            if summary:
                if not chunk.metadata.custom:
                    chunk.metadata.custom = {}
                # Keep original references for downstream context reconstruction
                chunk.metadata.custom["raw_text"] = chunk.content
                chunk.metadata.custom["tables_html"] = tables
                chunk.metadata.custom["images_base64"] = images
                chunk.metadata.custom["summary_text"] = summary

                chunk.content = summary
                chunk.token_count = len(summary.split())
        except Exception as e:
            logger.error("multimodal_enrichment_failed", error=str(e), chunk_id=chunk.id)

        return chunk

    @trace_operation(LifecycleStage.CHUNK, "multimodal_enrich_chunks")
    async def enrich_chunks(self, chunks: list[Chunk]) -> list[Chunk]:
        """Enrich a batch of chunks concurrently."""
        tasks = [self.enrich_chunk(chunk) for chunk in chunks]
        results = await asyncio.gather(*tasks)
        return list(results)

    @trace_operation(LifecycleStage.CHUNK, "multimodal_enrich_document")
    async def enrich_document(self, document: Document) -> Document:
        """Analyze table/image documents and update their contents with LLM textual descriptions."""
        custom = document.metadata.custom or {}
        el_type = custom.get("element_type", "text")

        if el_type not in ("table", "image"):
            return document

        # Build appropriate prompt and extract image list if necessary
        prompt = ""
        images: list[str] = []

        if el_type == "table":
            base_prompt = self._table_prompt or TABLE_SUMMARIZER_PROMPT
            prompt = f"{base_prompt}\n{document.content}"
        else:  # image
            img_b64 = custom.get("image_base64")
            if not img_b64:
                return document
            images = [img_b64]
            prompt = self._image_prompt or IMAGE_SUMMARIZER_PROMPT

        try:
            summary = await self._llm.generate(
                prompt,
                images=images,
                temperature=self._temperature,
                raise_on_error=True
            )
            if summary:
                if not document.metadata.custom:
                    document.metadata.custom = {}
                document.metadata.custom["summary_text"] = summary

                if el_type == "table":
                    document.content = f"Table Summary: {summary}\n\nTable Data:\n{document.content}"
                else:  # image
                    document.content = f"Image Description: {summary}"
        except Exception as e:
            logger.error("multimodal_enrichment_failed", error=str(e), doc_id=document.id)

        return document

    @trace_operation(LifecycleStage.CHUNK, "multimodal_enrich_batch")
    async def enrich_batch(self, documents: list[Document]) -> list[Document]:
        """Enrich a batch of documents concurrently."""
        tasks = [self.enrich_document(doc) for doc in documents]
        results = await asyncio.gather(*tasks)
        return list(results)

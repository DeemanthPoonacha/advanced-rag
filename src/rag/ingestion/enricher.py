"""Multimodal document enricher utilizing Vision LLMs."""

from __future__ import annotations
from rag.config.schema import IMAGE_SUMMARIZER_PROMPT
from rag.config.schema import TABLE_SUMMARIZER_PROMPT

import asyncio
from typing import Any

import structlog

from ..core.types import Document, LifecycleStage
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)

                

class MultimodalEnricher:
    """Enriches layout-specific elements with text summaries before chunking.

    Converts tables to Markdown structures and generates descriptions for images
    via a Vision LLM.
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

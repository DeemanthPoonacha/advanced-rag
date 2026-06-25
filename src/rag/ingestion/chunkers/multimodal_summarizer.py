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

    @trace_operation(LifecycleStage.CHUNK, "multimodal_summarizer_chunk_batch")
    async def chunk_batch(self, documents: list[Document]) -> list[Chunk]:
        tasks = [self.chunk(doc) for doc in documents]
        results = await asyncio.gather(*tasks)

        flat_chunks: list[Chunk] = []
        for i, chunks in enumerate(results):
            for chunk_idx, chunk in enumerate(chunks):
                chunk.chunk_index = chunk_idx
                flat_chunks.append(chunk)
        return flat_chunks

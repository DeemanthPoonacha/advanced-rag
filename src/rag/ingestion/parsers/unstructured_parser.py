"""Unstructured.io document parser implementation.

Handles PDFs, DOCX, HTML, markdown, plain text, images, and other formats
via the ``unstructured`` library with configurable parsing strategies.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ...core.interfaces import BaseParser
from ...core.registry import ComponentRegistry
from ...core.types import Document, DocumentMetadata
from ...observability.tracing import trace_operation
from ...core.types import LifecycleStage

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("parser", "unstructured")
class UnstructuredParser(BaseParser):
    """Document parser powered by the ``unstructured`` library.

    Supports hi-res, fast, and OCR-only strategies.  Extracts structured
    elements (titles, narrative text, tables, images) and concatenates
    them into Documents with rich metadata.

    Args:
        strategy: Parsing strategy — ``"hi_res"``, ``"fast"``, or ``"ocr_only"``.
        languages: ISO 639-1 language codes for OCR (e.g. ``["en", "de"]``).
        extract_images: Whether to extract images as separate elements.
        include_page_breaks: Whether to split on page boundaries.
        max_characters: Max characters per element (0 = unlimited).
        combine_text_under_n_chars: Combine small elements below this threshold.
    """

    def __init__(
        self,
        strategy: str = "hi_res",
        languages: list[str] | None = None,
        extract_images: bool = False,
        include_page_breaks: bool = True,
        max_characters: int = 0,
        combine_text_under_n_chars: int = 200,
    ) -> None:
        self._strategy = strategy
        self._languages = languages or ["en"]
        self._extract_images = extract_images
        self._include_page_breaks = include_page_breaks
        self._max_characters = max_characters
        self._combine_text_under_n_chars = combine_text_under_n_chars

    @trace_operation(LifecycleStage.PARSE, "unstructured_parse")
    async def parse(
        self,
        source: str | bytes,
        metadata: dict[str, Any] | None = None,
    ) -> list[Document]:
        """Parse a single file or raw bytes into Documents.

        For file paths, ``unstructured`` auto-detects the format.
        For raw bytes, the caller should provide ``file_type`` in metadata.

        Args:
            source: A file path string or raw bytes.
            metadata: Optional extra metadata to merge into each Document.

        Returns:
            List of parsed Documents (typically one per file, but
            may be multiple for multi-page documents with page-break splitting).
        """
        extra_meta = metadata or {}
        loop = asyncio.get_running_loop()
        elements = await loop.run_in_executor(
            None, self._partition, source, extra_meta
        )

        documents = self._elements_to_documents(elements, source, extra_meta)

        logger.info(
            "unstructured_parse_complete",
            source=str(source)[:200] if isinstance(source, str) else "<bytes>",
            documents=len(documents),
            elements=len(elements),
        )
        return documents

    @trace_operation(LifecycleStage.PARSE, "unstructured_parse_batch")
    async def parse_batch(
        self,
        sources: list[str | bytes],
        metadata: list[dict[str, Any]] | None = None,
    ) -> list[Document]:
        """Parse multiple sources concurrently.

        Args:
            sources: List of file paths or raw bytes.
            metadata: Per-source metadata (must match length of ``sources``).

        Returns:
            Flat list of all Documents parsed from all sources.
        """
        meta_list = metadata or [{}] * len(sources)
        if len(meta_list) != len(sources):
            raise ValueError(
                f"metadata length ({len(meta_list)}) must match "
                f"sources length ({len(sources)})"
            )

        tasks = [
            self.parse(source, meta)
            for source, meta in zip(sources, meta_list)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        documents: list[Document] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(
                    "parse_batch_item_failed",
                    source_index=i,
                    error=str(result),
                )
                continue
            documents.extend(result)

        return documents

    # ── Internal ─────────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((OSError, RuntimeError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    def _partition(
        self,
        source: str | bytes,
        extra_meta: dict[str, Any],
    ) -> list[Any]:
        """Run unstructured partitioning (synchronous, called via executor).

        Uses tenacity retry for transient I/O failures.
        """
        from unstructured.partition.auto import partition

        kwargs: dict[str, Any] = {
            "strategy": self._strategy,
            "languages": self._languages,
            "include_page_breaks": self._include_page_breaks,
        }

        if self._max_characters > 0:
            kwargs["max_characters"] = self._max_characters
        if self._combine_text_under_n_chars > 0:
            kwargs["combine_text_under_n_chars"] = self._combine_text_under_n_chars

        if isinstance(source, str):
            kwargs["filename"] = source
        else:
            kwargs["file"] = source
            file_type = extra_meta.get("file_type", "")
            if file_type:
                kwargs["content_type"] = file_type

        return partition(**kwargs)

    def _elements_to_documents(
        self,
        elements: list[Any],
        source: str | bytes,
        extra_meta: dict[str, Any],
    ) -> list[Document]:
        """Convert unstructured elements into Document objects.

        Groups elements by page when page breaks are included.
        """
        if not elements:
            return []

        # Determine source info
        source_str = str(source) if isinstance(source, str) else "<bytes>"
        file_name = Path(source).name if isinstance(source, str) else extra_meta.get("file_name", "")
        file_type = ""
        if isinstance(source, str):
            file_type = Path(source).suffix.lstrip(".")

        if self._include_page_breaks:
            return self._group_by_page(elements, source_str, file_name, file_type, extra_meta)

        # Single document from all elements
        content = "\n\n".join(
            str(el) for el in elements if str(el).strip()
        )
        if not content.strip():
            return []

        doc_meta = DocumentMetadata(
            source=source_str,
            file_name=file_name,
            file_type=file_type,
            language=self._languages[0] if self._languages else "en",
            custom=extra_meta,
        )
        return [Document(content=content, metadata=doc_meta)]

    def _group_by_page(
        self,
        elements: list[Any],
        source_str: str,
        file_name: str,
        file_type: str,
        extra_meta: dict[str, Any],
    ) -> list[Document]:
        """Group elements by page number, creating one Document per page."""
        pages: dict[int, list[str]] = {}
        for el in elements:
            text = str(el).strip()
            if not text:
                continue
            page_num = getattr(el.metadata, "page_number", None) if hasattr(el, "metadata") else None
            page_key = page_num or 0
            pages.setdefault(page_key, []).append(text)

        documents: list[Document] = []
        total_pages = max(pages.keys(), default=0) + (1 if pages else 0)
        for page_num in sorted(pages.keys()):
            content = "\n\n".join(pages[page_num])
            if not content.strip():
                continue
            meta = DocumentMetadata(
                source=source_str,
                file_name=file_name,
                file_type=file_type,
                page_number=page_num if page_num > 0 else None,
                total_pages=total_pages if total_pages > 1 else None,
                language=self._languages[0] if self._languages else "en",
                custom=extra_meta,
            )
            documents.append(Document(content=content, metadata=meta))

        return documents

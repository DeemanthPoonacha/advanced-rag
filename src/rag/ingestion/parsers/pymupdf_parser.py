"""PyMuPDF document parser implementation.

Fast text-only parser extracting layout-preserving text page-by-page.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
import structlog

from ...core.interfaces import BaseParser
from ...core.registry import ComponentRegistry
from ...core.types import Document, DocumentMetadata, LifecycleStage
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("parser", "pymupdf")
class PyMuPDFParser(BaseParser):
    """Document parser powered by the fast PyMuPDF library.

    Extracts plain text and page metadata extremely quickly from PDFs.
    """

    def __init__(
        self,
        extract_images: bool = False,
        **kwargs: Any,
    ) -> None:
        self._extract_images = extract_images

    @trace_operation(LifecycleStage.PARSE, "pymupdf_parse")
    async def parse(
        self,
        source: str | bytes,
        metadata: dict[str, Any] | None = None,
    ) -> list[Document]:
        extra_meta = metadata or {}
        loop = asyncio.get_running_loop()
        documents = await loop.run_in_executor(
            None, self._parse, source, extra_meta
        )
        return documents

    def _parse(self, source: str | bytes, extra_meta: dict[str, Any]) -> list[Document]:
        file_name = extra_meta.get("filename") or extra_meta.get("file_name")
        file_type = extra_meta.get("file_type")

        if isinstance(source, str):
            path = Path(source)
            if not file_name:
                file_name = path.name
            if not file_type:
                file_type = path.suffix.lstrip(".").lower()
        else:
            if not file_name:
                file_name = "document"
            if not file_type:
                file_type = "pdf"

        documents: list[Document] = []

        # Handle simple non-PDF text/markdown files locally
        if file_type in ("txt", "md", "py", "json", "yaml", "yml", "ini", "conf"):
            try:
                if isinstance(source, str):
                    content = Path(source).read_text(encoding="utf-8", errors="ignore")
                else:
                    content = source.decode("utf-8", errors="ignore")
                
                meta = DocumentMetadata(
                    source=str(source) if isinstance(source, str) else "<bytes>",
                    file_name=file_name,
                    file_type=file_type,
                    page_number=1,
                    total_pages=1,
                    language="en",
                    custom={**extra_meta, "parser": "pymupdf"},
                )
                documents.append(Document(content=content, metadata=meta))
                return documents
            except Exception as e:
                logger.warning("pymupdf_plain_text_fallback_failed", error=str(e))

        # PyMuPDF processing (primarily for PDFs)
        try:
            if isinstance(source, bytes):
                doc = fitz.open(stream=source, filetype=file_type)
            else:
                doc = fitz.open(source)

            total_pages = len(doc)
            for page_idx in range(total_pages):
                page = doc[page_idx]
                text = page.get_text()
                if not text.strip():
                    logger.info(
                        "pymupdf_empty_page_detected",
                        page_number=page_idx + 1,
                        file_name=file_name,
                    )
                    text = "[Empty Page]"

                meta = DocumentMetadata(
                    source=str(source) if isinstance(source, str) else "<bytes>",
                    file_name=file_name,
                    file_type=file_type,
                    page_number=page_idx + 1,
                    total_pages=total_pages,
                    language="en",
                    custom={**extra_meta, "parser": "pymupdf"},
                )
                documents.append(Document(content=text, metadata=meta))
            doc.close()
        except Exception as e:
            logger.error("pymupdf_parsing_failed", error=str(e))
            # Basic fallback for other formats
            if isinstance(source, bytes):
                content = source.decode("utf-8", errors="ignore")
            else:
                try:
                    content = Path(source).read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    content = f"[PyMuPDF Fallback] Failed to parse {source}"
            
            meta = DocumentMetadata(
                source=str(source) if isinstance(source, str) else "<bytes>",
                file_name=file_name,
                file_type=file_type or "txt",
                page_number=1,
                total_pages=1,
                language="en",
                custom={**extra_meta, "parser": "pymupdf_fallback"},
            )
            documents.append(Document(content=content, metadata=meta))

        return documents

    @trace_operation(LifecycleStage.PARSE, "pymupdf_parse_batch")
    async def parse_batch(
        self,
        sources: list[str | bytes],
        metadata: list[dict[str, Any]] | None = None,
    ) -> list[Document]:
        meta_list = metadata or [{}] * len(sources)
        tasks = [self.parse(src, meta) for src, meta in zip(sources, meta_list)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        documents: list[Document] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("pymupdf_batch_item_failed", index=i, error=str(result))
                continue
            documents.extend(result)
        return documents

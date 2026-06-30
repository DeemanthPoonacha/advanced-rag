"""Docling document parser implementation.

Layout-aware local document parser using IBM's Docling.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

import structlog

from ...core.interfaces import BaseParser
from ...core.registry import ComponentRegistry
from ...core.types import Document, DocumentMetadata, LifecycleStage
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("parser", "docling")
class DoclingParser(BaseParser):
    """Document parser powered by IBM's Docling.

    Extracts text, layouts, and tables into Markdown or JSON.
    """

    def __init__(
        self,
        export_format: str = "markdown",
        **kwargs: Any,
    ) -> None:
        self._export_format = export_format
        self._converter = None

    def _get_converter(self) -> Any:
        if self._converter is None:
            try:
                from docling.document_converter import DocumentConverter
                self._converter = DocumentConverter()
            except ImportError as e:
                logger.error("docling_import_failed", error=str(e))
                raise ImportError(
                    "Docling is not installed. Install it using `pip install docling` "
                    "to use the 'docling' parser."
                ) from e
        return self._converter

    @trace_operation(LifecycleStage.PARSE, "docling_parse")
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
        import tempfile

        file_name = extra_meta.get("filename") or extra_meta.get("file_name")
        file_type = extra_meta.get("file_type")

        if isinstance(source, str):
            path = Path(source)
            if not file_name:
                file_name = path.name
            if not file_type:
                file_type = path.suffix.lstrip(".").lower()
            file_path = str(path)
            temp_path = None
        else:
            if not file_name:
                file_name = "document"
            if not file_type:
                file_type = "pdf"
            
            # Write bytes to temp file to ensure docling can read it
            temp_file = tempfile.NamedTemporaryFile(suffix=f".{file_type}", delete=False)
            temp_file.write(source)
            temp_file.close()
            file_path = temp_file.name
            temp_path = file_path

        try:
            converter = self._get_converter()
            result = converter.convert(file_path)
            
            if self._export_format == "json":
                content = json.dumps(result.document.export_to_dict())
            else:
                content = result.document.export_to_markdown()

            total_pages = len(result.pages) if hasattr(result, "pages") and result.pages else 1

            meta = DocumentMetadata(
                source=str(source) if isinstance(source, str) else "<bytes>",
                file_name=file_name,
                file_type=file_type,
                page_number=1,
                total_pages=total_pages,
                language="en",
                custom={
                    **extra_meta,
                    "parser": "docling",
                    "format": self._export_format,
                },
            )
            return [Document(content=content, metadata=meta)]
        except Exception as e:
            logger.error("docling_parsing_failed", error=str(e))
            # Fallback text decoding
            if isinstance(source, bytes):
                content = source.decode("utf-8", errors="ignore")
            else:
                try:
                    content = Path(source).read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    content = f"[Docling Fallback] Failed to parse {source}"

            meta = DocumentMetadata(
                source=str(source) if isinstance(source, str) else "<bytes>",
                file_name=file_name,
                file_type=file_type or "txt",
                page_number=1,
                total_pages=1,
                language="en",
                custom={**extra_meta, "parser": "docling_fallback"},
            )
            return [Document(content=content, metadata=meta)]
        finally:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass

    @trace_operation(LifecycleStage.PARSE, "docling_parse_batch")
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
                logger.error("docling_batch_item_failed", index=i, error=str(result))
                continue
            documents.extend(result)
        return documents

"""Google Cloud Document AI parser implementation.

Enterprise-grade cloud parser utilizing Google Cloud's Document AI processors.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import structlog

from ...core.interfaces import BaseParser
from ...core.registry import ComponentRegistry
from ...core.types import Document, DocumentMetadata, LifecycleStage
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("parser", "gcp_documentai")
class GCPDocumentAIParser(BaseParser):
    """Document parser powered by GCP Document AI.

    Excels at parsing layout, tables, and form key-values from structured PDFs.
    """

    def __init__(
        self,
        project_id: str | None = None,
        location: str = "us",
        processor_id: str | None = None,
        **kwargs: Any,
    ) -> None:
        self._project_id = project_id
        self._location = location
        self._processor_id = processor_id
        self._client = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                from google.cloud import documentai
                self._client = documentai.DocumentProcessorServiceClient()
            except ImportError as e:
                logger.error("google_cloud_documentai_import_failed", error=str(e))
                raise ImportError(
                    "google-cloud-documentai is not installed. Install it using "
                    "`pip install google-cloud-documentai` to use the 'gcp_documentai' parser."
                ) from e
        return self._client

    @trace_operation(LifecycleStage.PARSE, "gcp_documentai_parse")
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
        from google.cloud import documentai

        file_name = extra_meta.get("filename") or extra_meta.get("file_name")
        file_type = extra_meta.get("file_type")

        if isinstance(source, str):
            path = Path(source)
            if not file_name:
                file_name = path.name
            if not file_type:
                file_type = path.suffix.lstrip(".").lower()
            try:
                file_data = path.read_bytes()
            except Exception as e:
                logger.error("gcp_documentai_read_file_failed", path=str(path), error=str(e))
                raise
        else:
            file_data = source
            if not file_name:
                file_name = "document"
            if not file_type:
                file_type = "pdf"

        # Resolve MIME type
        mime_types = {
            "pdf": "application/pdf",
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "tiff": "image/tiff",
            "tif": "image/tiff",
            "gif": "image/gif",
        }
        mime_type = mime_types.get(file_type.lower(), "application/pdf")

        # Verify configuration
        if not self._project_id or not self._processor_id:
            logger.error("gcp_documentai_missing_configuration", project_id=self._project_id, processor_id=self._processor_id)
            raise ValueError(
                "GCP Document AI requires both project_id and processor_id. "
                "Configure them in config.yaml under ingestion.gcp_documentai."
            )

        try:
            client = self._get_client()
            processor_path = client.processor_path(
                self._project_id, self._location, self._processor_id
            )

            raw_document = documentai.RawDocument(content=file_data, mime_type=mime_type)
            request = documentai.ProcessRequest(name=processor_path, raw_document=raw_document)

            result = client.process_document(request=request)
            document = result.document

            return self._document_to_documents(document, source, file_name, file_type, extra_meta)
        except Exception as e:
            logger.error("gcp_documentai_api_call_failed", error=str(e))
            # Fallback
            meta = DocumentMetadata(
                source=str(source) if isinstance(source, str) else "<bytes>",
                file_name=file_name,
                file_type=file_type,
                page_number=1,
                total_pages=1,
                language="en",
                custom={**extra_meta, "parser": "gcp_documentai_fallback"},
            )
            content = file_data.decode("utf-8", errors="ignore") if isinstance(source, bytes) else f"[Fallback] Failed to parse {source}"
            return [Document(content=content, metadata=meta)]

    def _document_to_documents(
        self,
        doc: Any,
        source: str | bytes,
        file_name: str,
        file_type: str,
        extra_meta: dict[str, Any],
    ) -> list[Document]:
        documents: list[Document] = []
        source_str = str(source) if isinstance(source, str) else "<bytes>"

        # Map document text index segments to actual strings
        def get_text_segment(text_anchor: Any) -> str:
            if not text_anchor or not hasattr(text_anchor, "text_segments"):
                return ""
            
            res_parts = []
            for segment in text_anchor.text_segments:
                start = int(segment.start_index) if hasattr(segment, "start_index") else 0
                end = int(segment.end_index)
                res_parts.append(doc.text[start:end])
            return "".join(res_parts)

        total_pages = len(doc.pages)

        # Parse page-by-page
        for page_idx, page in enumerate(doc.pages):
            page_num = page.page_number
            
            # Extract plain text for page using text anchor
            page_text = ""
            if hasattr(page, "layout") and hasattr(page.layout, "text_anchor"):
                page_text = get_text_segment(page.layout.text_anchor)
            
            # If no layout text, fallback to page.layout.text_anchor or segments
            if not page_text.strip():
                # Loop through paragraphs
                para_texts = []
                for paragraph in getattr(page, "paragraphs", []):
                    para_texts.append(get_text_segment(paragraph.layout.text_anchor))
                page_text = "\n\n".join(para_texts)

            # Extract tables as structured objects
            tables = []
            for table in getattr(page, "tables", []):
                rows = []
                for header_row in getattr(table, "header_rows", []):
                    cells = []
                    for cell in getattr(header_row, "cells", []):
                        cells.append(get_text_segment(cell.layout.text_anchor).strip().replace("\n", " "))
                    rows.append(" | ".join(cells))
                
                if rows:
                    cols = len(getattr(table.header_rows[0], "cells", []))
                    rows.append(" | ".join(["---"] * cols))

                for body_row in getattr(table, "body_rows", []):
                    cells = []
                    for cell in getattr(body_row, "cells", []):
                        cells.append(get_text_segment(cell.layout.text_anchor).strip().replace("\n", " "))
                    rows.append(" | ".join(cells))

                if rows:
                    tables.append("\n".join(rows))

            if page_text.strip():
                meta = DocumentMetadata(
                    source=source_str,
                    file_name=file_name,
                    file_type=file_type,
                    page_number=page_num,
                    total_pages=total_pages if total_pages > 1 else None,
                    language="en",
                    custom={
                        **extra_meta,
                        "parser": "gcp_documentai",
                        "tables_html": tables,
                    },
                )
                documents.append(Document(content=page_text, metadata=meta))

        return documents

    @trace_operation(LifecycleStage.PARSE, "gcp_documentai_parse_batch")
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
                logger.error("gcp_documentai_batch_item_failed", index=i, error=str(result))
                continue
            documents.extend(result)
        return documents

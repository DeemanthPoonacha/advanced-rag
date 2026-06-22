"""Multi-modal Unstructured parser.

Extracts text, structural tables (as HTML), and images (as base64) from PDFs.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import structlog

from ...core.interfaces import BaseParser
from ...core.registry import ComponentRegistry
from ...core.types import Document, DocumentMetadata
from ...observability.tracing import trace_operation
from ...core.types import LifecycleStage

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("parser", "multimodal_unstructured")
class MultimodalUnstructuredParser(BaseParser):
    """Parser that extracts text, HTML tables, and Base64 images from documents using unstructured."""

    def __init__(
        self,
        strategy: str = "hi_res",
        extract_images: bool = True,
        languages: list[str] | None = None,
    ) -> None:
        self._strategy = strategy
        self._extract_images = extract_images
        self._languages = languages or ["en"]

    @trace_operation(LifecycleStage.PARSE, "multimodal_unstructured_parse")
    async def parse(
        self,
        source: str | bytes,
        metadata: dict[str, Any] | None = None,
    ) -> list[Document]:
        """Parse source document into documents with embedded tables/images in custom metadata."""
        if not isinstance(source, str):
            raise NotImplementedError("Parsing raw bytes is not supported for multimodal unstructured parser.")

        loop = asyncio.get_running_loop()
        elements = await loop.run_in_executor(
            None, self._partition, source
        )

        from unstructured.chunking.title import chunk_by_title
        chunks = chunk_by_title(
            elements,
            max_characters=3000,
            new_after_n_chars=2400,
            combine_text_under_n_chars=500
        )

        documents: list[Document] = []
        for i, chunk in enumerate(chunks):
            content_data = self._separate_content_types(chunk)
            
            custom_metadata = {
                "raw_text": content_data["text"],
                "tables_html": content_data["tables"],
                "images_base64": content_data["images"],
                **(metadata or {})
            }

            doc_meta = DocumentMetadata(
                source=str(source),
                file_name=(metadata or {}).get("filename") or Path(source).name,
                file_type=Path(source).suffix.lstrip("."),
                language=self._languages[0] if self._languages else "en",
                custom=custom_metadata,
            )

            # Standard document structure: we store raw text as content for search
            documents.append(Document(content=content_data["text"], metadata=doc_meta))

        logger.info(
            "multimodal_unstructured_parse_complete",
            source=source,
            documents=len(documents),
        )
        return documents

    def _partition(self, file_path: str) -> list[Any]:
        try:
            from unstructured.partition.pdf import partition_pdf
            return partition_pdf(
                filename=file_path,
                strategy=self._strategy,
                infer_table_structure=True,
                extract_image_block_types=["Image"] if self._extract_images else [],
                extract_image_block_to_payload=True
            )
        except Exception as e:
            logger.warning(
                "multimodal_partition_failed_using_fallback",
                file_path=file_path,
                error=str(e)
            )

            class FallbackElement:
                def __init__(self, text: str, page_number: int | None = None) -> None:
                    self.text = text
                    self.metadata = type("ElementMetadata", (), {"page_number": page_number})()
                def __str__(self) -> str:
                    return self.text

            # Parse files locally
            suffix = Path(file_path).suffix.lower()
            if suffix in [".txt", ".md", ".py", ".json", ".yaml", ".yml", ".csv", ".ini", ".conf"]:
                try:
                    content = Path(file_path).read_text(encoding="utf-8", errors="ignore")
                    return [FallbackElement(content, page_number=1)]
                except Exception:
                    pass
            elif suffix == ".pdf":
                try:
                    import pypdf
                    reader = pypdf.PdfReader(file_path)
                    pages = []
                    for idx, page in enumerate(reader.pages):
                        text = page.extract_text()
                        if text and text.strip():
                            pages.append(FallbackElement(text, page_number=idx + 1))
                    if pages:
                        return pages
                except Exception as pdf_err:
                    logger.error("multimodal_fallback_pdf_parsing_failed", error=str(pdf_err))
            elif suffix == ".docx":
                try:
                    import zipfile
                    import xml.etree.ElementTree as ET
                    with zipfile.ZipFile(file_path) as docx:
                        tree = ET.fromstring(docx.read('word/document.xml'))
                        namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                        text_nodes = tree.findall('.//w:t', namespaces)
                        docx_text = "\n\n".join([node.text for node in text_nodes if node.text])
                        if docx_text.strip():
                            return [FallbackElement(docx_text, page_number=1)]
                except Exception as docx_err:
                    logger.error("multimodal_fallback_docx_parsing_failed", error=str(docx_err))
            elif suffix == ".pptx":
                try:
                    import zipfile
                    import xml.etree.ElementTree as ET
                    slide_texts = []
                    with zipfile.ZipFile(file_path) as pptx:
                        slide_files = sorted([f for f in pptx.namelist() if f.startswith("ppt/slides/slide") and f.endswith(".xml")])
                        for slide_file in slide_files:
                            tree = ET.fromstring(pptx.read(slide_file))
                            namespaces = {'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
                            text_nodes = tree.findall('.//a:t', namespaces)
                            slide_text = " ".join([node.text for node in text_nodes if node.text])
                            if slide_text.strip():
                                slide_texts.append(slide_text)
                    if slide_texts:
                        return [FallbackElement(txt, page_number=idx + 1) for idx, txt in enumerate(slide_texts)]
                except Exception as pptx_err:
                    logger.error("multimodal_fallback_pptx_parsing_failed", error=str(pptx_err))

            content = f"[Fallback Parser] Failed to partition multimodal document content from {file_path}."
            return [FallbackElement(content, page_number=1)]

    def _separate_content_types(self, chunk: Any) -> dict[str, Any]:
        content_data = {
            "text": chunk.text,
            "tables": [],
            "images": []
        }
        if hasattr(chunk, "metadata") and hasattr(chunk.metadata, "orig_elements"):
            for element in chunk.metadata.orig_elements:
                el_type = type(element).__name__
                if el_type == "Table":
                    table_html = getattr(element.metadata, "text_as_html", element.text)
                    content_data["tables"].append(table_html)
                elif el_type == "Image":
                    if hasattr(element, "metadata") and hasattr(element.metadata, "image_base64"):
                        content_data["images"].append(element.metadata.image_base64)
        return content_data

    @trace_operation(LifecycleStage.PARSE, "multimodal_unstructured_parse_batch")
    async def parse_batch(
        self,
        sources: list[str | bytes],
        metadata: list[dict[str, Any]] | None = None,
    ) -> list[Document]:
        meta_list = metadata or [{}] * len(sources)
        tasks = [
            self.parse(source, meta)
            for source, meta in zip(sources, meta_list)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        documents: list[Document] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("multimodal_parse_batch_item_failed", source_index=i, error=str(result))
                continue
            documents.extend(result)
        return documents

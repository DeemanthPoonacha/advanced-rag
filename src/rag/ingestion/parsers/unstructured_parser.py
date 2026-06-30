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
        extract_images: bool = True,
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
        import tempfile

        # Create a temporary directory for image extraction fallback
        image_output_dir = None
        if self._extract_images:
            image_output_dir = tempfile.mkdtemp(prefix="unstructured_images_")

        kwargs: dict[str, Any] = {
            "strategy": self._strategy,
            "languages": self._languages,
            "include_page_breaks": self._include_page_breaks,
            "infer_table_structure": True,
            "extract_images_in_pdf": self._extract_images,
            "extract_image_block_to_payload": self._extract_images,
            "extract_image_block_types": ["Image"] if self._extract_images else [],
        }

        # Also save images to disk as a fallback in case to_payload fails
        if image_output_dir:
            kwargs["extract_image_block_output_dir"] = image_output_dir

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

        try:
            from unstructured.partition.auto import partition
            elements = partition(**kwargs)
            
            # Post-process: fill in missing image_base64 from saved files
            if self._extract_images and image_output_dir:
                self._backfill_image_payloads(elements, image_output_dir)

            return elements
        except Exception as e:
            # Clean up temp image dir on failure
            if image_output_dir:
                self._cleanup_image_dir(image_output_dir)
            if kwargs.get("strategy") == "hi_res":
                logger.warning(
                    "unstructured_hi_res_failed_falling_back_to_fast",
                    source=str(source)[:100],
                    error=str(e)
                )
                try:
                    kwargs_fast = kwargs.copy()
                    kwargs_fast["strategy"] = "fast"
                    kwargs_fast["extract_images_in_pdf"] = False
                    kwargs_fast.pop("extract_image_block_output_dir", None)
                    kwargs_fast.pop("extract_image_block_to_payload", None)
                    from unstructured.partition.auto import partition
                    return partition(**kwargs_fast)
                except Exception as fast_err:
                    logger.warning(
                        "unstructured_fast_failed_using_local_fallback",
                        source=str(source)[:100],
                        error=str(fast_err)
                    )
            else:
                logger.warning(
                    "unstructured_partition_failed_using_fallback",
                    source=str(source)[:100],
                    error=str(e)
                )
            
            class FallbackElement:
                def __init__(self, text: str, page_number: int | None = None, category: str = "Text") -> None:
                    self.text = text
                    self.metadata = type("ElementMetadata", (), {"page_number": page_number})()
                    self.category = category
                def __str__(self) -> str:
                    return self.text

            import io

            # Parse files locally (with support for both file path and bytes)
            suffix = ""
            if isinstance(source, str):
                suffix = Path(source).suffix.lower()
            else:
                file_type = extra_meta.get("file_type", "") or extra_meta.get("file_name", "").split(".")[-1]
                if file_type:
                    suffix = f".{file_type.lower()}"

            if suffix:
                if suffix in [".txt", ".md", ".py", ".json", ".yaml", ".yml", ".ini", ".conf"]:
                    try:
                        if isinstance(source, str):
                            content = Path(source).read_text(encoding="utf-8", errors="ignore")
                        else:
                            content = source.decode("utf-8", errors="ignore")
                        return [FallbackElement(content, page_number=1)]
                    except Exception:
                        pass
                elif suffix == ".csv":
                    try:
                        if isinstance(source, str):
                            content = Path(source).read_text(encoding="utf-8", errors="ignore")
                        else:
                            content = source.decode("utf-8", errors="ignore")
                        lines = [line.strip().split(",") for line in content.split("\n") if line.strip()]
                        html_lines = ["<table>"]
                        for r_idx, row in enumerate(lines):
                            html_lines.append("  <tr>")
                            for cell in row:
                                tag = "th" if r_idx == 0 else "td"
                                html_lines.append(f"    <{tag}>{cell}</{tag}>")
                            html_lines.append("  </tr>")
                        html_lines.append("</table>")
                        html_table = "\n".join(html_lines)
                        return [FallbackElement(html_table, page_number=1, category="Table")]
                    except Exception:
                        pass
                elif suffix == ".pdf":
                    try:
                        import pypdf
                        stream = source if isinstance(source, str) else io.BytesIO(source)
                        reader = pypdf.PdfReader(stream)
                        pages = []
                        for idx, page in enumerate(reader.pages):
                            text = page.extract_text()
                            if text and text.strip():
                                pages.append(FallbackElement(text, page_number=idx + 1))
                        if pages:
                            return pages
                    except Exception as pdf_err:
                        logger.error("fallback_pdf_parsing_failed", error=str(pdf_err))
                elif suffix == ".docx":
                    try:
                        import zipfile
                        import xml.etree.ElementTree as ET
                        stream = source if isinstance(source, str) else io.BytesIO(source)
                        with zipfile.ZipFile(stream) as docx:
                            tree = ET.fromstring(docx.read('word/document.xml'))
                            namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                            text_nodes = tree.findall('.//w:t', namespaces)
                            docx_text = "\n\n".join([node.text for node in text_nodes if node.text])
                            if docx_text.strip():
                                return [FallbackElement(docx_text, page_number=1)]
                    except Exception as docx_err:
                        logger.error("fallback_docx_parsing_failed", error=str(docx_err))
                elif suffix == ".pptx":
                    try:
                        import zipfile
                        import xml.etree.ElementTree as ET
                        stream = source if isinstance(source, str) else io.BytesIO(source)
                        slide_texts = []
                        with zipfile.ZipFile(stream) as pptx:
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
                        logger.error("fallback_pptx_parsing_failed", error=str(pptx_err))

            # Decode raw bytes as fallback
            content = ""
            if isinstance(source, bytes):
                content = source.decode("utf-8", errors="ignore")
            else:
                content = f"[Fallback Parser] Failed to partition document content from {source}."

            return [FallbackElement(content, page_number=1)]


    def _backfill_image_payloads(
        self,
        elements: list[Any],
        image_output_dir: str,
    ) -> None:
        """Fill in missing ``image_base64`` on Image elements from saved files.

        When ``extract_image_block_to_payload`` silently fails for certain PDFs,
        ``extract_image_block_output_dir`` still saves the cropped images to disk.
        This method reads those files and sets ``image_base64`` on any Image
        element that lacks it.
        """
        import base64
        import os

        image_elements = [
            el for el in elements
            if getattr(el, "category", "") in ("Image", "Picture")
            and hasattr(el, "metadata")
            and getattr(el.metadata, "image_base64", None) is None
        ]

        if not image_elements:
            # Either no images or all already have payloads — clean up
            self._cleanup_image_dir(image_output_dir)
            return

        # Collect saved image files from the output directory
        saved_images: list[str] = []
        try:
            for fname in sorted(os.listdir(image_output_dir)):
                fpath = os.path.join(image_output_dir, fname)
                if os.path.isfile(fpath):
                    saved_images.append(fpath)
        except OSError:
            self._cleanup_image_dir(image_output_dir)
            return

        # Also check if any image element already has an image_path set
        for el in image_elements:
            img_path = getattr(el.metadata, "image_path", None)
            if img_path and os.path.isfile(img_path):
                try:
                    with open(img_path, "rb") as f:
                        b64 = base64.b64encode(f.read()).decode("utf-8")
                    el.metadata.image_base64 = b64
                    logger.info(
                        "backfill_image_from_path",
                        path=img_path,
                        base64_len=len(b64),
                    )
                except Exception as exc:
                    logger.warning("backfill_image_read_failed", path=img_path, error=str(exc))

        # For remaining elements without base64, try matching saved files
        # by order (unstructured saves them in element order)
        remaining = [
            el for el in image_elements
            if getattr(el.metadata, "image_base64", None) is None
        ]

        for idx, el in enumerate(remaining):
            if idx < len(saved_images):
                try:
                    with open(saved_images[idx], "rb") as f:
                        b64 = base64.b64encode(f.read()).decode("utf-8")
                    el.metadata.image_base64 = b64
                    logger.info(
                        "backfill_image_from_dir",
                        file=saved_images[idx],
                        base64_len=len(b64),
                    )
                except Exception as exc:
                    logger.warning(
                        "backfill_image_file_read_failed",
                        file=saved_images[idx],
                        error=str(exc),
                    )

        backfilled = sum(
            1 for el in image_elements
            if getattr(el.metadata, "image_base64", None) is not None
        )
        still_missing = len(image_elements) - backfilled
        if still_missing > 0:
            logger.warning(
                "image_base64_still_missing",
                backfilled=backfilled,
                still_missing=still_missing,
                total_images=len(image_elements),
            )
        else:
            logger.info(
                "image_backfill_complete",
                backfilled=backfilled,
            )

        self._cleanup_image_dir(image_output_dir)

    @staticmethod
    def _cleanup_image_dir(image_output_dir: str) -> None:
        """Remove the temporary image extraction directory."""
        import shutil
        try:
            shutil.rmtree(image_output_dir, ignore_errors=True)
        except Exception:
            pass

    def _elements_to_documents(
        self,
        elements: list[Any],
        source: str | bytes,
        extra_meta: dict[str, Any],
    ) -> list[Document]:
        """Convert unstructured elements into Document objects.

        Groups elements by page and separates tables, images, and titles.
        """
        if not elements:
            return []

        source_str = str(source) if isinstance(source, str) else "<bytes>"
        file_name = extra_meta.get("filename") or (Path(source).name if isinstance(source, str) else extra_meta.get("file_name", ""))
        file_type = ""
        if isinstance(source, str):
            file_type = Path(source).suffix.lstrip(".")

        return self._group_by_page(elements, source_str, file_name, file_type, extra_meta)

    def _group_by_page(
        self,
        elements: list[Any],
        source_str: str,
        file_name: str,
        file_type: str,
        extra_meta: dict[str, Any],
    ) -> list[Document]:
        """Group elements by page number, keeping tables/images/titles separate."""
        documents: list[Document] = []
        
        # Determine total pages
        page_numbers = set()
        for el in elements:
            p_num = getattr(el.metadata, "page_number", None) if hasattr(el, "metadata") else None
            if p_num:
                page_numbers.add(p_num)
        total_pages = max(page_numbers, default=1)
        
        text_buffer: list[str] = []
        last_page = None
        
        def flush_buffer():
            nonlocal text_buffer, last_page
            if text_buffer and last_page is not None:
                content = "\n\n".join(text_buffer)
                if content.strip():
                    meta = DocumentMetadata(
                        source=source_str,
                        file_name=file_name,
                        file_type=file_type,
                        page_number=last_page if last_page > 0 else None,
                        total_pages=total_pages if total_pages > 1 else None,
                        language=self._languages[0] if self._languages else "en",
                        custom={
                            **extra_meta,
                            "element_type": "text"
                        },
                    )
                    documents.append(Document(content=content, metadata=meta))
                text_buffer = []

        for el in elements:
            category = getattr(el, "category", "Text")
            text = str(el).strip()
            if not text:
                continue
                
            page_num = getattr(el.metadata, "page_number", None) if hasattr(el, "metadata") else None
            page_key = page_num or 0
            
            if last_page is not None and page_key != last_page:
                flush_buffer()
            last_page = page_key
            
            if category == "Table":
                flush_buffer()
                html = getattr(el.metadata, "text_as_html", None) if hasattr(el, "metadata") else None
                table_content = html if html else text
                meta = DocumentMetadata(
                    source=source_str,
                    file_name=file_name,
                    file_type=file_type,
                    page_number=page_key if page_key > 0 else None,
                    total_pages=total_pages if total_pages > 1 else None,
                    language=self._languages[0] if self._languages else "en",
                    custom={
                        **extra_meta,
                        "element_type": "table",
                        "table_extracted": True
                    },
                )
                documents.append(Document(content=table_content, metadata=meta))
                
            elif category in ("Image", "Picture"):
                flush_buffer()
                image_b64 = getattr(el.metadata, "image_base64", None) if hasattr(el, "metadata") else None
                meta = DocumentMetadata(
                    source=source_str,
                    file_name=file_name,
                    file_type="image",
                    page_number=page_key if page_key > 0 else None,
                    total_pages=total_pages if total_pages > 1 else None,
                    language=self._languages[0] if self._languages else "en",
                    custom={
                        **extra_meta,
                        "element_type": "image",
                        "image_extracted": True,
                        "image_base64": image_b64
                    },
                )
                documents.append(Document(content=text, metadata=meta))
                
            elif category == "Title":
                flush_buffer()
                meta = DocumentMetadata(
                    source=source_str,
                    file_name=file_name,
                    file_type=file_type,
                    page_number=page_key if page_key > 0 else None,
                    total_pages=total_pages if total_pages > 1 else None,
                    language=self._languages[0] if self._languages else "en",
                    custom={
                        **extra_meta,
                        "element_type": "title",
                        "title_extracted": True
                    },
                )
                documents.append(Document(content=text, metadata=meta))
                
            else:
                text_buffer.append(text)
                
        flush_buffer()
        return documents

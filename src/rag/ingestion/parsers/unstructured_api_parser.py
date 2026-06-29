"""Unstructured SaaS API document parser implementation.

Offloads document partitioning and layout extraction to Unstructured's hosted serverless API.
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


@ComponentRegistry.register("parser", "unstructured_api")
class UnstructuredAPIParser(BaseParser):
    """Document parser powered by the hosted Unstructured SaaS API client."""

    def __init__(
        self,
        api_url: str = "https://api.unstructured.io/general/v0/general",
        api_key: str | None = None,
        strategy: str = "hi_res",
        **kwargs: Any,
    ) -> None:
        self._api_url = api_url
        self._api_key = api_key
        self._strategy = strategy
        self._client = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                from unstructured_client import UnstructuredClient
                self._client = UnstructuredClient(
                    api_key_auth=self._api_key,
                    server_url=self._api_url,
                )
            except ImportError as e:
                logger.error("unstructured_client_import_failed", error=str(e))
                raise ImportError(
                    "unstructured-client is not installed. Install it using "
                    "`pip install unstructured-client` to use the 'unstructured_api' parser."
                ) from e
        return self._client

    @trace_operation(LifecycleStage.PARSE, "unstructured_api_parse")
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
        from unstructured_client.models import operations, shared

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
                logger.error("unstructured_api_read_file_failed", path=str(path), error=str(e))
                raise
        else:
            file_data = source
            if not file_name:
                file_name = "document"
            if not file_type:
                file_type = "pdf"

        client = self._get_client()

        # Build parameters
        req = operations.PartitionRequest(
            partition_parameters=shared.PartitionParameters(
                files=shared.Files(
                    content=file_data,
                    file_name=file_name,
                ),
                strategy=self._strategy,
                languages=["en"],
            )
        )

        try:
            res = client.general.partition(request=req)
            if not res or not hasattr(res, "elements") or not res.elements:
                logger.warning("unstructured_api_returned_no_elements")
                return []

            elements = res.elements
            return self._elements_to_documents(elements, source, file_name, file_type, extra_meta)
        except Exception as e:
            logger.error("unstructured_api_call_failed", error=str(e))
            # Basic fallback
            meta = DocumentMetadata(
                source=str(source) if isinstance(source, str) else "<bytes>",
                file_name=file_name,
                file_type=file_type,
                page_number=1,
                total_pages=1,
                language="en",
                custom={**extra_meta, "parser": "unstructured_api_fallback"},
            )
            content = file_data.decode("utf-8", errors="ignore") if isinstance(source, bytes) else f"[Fallback] Failed to parse {source}"
            return [Document(content=content, metadata=meta)]

    def _elements_to_documents(
        self,
        elements: list[dict[str, Any] | Any],
        source: str | bytes,
        file_name: str,
        file_type: str,
        extra_meta: dict[str, Any],
    ) -> list[Document]:
        documents: list[Document] = []
        source_str = str(source) if isinstance(source, str) else "<bytes>"

        # Pre-process elements: check if they are dicts or objects
        parsed_elements = []
        for el in elements:
            if hasattr(el, "model_dump"):
                parsed_elements.append(el.model_dump())
            elif isinstance(el, dict):
                parsed_elements.append(el)
            else:
                # Fallback to getattr
                parsed_elements.append({
                    "type": getattr(el, "type", "Text"),
                    "text": getattr(el, "text", ""),
                    "metadata": getattr(el, "metadata", {}),
                })

        # Group elements by page
        page_groups: dict[int, list[dict[str, Any]]] = {}
        for el in parsed_elements:
            metadata = el.get("metadata") or {}
            page_num = metadata.get("page_number") or 1
            if page_num not in page_groups:
                page_groups[page_num] = []
            page_groups[page_num].append(el)

        total_pages = max(page_groups.keys(), default=1)

        # Output documents per page
        for page_num, page_elements in sorted(page_groups.items()):
            text_parts = []
            tables = []
            images = []

            for el in page_elements:
                el_type = el.get("type", "Text")
                text = el.get("text", "").strip()
                if not text:
                    continue

                el_meta = el.get("metadata") or {}

                if el_type == "Table":
                    # Extract HTML table representation
                    html = el_meta.get("text_as_html") or text
                    tables.append(html)
                    # Also append raw text for searchable context
                    text_parts.append(text)
                elif el_type in ("Image", "Picture"):
                    img_b64 = el_meta.get("image_base64")
                    if img_b64:
                        images.append(img_b64)
                    text_parts.append(text)
                else:
                    text_parts.append(text)

            content = "\n\n".join(text_parts)
            if content.strip():
                meta = DocumentMetadata(
                    source=source_str,
                    file_name=file_name,
                    file_type=file_type,
                    page_number=page_num,
                    total_pages=total_pages if total_pages > 1 else None,
                    language="en",
                    custom={
                        **extra_meta,
                        "parser": "unstructured_api",
                        "tables_html": tables,
                        "images_base64": images,
                    },
                )
                documents.append(Document(content=content, metadata=meta))

        return documents

    @trace_operation(LifecycleStage.PARSE, "unstructured_api_parse_batch")
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
                logger.error("unstructured_api_batch_item_failed", index=i, error=str(result))
                continue
            documents.extend(result)
        return documents

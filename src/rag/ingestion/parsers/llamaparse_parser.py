"""LlamaParse document parser implementation.

Uses LlamaIndex's cloud-based LlamaParse API for high-fidelity parsing of
complex documents (PDFs with tables, charts, and multi-column layouts).
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
from ...core.types import Document, DocumentMetadata, LifecycleStage
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("parser", "llamaparse")
class LlamaParseParser(BaseParser):
    """Document parser powered by the LlamaParse cloud API.

    Excels at extracting structured content from complex PDFs with tables,
    charts, and multi-column layouts.

    Args:
        api_key: LlamaParse API key (or set ``LLAMA_CLOUD_API_KEY`` env var).
        result_type: Output format — ``"markdown"`` or ``"text"``.
        num_workers: Number of parallel workers for batch processing.
        language: Document language hint for better parsing.
        parsing_instruction: Optional natural-language instruction for the parser.
        premium_mode: Whether to use the premium (higher-quality) parsing mode.
        max_timeout: Maximum timeout in seconds for a single parse call.
    """

    def __init__(
        self,
        api_key: str | None = None,
        result_type: str = "markdown",
        num_workers: int = 4,
        language: str = "en",
        parsing_instruction: str | None = None,
        premium_mode: bool = False,
        max_timeout: int = 300,
    ) -> None:
        self._api_key = api_key
        self._result_type = result_type
        self._num_workers = num_workers
        self._language = language
        self._parsing_instruction = parsing_instruction
        self._premium_mode = premium_mode
        self._max_timeout = max_timeout
        self._parser: Any = None

    def _get_parser(self) -> Any:
        """Lazily initialize the LlamaParse client."""
        if self._parser is None:
            from llama_parse import LlamaParse

            kwargs: dict[str, Any] = {
                "result_type": self._result_type,
                "num_workers": self._num_workers,
                "language": self._language,
                "premium_mode": self._premium_mode,
            }
            if self._api_key:
                kwargs["api_key"] = self._api_key
            if self._parsing_instruction:
                kwargs["parsing_instruction"] = self._parsing_instruction

            self._parser = LlamaParse(**kwargs)

        return self._parser

    @trace_operation(LifecycleStage.PARSE, "llamaparse_parse")
    async def parse(
        self,
        source: str | bytes,
        metadata: dict[str, Any] | None = None,
    ) -> list[Document]:
        """Parse a single document via LlamaParse.

        Args:
            source: A file path string. Bytes are written to a temp file first.
            metadata: Optional extra metadata to attach.

        Returns:
            List of Documents (one per page or logical section).
        """
        extra_meta = metadata or {}
        parser = self._get_parser()

        if isinstance(source, bytes):
            return await self._parse_bytes(source, extra_meta, parser)

        return await self._parse_file(source, extra_meta, parser)

    @trace_operation(LifecycleStage.PARSE, "llamaparse_parse_batch")
    async def parse_batch(
        self,
        sources: list[str | bytes],
        metadata: list[dict[str, Any]] | None = None,
    ) -> list[Document]:
        """Parse multiple documents concurrently via LlamaParse.

        Args:
            sources: List of file paths or raw bytes.
            metadata: Per-source metadata.

        Returns:
            Flat list of all parsed Documents.
        """
        meta_list = metadata if metadata is not None else [{}] * len(sources)
        if len(meta_list) != len(sources):
            raise ValueError(
                f"metadata length ({len(meta_list)}) must match "
                f"sources length ({len(sources)})"
            )

        semaphore = asyncio.Semaphore(self._num_workers)

        async def _bounded_parse(src: str | bytes, meta: dict[str, Any]) -> list[Document]:
            async with semaphore:
                return await self.parse(src, meta)

        tasks = [
            _bounded_parse(src, meta)
            for src, meta in zip(sources, meta_list)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        documents: list[Document] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(
                    "llamaparse_batch_item_failed",
                    source_index=i,
                    error=str(result),
                )
                continue
            documents.extend(result)

        return documents

    async def close(self) -> None:
        """Release parser resources."""
        self._parser = None

    # ── Internal ─────────────────────────────────────────────────────

    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        reraise=True,
    )
    async def _parse_file(
        self,
        file_path: str,
        extra_meta: dict[str, Any],
        parser: Any,
    ) -> list[Document]:
        """Parse a file via the LlamaParse async API with retry."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        llama_docs = await asyncio.wait_for(
            parser.aload_data(str(path)),
            timeout=self._max_timeout,
        )

        documents: list[Document] = []
        for i, ldoc in enumerate(llama_docs):
            content = ldoc.text if hasattr(ldoc, "text") else str(ldoc)
            if not content.strip():
                continue

            meta = DocumentMetadata(
                source=file_path,
                file_name=extra_meta.get("filename") or path.name,
                file_type=path.suffix.lstrip("."),
                page_number=i + 1 if len(llama_docs) > 1 else None,
                total_pages=len(llama_docs) if len(llama_docs) > 1 else None,
                language=self._language,
                custom={
                    **extra_meta,
                    "parser": "llamaparse",
                    "result_type": self._result_type,
                },
            )
            documents.append(Document(content=content, metadata=meta))

        logger.info(
            "llamaparse_file_complete",
            file=file_path,
            documents=len(documents),
        )
        return documents

    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        reraise=True,
    )
    async def _parse_bytes(
        self,
        data: bytes,
        extra_meta: dict[str, Any],
        parser: Any,
    ) -> list[Document]:
        """Parse raw bytes by writing to a temporary file first."""
        import tempfile

        file_type = extra_meta.get("file_type", "pdf")
        file_name = extra_meta.get("file_name", f"document.{file_type}")

        import os

        # Use delete=False for cross-platform compatibility (e.g. Windows file locking)
        temp_file = tempfile.NamedTemporaryFile(suffix=f".{file_type}", delete=False)
        try:
            temp_file.write(data)
            temp_file.close()

            llama_docs = await asyncio.wait_for(
                parser.aload_data(temp_file.name),
                timeout=self._max_timeout,
            )
        finally:
            try:
                os.unlink(temp_file.name)
            except Exception:
                pass

        documents: list[Document] = []
        for i, ldoc in enumerate(llama_docs):
            content = ldoc.text if hasattr(ldoc, "text") else str(ldoc)
            if not content.strip():
                continue

            meta = DocumentMetadata(
                source="<bytes>",
                file_name=file_name,
                file_type=file_type,
                page_number=i + 1 if len(llama_docs) > 1 else None,
                total_pages=len(llama_docs) if len(llama_docs) > 1 else None,
                language=self._language,
                custom={
                    **extra_meta,
                    "parser": "llamaparse",
                    "result_type": self._result_type,
                },
            )
            documents.append(Document(content=content, metadata=meta))

        logger.info(
            "llamaparse_bytes_complete",
            file_name=file_name,
            documents=len(documents),
        )
        return documents

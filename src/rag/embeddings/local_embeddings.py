"""Local embedding model using sentence-transformers.

Runs entirely on-device (CPU or GPU) with no external API calls.
Supports any HuggingFace model compatible with sentence-transformers.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
from typing import Any

import numpy as np
import structlog

from ..core.interfaces import BaseEmbeddingModel
from ..core.registry import ComponentRegistry
from ..core.types import LifecycleStage
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)

# Dedicated thread pool for embedding work — avoids contention
# with the default executor (max 5 threads) under concurrent requests.
_EMBED_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=2, thread_name_prefix="embed"
)


@ComponentRegistry.register("embedding_model", "local")
class LocalEmbeddingModel(BaseEmbeddingModel):
    """Embedding model using ``sentence-transformers`` for local inference.

    No API keys or network calls required — runs on CPU or CUDA.

    Args:
        model_name: HuggingFace model ID (e.g. ``"BAAI/bge-large-en-v1.5"``).
        device: PyTorch device string (``"cpu"``, ``"cuda"``, ``"cuda:0"``).
        batch_size: Texts per forward pass.
        normalize: Whether to L2-normalize embeddings.
        query_prefix: Optional prefix prepended to query texts.
        document_prefix: Optional prefix prepended to document texts.
    """

    def __init__(
        self,
        model_name: str = "BAAI/bge-large-en-v1.5",
        device: str = "cpu",
        batch_size: int = 64,
        normalize: bool = True,
        query_prefix: str = "",
        document_prefix: str = "",
        **kwargs: Any,
    ) -> None:
        self._model_name = model_name
        self._device = device
        self._batch_size = batch_size
        self._normalize = normalize
        self._query_prefix = query_prefix
        self._document_prefix = document_prefix
        self._model: Any = None
        self._dimensions_val: int | None = None

    def _get_model(self) -> Any:
        """Lazily load the sentence-transformer model."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            try:
                self._model = SentenceTransformer(
                    self._model_name, device=self._device
                )
            except Exception as e:
                if self._device != "cpu":
                    logger.warning(
                        "local_model_load_device_failed_falling_back_to_cpu",
                        model=self._model_name,
                        device=self._device,
                        error=str(e),
                    )
                    self._device = "cpu"
                    self._model = SentenceTransformer(
                        self._model_name, device="cpu"
                    )
                else:
                    raise e

            # Probe dimensionality
            if hasattr(self._model, "get_embedding_dimension"):
                self._dimensions_val = self._model.get_embedding_dimension()
            else:
                self._dimensions_val = self._model.get_sentence_embedding_dimension()
            logger.info(
                "local_model_loaded",
                model=self._model_name,
                device=self._device,
                dimensions=self._dimensions_val,
            )
        return self._model

    @property
    def dimensions(self) -> int:
        """Return the embedding dimensionality (loads model if needed)."""
        if self._dimensions_val is None:
            self._get_model()
        return self._dimensions_val or 768  # fallback

    @trace_operation(LifecycleStage.EMBED, "local_embed")
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Embed texts using the local model (runs in executor to avoid blocking).

        Args:
            texts: Strings to embed.

        Returns:
            List of embedding vectors.
        """
        if not texts:
            return []

        prefixed = [self._document_prefix + t for t in texts]
        loop = asyncio.get_running_loop()
        embeddings = await loop.run_in_executor(
            _EMBED_EXECUTOR, self._encode_sync, prefixed
        )

        logger.info(
            "local_embed_complete",
            model=self._model_name,
            texts=len(texts),
        )
        return embeddings

    @trace_operation(LifecycleStage.EMBED, "local_embed_query")
    async def embed_query(self, query: str) -> list[float]:
        """Embed a single query with optional query prefix.

        Args:
            query: The query text.

        Returns:
            Embedding vector.
        """
        prefixed = self._query_prefix + query
        loop = asyncio.get_running_loop()
        embeddings = await loop.run_in_executor(
            _EMBED_EXECUTOR, self._encode_sync, [prefixed]
        )
        return embeddings[0]

    async def close(self) -> None:
        """Release model from memory."""
        self._model = None
        self._dimensions_val = None

    # ── Internal ─────────────────────────────────────────────────────

    def _encode_sync(self, texts: list[str]) -> list[list[float]]:
        """Synchronous encode (called via executor)."""
        model = self._get_model()
        embeddings: np.ndarray = model.encode(
            texts,
            batch_size=self._batch_size,
            normalize_embeddings=self._normalize,
            show_progress_bar=False,
        )
        return embeddings.tolist()

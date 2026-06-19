"""Cross-Encoder reranker using sentence-transformers.

Runs a local cross-encoder model (e.g. BGE, ms-marco) to re-score
query-document pairs with high accuracy.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog

from ...core.interfaces import BaseReranker
from ...core.registry import ComponentRegistry
from ...core.types import LifecycleStage, RetrievalResult
from ...observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("reranker", "cross_encoder")
class CrossEncoderReranker(BaseReranker):
    """Reranker using a local cross-encoder model via sentence-transformers.

    Runs entirely on-device (CPU or GPU).  No API calls.

    Args:
        model_name: HuggingFace model ID (e.g. ``"BAAI/bge-reranker-v2-m3"``).
        device: PyTorch device (``"cpu"``, ``"cuda"``).
        batch_size: Query-document pairs per forward pass.
        max_length: Maximum token length for the cross-encoder input.
    """

    def __init__(
        self,
        model_name: str = "BAAI/bge-reranker-v2-m3",
        device: str = "cpu",
        batch_size: int = 32,
        max_length: int = 512,
        **kwargs: Any,
    ) -> None:
        self._model_name = model_name
        self._device = device
        self._batch_size = batch_size
        self._max_length = max_length
        self._model: Any = None

    def _get_model(self) -> Any:
        """Lazily load the cross-encoder model."""
        if self._model is None:
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(
                self._model_name,
                device=self._device,
                max_length=self._max_length,
            )
            logger.info(
                "cross_encoder_loaded",
                model=self._model_name,
                device=self._device,
            )
        return self._model

    @trace_operation(LifecycleStage.RERANK, "cross_encoder_rerank")
    async def rerank(
        self,
        query: str,
        results: list[RetrievalResult],
        top_n: int = 5,
    ) -> list[RetrievalResult]:
        """Rerank results using the local cross-encoder.

        Args:
            query: The original user query.
            results: Retrieval results to rerank.
            top_n: Number of results to return.

        Returns:
            Top-N results sorted by cross-encoder score.
        """
        if not results:
            return []

        loop = asyncio.get_running_loop()
        pairs = [(query, r.chunk.content) for r in results]

        scores = await loop.run_in_executor(
            None, self._predict_sync, pairs
        )

        # Attach rerank scores and sort
        reranked: list[RetrievalResult] = []
        for result, score in zip(results, scores):
            updated = result.model_copy(deep=True)
            updated.rerank_score = float(score)
            updated.retrieval_method = (
                f"{updated.retrieval_method}+cross_encoder"
                if updated.retrieval_method
                else "cross_encoder"
            )
            reranked.append(updated)

        reranked.sort(key=lambda r: r.rerank_score or 0, reverse=True)
        final = reranked[:top_n]

        logger.info(
            "cross_encoder_rerank_complete",
            model=self._model_name,
            input=len(results),
            output=len(final),
        )
        return final

    async def close(self) -> None:
        """Release model from memory."""
        self._model = None

    # ── Internal ─────────────────────────────────────────────────────

    def _predict_sync(self, pairs: list[tuple[str, str]]) -> list[float]:
        """Run cross-encoder prediction (sync, called via executor)."""
        model = self._get_model()
        scores = model.predict(
            pairs,
            batch_size=self._batch_size,
            show_progress_bar=False,
        )
        return scores.tolist() if hasattr(scores, "tolist") else list(scores)

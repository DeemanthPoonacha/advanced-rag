"""Ragas evaluation provider implementation.

Runs automated evaluations on queries, answers, contexts, and ground truths
using the ragas package.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from ..core.interfaces import BaseEvaluator
from ..core.registry import ComponentRegistry
from ..core.types import EvaluationResult, LifecycleStage
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


@ComponentRegistry.register("evaluator", "ragas")
class RagasEvaluator(BaseEvaluator):
    """Ragas evaluator.

    Validates generation outputs by measuring Faithfulness, Answer Relevancy,
    Context Precision, and Context Recall.
    """

    def __init__(
        self,
        metrics: list[str] | None = None,
        llm_model: str = "gpt-4o-mini",
        embeddings_model: str = "text-embedding-3-small",
        api_key: str | None = None,
        base_url: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Initialize the Ragas evaluator.

        Args:
            metrics: List of metrics to compute (e.g. 'faithfulness', 'answer_relevancy').
            llm_model: Model to use for LLM-based evaluation metrics.
            embeddings_model: Model to use for embedding-based evaluation metrics.
            api_key: Optional API key.
            base_url: Optional base URL.
            **kwargs: Extra arguments.
        """
        self._metrics_list = metrics or [
            "faithfulness",
            "answer_relevancy",
            "context_precision",
            "context_recall",
        ]
        self._llm_model = llm_model
        self._embeddings_model = embeddings_model
        self._api_key = api_key
        self._base_url = base_url
        self._kwargs = kwargs

    def _get_metrics_instances(self) -> list[Any]:
        """Dynamically load and configure Ragas metrics classes."""
        try:
            import ragas.metrics as rm
            from openai import AsyncOpenAI, OpenAI
            from ragas.embeddings import embedding_factory
            from ragas.llms import llm_factory
        except ImportError as exc:
            logger.error(
                "ragas_import_error",
                msg="ragas or datasets is not installed. Run `pip install ragas datasets` to use this provider.",
            )
            raise exc

        # Initialize clients for evaluation models
        client_kwargs: dict[str, Any] = {}
        if self._api_key:
            client_kwargs["api_key"] = self._api_key
        if self._base_url:
            client_kwargs["base_url"] = self._base_url

        async_client = AsyncOpenAI(**client_kwargs)
        sync_client = OpenAI(**client_kwargs)

        # Build evaluator instances
        evaluator_llm = llm_factory(self._llm_model, client=async_client)
        evaluator_embeddings = embedding_factory(
            "openai",
            model=self._embeddings_model,
            client=sync_client,
        )

        metrics_map = {
            "faithfulness": lambda: rm.Faithfulness(llm=evaluator_llm),
            "answer_relevancy": lambda: rm.AnswerRelevancy(llm=evaluator_llm, embeddings=evaluator_embeddings),
            "answer_relevance": lambda: rm.AnswerRelevancy(llm=evaluator_llm, embeddings=evaluator_embeddings),
            "context_precision": lambda: rm.ContextPrecision(llm=evaluator_llm),
            "context_recall": lambda: rm.ContextRecall(llm=evaluator_llm),
        }

        instances = []
        for name in self._metrics_list:
            clean_name = name.strip().lower()
            if clean_name in metrics_map:
                try:
                    instances.append(metrics_map[clean_name]())
                except Exception as exc:
                    logger.warn("ragas_metric_init_failed", metric=name, error=str(exc))
            else:
                logger.warn("ragas_unknown_metric_skipped", metric=name)

        return instances

    @trace_operation(LifecycleStage.EVALUATE, "ragas_evaluate")
    @retry(
        retry=retry_if_exception_type((ConnectionError, TimeoutError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        reraise=True,
    )
    async def evaluate(
        self,
        query: str,
        answer: str,
        contexts: list[str],
        ground_truth: str | None = None,
    ) -> EvaluationResult:
        """Run the evaluation against the configured metrics.

        Executes the ragas.evaluate function on a single record dataset in a
        separate thread to avoid blocking.
        """
        try:
            from datasets import Dataset
            from ragas import evaluate
        except ImportError as exc:
            logger.error("ragas_import_error", msg="datasets or ragas not installed.")
            raise exc

        metrics = self._get_metrics_instances()
        if not metrics:
            logger.warn("ragas_no_metrics_configured")
            return EvaluationResult()

        # Build single-row dataset
        data = {
            "question": [query],
            "answer": [answer],
            "contexts": [contexts],
        }
        if ground_truth:
            data["ground_truth"] = [ground_truth]
        else:
            # Some metrics require ground truth, populate dummy if not provided
            data["ground_truth"] = [""]

        dataset = Dataset.from_dict(data)

        logger.info("ragas_eval_start", metrics=self._metrics_list)

        # Run evaluate in executor thread
        def _run_eval():
            return evaluate(dataset, metrics=metrics)

        try:
            result = await asyncio.to_thread(_run_eval)
            scores = {k: float(v) for k, v in result.items() if isinstance(v, (int, float))}
            logger.info("ragas_eval_complete", scores=scores)
            
            # Map result dictionary to details
            details = {k: v for k, v in result.items() if k not in scores}
            
            return EvaluationResult(
                metrics=scores,
                details=details,
            )
        except Exception as exc:
            logger.error("ragas_eval_failed", error=str(exc))
            raise exc

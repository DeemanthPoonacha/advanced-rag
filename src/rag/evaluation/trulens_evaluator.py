"""TruLens evaluation provider implementation.

Runs evaluations on generation results using TruLens feedback functions.
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


@ComponentRegistry.register("evaluator", "trulens")
class TruLensEvaluator(BaseEvaluator):
    """TruLens evaluator.

    Validates generation outputs using TruLens feedback providers (e.g. OpenAI)
    for Groundedness, Answer Relevance, and Context Relevance.
    """

    def __init__(
        self,
        metrics: list[str] | None = None,
        llm_model: str = "gpt-4o-mini",
        api_key: str | None = None,
        base_url: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Initialize the TruLens evaluator.

        Args:
            metrics: List of metrics to compute (e.g. 'groundedness', 'answer_relevance').
            llm_model: Model engine to use for evaluation (e.g. 'gpt-4o-mini').
            api_key: Optional API key.
            base_url: Optional base URL.
            **kwargs: Extra arguments.
        """
        self._metrics_list = metrics or ["groundedness", "answer_relevance", "context_relevance"]
        self._llm_model = llm_model
        self._api_key = api_key
        self._base_url = base_url
        self._kwargs = kwargs
        self._provider: Any = None

    def _get_provider(self) -> Any:
        """Lazily initialize the TruLens feedback provider."""
        if self._provider is None:
            try:
                from trulens.providers.openai import OpenAI as TruLensOpenAI
            except ImportError as exc:
                logger.error(
                    "trulens_import_error",
                    msg="trulens package is not installed. Run `pip install trulens-eval` or `pip install trulens` to use this provider.",
                )
                raise exc

            kwargs: dict[str, Any] = {"model_engine": self._llm_model}
            if self._api_key:
                kwargs["api_key"] = self._api_key
            if self._base_url:
                kwargs["base_url"] = self._base_url
            
            self._provider = TruLensOpenAI(**kwargs)
        return self._provider

    @trace_operation(LifecycleStage.EVALUATE, "trulens_evaluate")
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
        """Run TruLens evaluation feedback functions.

        Evaluates groundedness (response vs context), answer relevance (response
        vs query), and context relevance (each context vs query, averaged).
        """
        provider = self._get_provider()
        
        scores: dict[str, float] = {}
        details: dict[str, Any] = {}

        logger.info("trulens_eval_start", metrics=self._metrics_list)

        try:
            tasks = []
            metric_names = []

            # 1. Groundedness
            if "groundedness" in self._metrics_list:
                try:
                    from trulens.feedback.groundedness import Groundedness
                    groundedness_tool = Groundedness(groundedness_provider=provider)
                    
                    # Call direct execution in separate thread
                    def _eval_groundedness():
                        source = "\n".join(contexts)
                        return groundedness_tool.groundedness_measure_with_cot_reasons(
                            source=source,
                            statement=answer,
                        )
                    tasks.append(asyncio.to_thread(_eval_groundedness))
                    metric_names.append("groundedness")
                except Exception as exc:
                    logger.warn("trulens_groundedness_init_failed", error=str(exc))

            # 2. Answer Relevance
            if "answer_relevance" in self._metrics_list or "answer_relevancy" in self._metrics_list:
                def _eval_answer_relevance():
                    return provider.relevance_with_cot_reasons(
                        prompt=query,
                        response=answer,
                    )
                tasks.append(asyncio.to_thread(_eval_answer_relevance))
                metric_names.append("answer_relevance")

            # 3. Context Relevance
            if "context_relevance" in self._metrics_list or "context_relevancy" in self._metrics_list:
                def _eval_context_relevance():
                    if not contexts:
                        return 0.0, "No context provided"
                    
                    # Compute relevance for each context chunk and average
                    chunk_results = []
                    for idx, ctx in enumerate(contexts):
                        res = provider.context_relevance_with_cot_reasons(
                            question=query,
                            context=ctx,
                        )
                        chunk_results.append(res)

                    import numpy as np
                    
                    scores_list = []
                    explanations = []
                    for res in chunk_results:
                        if isinstance(res, tuple):
                            scores_list.append(res[0])
                            explanations.append(res[1])
                        else:
                            scores_list.append(res)
                            explanations.append(None)
                    
                    mean_score = float(np.mean(scores_list))
                    combined_expl = "; ".join([f"Chunk {i}: {expl}" for i, expl in enumerate(explanations) if expl])
                    return mean_score, combined_expl

                tasks.append(asyncio.to_thread(_eval_context_relevance))
                metric_names.append("context_relevance")

            if not tasks:
                return EvaluationResult()

            # Execute all feedback functions concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for name, res in zip(metric_names, results):
                if isinstance(res, Exception):
                    logger.error("trulens_metric_failed", metric=name, error=str(res))
                    continue
                
                # Check format of feedback output (score, reason) or score
                if isinstance(res, tuple) and len(res) == 2:
                    score, reason = res
                    scores[name] = float(score)
                    details[f"{name}_reason"] = reason
                else:
                    scores[name] = float(res)

            logger.info("trulens_eval_complete", scores=scores)
            return EvaluationResult(metrics=scores, details=details)

        except Exception as exc:
            logger.error("trulens_eval_failed", error=str(exc))
            raise exc

from unittest.mock import AsyncMock, MagicMock, patch
from tests.conftest import (
    mock_openai,
    mock_nemo,
    mock_datasets,
    mock_ragas,
    mock_ragas_metrics,
    mock_ragas_embeddings,
    mock_ragas_llms,
    mock_trulens,
    mock_trulens_provider,
    mock_trulens_groundedness
)

import pytest
from rag.guardrails.llama_guard import LlamaGuard
from rag.guardrails.nemo_guardrails import NeMoGuardrails
from rag.evaluation.ragas_evaluator import RagasEvaluator
from rag.evaluation.trulens_evaluator import TruLensEvaluator
from rag.core.types import GuardrailResult, EvaluationResult


@pytest.mark.asyncio
async def test_llama_guard_safe():
    mock_choice = MagicMock()
    mock_choice.message.content = "safe"
    mock_response = MagicMock(choices=[mock_choice])
    
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    mock_openai.AsyncOpenAI.return_value = mock_client
    
    guard = LlamaGuard(api_key="fake")
    res = await guard.validate("safe query")
    assert res.is_safe is True
    assert res.confidence == 1.0


@pytest.mark.asyncio
async def test_llama_guard_unsafe():
    mock_choice = MagicMock()
    # Return unsafe with category codes
    mock_choice.message.content = "unsafe\nS1, S5"
    mock_response = MagicMock(choices=[mock_choice])
    
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    mock_openai.AsyncOpenAI.return_value = mock_client
    
    guard = LlamaGuard(api_key="fake")
    res = await guard.validate("unsafe query")
    assert res.is_safe is False
    assert "S1" in res.violation_category
    assert "Violent Crimes" in res.explanation


@pytest.mark.asyncio
async def test_nemo_guardrails_safe():
    mock_app = MagicMock()
    mock_app.generate_async = AsyncMock(return_value="This is a safe assistant response.")
    
    mock_nemo.RailsConfig.from_content.return_value = MagicMock()
    mock_nemo.RailsApp.return_value = mock_app
    
    guard = NeMoGuardrails(config_dict={"yaml_content": "test"})
    res = await guard.validate("hello")
    assert res.is_safe is True
    mock_app.generate_async.assert_called_once_with(prompt="hello")


@pytest.mark.asyncio
async def test_nemo_guardrails_blocked():
    mock_app = MagicMock()
    # Returns one of the fallback messages indicating block
    mock_app.generate_async = AsyncMock(return_value="I cannot answer that question.")
    
    mock_nemo.RailsConfig.from_content.return_value = MagicMock()
    mock_nemo.RailsApp.return_value = mock_app
    
    guard = NeMoGuardrails(config_dict={"yaml_content": "test"})
    res = await guard.validate("unsafe text")
    assert res.is_safe is False
    assert res.violation_category == "NEMO_GUARDRAILS_POLICY"


@pytest.mark.asyncio
async def test_ragas_evaluator():
    # Mock Ragas evaluate function
    mock_eval_res = {
        "faithfulness": 0.95,
        "answer_relevancy": 0.85
    }
    mock_ragas.evaluate = MagicMock(return_value=mock_eval_res)
    mock_ragas.metrics = MagicMock()
    mock_ragas.embeddings = MagicMock()
    mock_ragas.llms = MagicMock()
    
    # Mock dataset from_dict
    mock_datasets.Dataset.from_dict.return_value = MagicMock()
    
    # OpenAI client mock
    mock_openai.OpenAI = MagicMock()
    
    evaluator = RagasEvaluator(metrics=["faithfulness", "answer_relevancy"], api_key="fake")
    res = await evaluator.evaluate(
        query="What is RAG?",
        answer="Retrieval Augmented Generation",
        contexts=["RAG stands for Retrieval Augmented Generation"]
    )
    
    assert isinstance(res, EvaluationResult)
    assert res.metrics["faithfulness"] == 0.95
    assert res.metrics["answer_relevancy"] == 0.85


@pytest.mark.asyncio
async def test_trulens_evaluator():
    # Mock the TruLens provider
    mock_provider_instance = MagicMock()
    mock_provider_instance.relevance_with_cot_reasons.return_value = (0.9, "Highly relevant")
    mock_provider_instance.context_relevance_with_cot_reasons.return_value = (0.8, "Reasonable context")
    
    mock_trulens_provider.OpenAI.return_value = mock_provider_instance
    
    # Mock Groundedness tool
    mock_groundedness_instance = MagicMock()
    mock_groundedness_instance.groundedness_measure_with_cot_reasons.return_value = (0.95, "Very grounded")
    mock_trulens_groundedness.Groundedness.return_value = mock_groundedness_instance
    
    evaluator = TruLensEvaluator(metrics=["groundedness", "answer_relevance", "context_relevance"], api_key="fake")
    res = await evaluator.evaluate(
        query="What is RAG?",
        answer="Retrieval Augmented Generation",
        contexts=["RAG is Retrieval Augmented Generation"]
    )
    
    assert isinstance(res, EvaluationResult)
    assert res.metrics["groundedness"] == 0.95
    assert res.metrics["answer_relevance"] == 0.9
    assert res.metrics["context_relevance"] == 0.8
    assert res.details["groundedness_reason"] == "Very grounded"
    assert "Reasonable context" in res.details["context_relevance_reason"]

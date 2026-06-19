import sys
from unittest.mock import MagicMock

# 1. Create and inject all shared mock modules into sys.modules
mock_openai = MagicMock()
mock_anthropic = MagicMock()
mock_cohere = MagicMock()
mock_sentence_transformers = MagicMock()
mock_qdrant = MagicMock()
mock_qdrant_models = MagicMock()
mock_pinecone = MagicMock()
mock_pymilvus = MagicMock()
mock_asyncpg = MagicMock()
mock_nemo = MagicMock()
mock_datasets = MagicMock()
mock_ragas = MagicMock()
mock_ragas_metrics = MagicMock()
mock_ragas_embeddings = MagicMock()
mock_ragas_llms = MagicMock()
mock_trulens = MagicMock()
mock_trulens_provider = MagicMock()
mock_trulens_groundedness = MagicMock()
mock_unstructured_partition = MagicMock()
mock_llama_parse = MagicMock()

sys.modules["openai"] = mock_openai
sys.modules["anthropic"] = mock_anthropic
sys.modules["cohere"] = mock_cohere
sys.modules["sentence_transformers"] = mock_sentence_transformers
sys.modules["qdrant_client"] = mock_qdrant
sys.modules["qdrant_client.models"] = mock_qdrant_models
sys.modules["pinecone"] = mock_pinecone
sys.modules["pymilvus"] = mock_pymilvus
sys.modules["asyncpg"] = mock_asyncpg
sys.modules["nemoguardrails"] = mock_nemo
sys.modules["datasets"] = mock_datasets
sys.modules["ragas"] = mock_ragas
sys.modules["ragas.metrics"] = mock_ragas_metrics
sys.modules["ragas.embeddings"] = mock_ragas_embeddings
sys.modules["ragas.llms"] = mock_ragas_llms
sys.modules["trulens"] = mock_trulens
sys.modules["trulens.providers"] = MagicMock()
sys.modules["trulens.providers.openai"] = mock_trulens_provider
sys.modules["trulens.feedback"] = MagicMock()
sys.modules["trulens.feedback.groundedness"] = mock_trulens_groundedness
sys.modules["unstructured"] = MagicMock()
sys.modules["unstructured.partition"] = MagicMock()
sys.modules["unstructured.partition.auto"] = mock_unstructured_partition
sys.modules["llama_parse"] = mock_llama_parse


# 2. Define a fixture to reset the mocks before each test
import pytest

@pytest.fixture(autouse=True)
def reset_global_mocks():
    # Reset all call counts and history
    mock_openai.reset_mock()
    mock_anthropic.reset_mock()
    mock_cohere.reset_mock()
    mock_sentence_transformers.reset_mock()
    mock_qdrant.reset_mock()
    mock_qdrant_models.reset_mock()
    mock_pinecone.reset_mock()
    mock_pymilvus.reset_mock()
    mock_asyncpg.reset_mock()
    mock_nemo.reset_mock()
    mock_datasets.reset_mock()
    mock_ragas.reset_mock()
    mock_ragas_metrics.reset_mock()
    mock_ragas_embeddings.reset_mock()
    mock_ragas_llms.reset_mock()
    mock_trulens.reset_mock()
    mock_trulens_provider.reset_mock()
    mock_trulens_groundedness.reset_mock()
    mock_unstructured_partition.reset_mock()
    mock_llama_parse.reset_mock()

    # Clear configured return values to prevent test leakage
    mock_openai.AsyncOpenAI.return_value = MagicMock()
    mock_openai.OpenAI.return_value = MagicMock()
    mock_anthropic.AsyncAnthropic.return_value = MagicMock()
    mock_cohere.AsyncClientV2.return_value = MagicMock()
    mock_sentence_transformers.SentenceTransformer.return_value = MagicMock()
    mock_sentence_transformers.CrossEncoder.return_value = MagicMock()
    mock_qdrant.AsyncQdrantClient.return_value = MagicMock()
    mock_pinecone.Pinecone.return_value = MagicMock()
    mock_pymilvus.MilvusClient.return_value = MagicMock()
    mock_asyncpg.create_pool.return_value = MagicMock()
    mock_llama_parse.LlamaParse.return_value = MagicMock()

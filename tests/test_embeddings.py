from unittest.mock import AsyncMock, MagicMock, patch
from tests.conftest import mock_openai, mock_cohere, mock_sentence_transformers

import pytest
from rag.embeddings.openai_embeddings import OpenAIEmbeddingModel
from rag.embeddings.cohere_embeddings import CohereEmbeddingModel
from rag.embeddings.local_embeddings import LocalEmbeddingModel


@pytest.mark.asyncio
async def test_openai_embedding_model():
    mock_response = MagicMock()
    mock_data = [
        MagicMock(index=0, embedding=[0.1, 0.2, 0.3]),
        MagicMock(index=1, embedding=[0.4, 0.5, 0.6]),
    ]
    mock_response.data = mock_data

    mock_client = MagicMock()
    mock_client.embeddings.create = AsyncMock(return_value=mock_response)
    mock_client.close = AsyncMock()
    
    mock_openai.AsyncOpenAI.return_value = mock_client

    embedder = OpenAIEmbeddingModel(
        model="text-embedding-3-small",
        api_key="fake-key",
        batch_size=2
    )
    
    # Test dimensions property
    assert embedder.dimensions == 1536
    
    # Test embed batch
    texts = ["hello", "world"]
    embeddings = await embedder.embed(texts)
    assert embeddings == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
    
    # Verify call details
    mock_client.embeddings.create.assert_called_once_with(
        input=["hello", "world"],
        model="text-embedding-3-small"
    )
    
    # Test embed query
    mock_client.embeddings.create.reset_mock()
    mock_response.data = [MagicMock(index=0, embedding=[0.1, 0.2, 0.3])]
    query_emb = await embedder.embed_query("hello")
    assert query_emb == [0.1, 0.2, 0.3]
    mock_client.embeddings.create.assert_called_once_with(
        input=["hello"],
        model="text-embedding-3-small"
    )
    
    # Test close
    await embedder.close()
    mock_client.close.assert_called_once()
    assert embedder._client is None


@pytest.mark.asyncio
async def test_openai_embedding_model_rate_limiting():
    mock_response = MagicMock()
    mock_response.data = [MagicMock(index=0, embedding=[0.1, 0.2, 0.3])]

    mock_client = MagicMock()
    mock_client.embeddings.create = AsyncMock(
        side_effect=[Exception("Rate limit exceeded 429"), mock_response]
    )
    
    mock_openai.AsyncOpenAI.return_value = mock_client

    with patch("asyncio.sleep", AsyncMock()):
        embedder = OpenAIEmbeddingModel(api_key="fake-key")
        embeddings = await embedder.embed(["hello"])
        assert embeddings == [[0.1, 0.2, 0.3]]
        assert mock_client.embeddings.create.call_count == 2


@pytest.mark.asyncio
async def test_cohere_embedding_model():
    mock_response = MagicMock()
    # v2 API returns response.embeddings.float_
    mock_float = [[0.1, 0.2, 0.3]]
    mock_response.embeddings = MagicMock(float_=mock_float)

    mock_client = MagicMock()
    mock_client.embed = AsyncMock(return_value=mock_response)
    mock_client.close = AsyncMock()

    mock_cohere.AsyncClientV2.return_value = mock_client

    embedder = CohereEmbeddingModel(
        model="embed-english-v3.0",
        api_key="fake-key"
    )
    
    assert embedder.dimensions == 1024
    
    # Embed document
    embeddings = await embedder.embed(["hello"])
    assert embeddings == [[0.1, 0.2, 0.3]]
    mock_client.embed.assert_called_once_with(
        texts=["hello"],
        model="embed-english-v3.0",
        input_type="search_document",
        embedding_types=["float"]
    )
    
    # Embed query
    mock_client.embed.reset_mock()
    query_emb = await embedder.embed_query("test query")
    assert query_emb == [0.1, 0.2, 0.3]
    mock_client.embed.assert_called_once_with(
        texts=["test query"],
        model="embed-english-v3.0",
        input_type="search_query",
        embedding_types=["float"]
    )


@pytest.mark.asyncio
async def test_local_embedding_model():
    mock_model = MagicMock()
    mock_model.get_sentence_embedding_dimension = MagicMock(return_value=768)
    mock_model.encode = MagicMock(return_value=MagicMock(tolist=lambda: [[0.1, 0.2]]))

    mock_sentence_transformers.SentenceTransformer.return_value = mock_model

    embedder = LocalEmbeddingModel(
        model_name="BAAI/bge-small-en-v1.5",
        query_prefix="Represent this: ",
        document_prefix="Doc: "
    )
    
    # Test lazy load & dimension check
    assert embedder.dimensions == 768
    mock_model.get_sentence_embedding_dimension.assert_called_once()
    
    # Test document embedding
    embeddings = await embedder.embed(["hello"])
    assert embeddings == [[0.1, 0.2]]
    mock_model.encode.assert_called_once_with(
        ["Doc: hello"],
        batch_size=64,
        normalize_embeddings=True,
        show_progress_bar=False
    )
    
    # Test query embedding
    mock_model.encode.reset_mock()
    query_emb = await embedder.embed_query("question")
    assert query_emb == [0.1, 0.2]
    mock_model.encode.assert_called_once_with(
        ["Represent this: question"],
        batch_size=64,
        normalize_embeddings=True,
        show_progress_bar=False
    )

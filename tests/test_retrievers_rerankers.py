from unittest.mock import AsyncMock, MagicMock, patch
from tests.conftest import mock_cohere, mock_sentence_transformers

import pytest
from pydantic import BaseModel
from rag.core.types import Chunk, DocumentMetadata, RetrievalResult, QueryContext, SparseVector
from rag.retrieval.strategies.simple_retriever import SimpleRetriever
from rag.retrieval.strategies.multi_query import MultiQueryRetriever, ExpandedQueries
from rag.retrieval.strategies.contextual_compression import ContextualCompressionRetriever, CompressedContent
from rag.retrieval.strategies.auto_merging import AutoMergingRetriever
from rag.retrieval.rerankers.cohere_reranker import CohereReranker
from rag.retrieval.rerankers.cross_encoder_reranker import CrossEncoderReranker


@pytest.fixture
def setup_retrieval_data():
    metadata = DocumentMetadata(source="doc.txt", file_name="doc.txt")
    chunk1 = Chunk(id="child-1", content="child content 1", document_id="doc-1", parent_id="parent-1", metadata=metadata)
    chunk2 = Chunk(id="child-2", content="child content 2", document_id="doc-1", parent_id="parent-1", metadata=metadata)
    parent_chunk = Chunk(id="parent-1", content="parent text is much longer than child content", document_id="doc-1", children_ids=["child-1", "child-2"], metadata=metadata)
    
    res1 = RetrievalResult(chunk=chunk1, score=0.8, retrieval_method="dense")
    res2 = RetrievalResult(chunk=chunk2, score=0.7, retrieval_method="dense")
    res_parent = RetrievalResult(chunk=parent_chunk, score=0.9, retrieval_method="dense")
    
    return chunk1, chunk2, parent_chunk, res1, res2, res_parent


@pytest.mark.asyncio
async def test_simple_retriever(setup_retrieval_data):
    _, _, _, res1, res2, _ = setup_retrieval_data
    
    mock_store = MagicMock()
    mock_store.search = AsyncMock(return_value=[res1, res2])
    mock_store.hybrid_search = AsyncMock(return_value=[res1])
    
    mock_embed = MagicMock()
    mock_embed.embed_query = AsyncMock(return_value=[0.1, 0.2])
    mock_embed.embed_sparse = AsyncMock(return_value=SparseVector(indices=[1], values=[1.0]))
    
    # 1. Dense search
    retriever = SimpleRetriever(vector_store=mock_store, embedding_model=mock_embed)
    ctx = QueryContext(original_query="hello", top_k=2)
    results = await retriever.retrieve(ctx)
    assert len(results) == 2
    assert results[0].score == 0.8
    mock_store.search.assert_called_once()


@pytest.mark.asyncio
async def test_multi_query_retriever(setup_retrieval_data):
    _, _, _, res1, res2, _ = setup_retrieval_data
    
    mock_store = MagicMock()
    # Simple search mockup
    mock_store.search = AsyncMock(side_effect=[[res1], [res2], []])
    
    mock_embed = MagicMock()
    mock_embed.embed_query = AsyncMock(return_value=[0.1])
    
    mock_llm = MagicMock()
    mock_llm.generate_structured = AsyncMock(return_value=ExpandedQueries(queries=["q1", "q2"]))
    
    retriever = MultiQueryRetriever(
        vector_store=mock_store,
        embedding_model=mock_embed,
        llm=mock_llm,
        num_queries=2,
        top_k=2
    )
    
    ctx = QueryContext(original_query="hello")
    results = await retriever.retrieve(ctx)
    
    # Expect RRF fused result lists
    assert len(results) > 0
    assert results[0].retrieval_method == "multi_query_rrf"
    assert mock_llm.generate_structured.call_count == 1
    assert mock_store.search.call_count == 3  # original query + 2 expansions


@pytest.mark.asyncio
async def test_contextual_compression_retriever(setup_retrieval_data):
    _, _, _, res1, _, _ = setup_retrieval_data
    
    mock_store = MagicMock()
    mock_store.search = AsyncMock(return_value=[res1])
    
    mock_embed = MagicMock()
    mock_embed.embed_query = AsyncMock(return_value=[0.1])
    
    mock_llm = MagicMock()
    mock_llm.generate_structured = AsyncMock(return_value=CompressedContent(compressed="compressed content", is_relevant=True))
    
    retriever = ContextualCompressionRetriever(
        vector_store=mock_store,
        embedding_model=mock_embed,
        llm=mock_llm,
        top_k=1
    )
    
    ctx = QueryContext(original_query="hello")
    results = await retriever.retrieve(ctx)
    
    assert len(results) == 1
    assert results[0].chunk.content == "compressed content"
    assert results[0].retrieval_method == "contextual_compression"


@pytest.mark.asyncio
async def test_auto_merging_retriever(setup_retrieval_data):
    _, _, _, res1, res2, res_parent = setup_retrieval_data
    
    mock_store = MagicMock()
    # First search gets the child candidate list
    mock_store.search = AsyncMock(return_value=[res1, res2])
    # Parent lookup uses get_by_id
    mock_store.get_by_id = AsyncMock(return_value=res_parent.chunk)
    
    mock_embed = MagicMock()
    mock_embed.embed_query = AsyncMock(return_value=[0.1])
    
    retriever = AutoMergingRetriever(
        vector_store=mock_store,
        embedding_model=mock_embed,
        merge_threshold=0.5, # 2 children retrieved of 2 parent children = 1.0 fraction >= 0.5
        top_k=2
    )
    
    ctx = QueryContext(original_query="hello")
    results = await retriever.retrieve(ctx)
    
    assert len(results) == 1
    assert results[0].retrieval_method == "auto_merged"
    assert results[0].chunk.content == "parent text is much longer than child content"


@pytest.mark.asyncio
async def test_cohere_reranker(setup_retrieval_data):
    _, _, _, res1, res2, _ = setup_retrieval_data
    
    mock_client = MagicMock()
    mock_result1 = MagicMock(index=0, relevance_score=0.95)
    mock_result2 = MagicMock(index=1, relevance_score=0.45)
    mock_client.rerank = AsyncMock(return_value=MagicMock(results=[mock_result1, mock_result2]))
    mock_client.close = AsyncMock()
    
    mock_cohere.AsyncClientV2.return_value = mock_client
    
    reranker = CohereReranker(api_key="fake")
    results = await reranker.rerank(
        query="hello",
        results=[res1, res2],
        top_n=2
    )
    
    assert len(results) == 2
    assert results[0].rerank_score == 0.95
    assert results[0].retrieval_method == "dense+cohere_rerank"
    assert results[1].rerank_score == 0.45


@pytest.mark.asyncio
async def test_cross_encoder_reranker(setup_retrieval_data):
    _, _, _, res1, res2, _ = setup_retrieval_data
    
    mock_model = MagicMock()
    mock_model.predict = MagicMock(return_value=MagicMock(tolist=lambda: [0.99, 0.33]))
    
    mock_sentence_transformers.CrossEncoder.return_value = mock_model
    
    reranker = CrossEncoderReranker()
    results = await reranker.rerank(
        query="hello",
        results=[res1, res2],
        top_n=2
    )
    
    assert len(results) == 2
    assert results[0].rerank_score == 0.99
    assert results[0].retrieval_method == "dense+cross_encoder"
    assert results[1].rerank_score == 0.33

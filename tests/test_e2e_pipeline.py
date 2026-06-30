import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path
import json
import numpy as np
import httpx

from rag.config.loader import load_config_from_dict
from rag.pipeline.orchestrator import RAGPipelineOrchestrator
from tests.conftest import (
    mock_qdrant,
    mock_qdrant_models,
    mock_sentence_transformers,
    mock_openai,
    mock_ragas,
    mock_datasets,
)
from rag.core.types import SparseVector, Chunk, DocumentMetadata


class FakePointStruct:
    def __init__(self, id, vector, payload):
        self.id = id
        self.vector = vector
        self.payload = payload


class FakeFilterSelector:
    def __init__(self, filter):
        self.filter = filter

class FakeFilter:
    def __init__(self, must):
        self.must = must

class FakeFieldCondition:
    def __init__(self, key, match):
        self.key = key
        self.match = match

class FakeMatchValue:
    def __init__(self, value):
        self.value = value


@pytest.fixture(autouse=True)
def setup_qdrant_mocks(monkeypatch):
    monkeypatch.setattr(mock_qdrant_models, "PointStruct", FakePointStruct)
    monkeypatch.setattr(mock_qdrant_models, "FilterSelector", FakeFilterSelector)
    monkeypatch.setattr(mock_qdrant_models, "Filter", FakeFilter)
    monkeypatch.setattr(mock_qdrant_models, "FieldCondition", FakeFieldCondition)
    monkeypatch.setattr(mock_qdrant_models, "MatchValue", FakeMatchValue)
    monkeypatch.setattr(mock_qdrant_models, "SparseVector", MagicMock())
    monkeypatch.setattr(mock_qdrant_models, "VectorParams", MagicMock())
    monkeypatch.setattr(mock_qdrant_models, "SparseIndexParams", MagicMock())
    monkeypatch.setattr(mock_qdrant_models, "SparseVectorParams", MagicMock())
    monkeypatch.setattr(mock_qdrant_models, "Distance", MagicMock())


# 1. Custom mock for AsyncQdrantClient that operates in memory to support end-to-end list and query
class MemoryQdrantClient:
    def __init__(self, *args, **kwargs):
        self.collections_list = []
        self.points_by_collection = {}

    async def get_collections(self):
        res = MagicMock()
        res.collections = self.collections_list
        return res

    async def create_collection(self, collection_name, **kwargs):
        class MockCollection:
            def __init__(self, name):
                self.name = name
        
        self.collections_list.append(MockCollection(collection_name))
        self.points_by_collection[collection_name] = []

    async def upsert(self, collection_name, points, **kwargs):
        if collection_name not in self.points_by_collection:
            self.points_by_collection[collection_name] = []
        self.points_by_collection[collection_name].extend(points)

    async def query_points(self, collection_name, query=None, limit=10, prefetch=None, **kwargs):
        points = self.points_by_collection.get(collection_name, [])
        hits = []
        for p in points:
            # Simple scored point mock
            hit = MagicMock()
            hit.id = p.id
            hit.payload = p.payload
            # Dense query vs hybrid prefetch structure
            hit.score = 0.95
            hits.append(hit)
        
        res = MagicMock()
        res.points = hits[:limit]
        return res

    async def scroll(self, collection_name, limit=1000, offset=None, scroll_filter=None, **kwargs):
        points = self.points_by_collection.get(collection_name, [])
        records = []
        for p in points:
            rec = MagicMock()
            rec.id = p.id
            rec.payload = p.payload
            records.append(rec)
        return records, None

    async def delete(self, collection_name, points_selector, **kwargs):
        # Delete helper that accepts selectors
        if hasattr(points_selector, "points"):
            ids_to_del = set(points_selector.points)
            self.points_by_collection[collection_name] = [
                p for p in self.points_by_collection.get(collection_name, [])
                if p.id not in ids_to_del
            ]
        elif hasattr(points_selector, "filter") and points_selector.filter:
            # Filter selector matching metadata e.g. delete_by_metadata
            must = getattr(points_selector.filter, "must", [])
            for condition in must:
                key = getattr(condition, "key", None)
                match = getattr(condition, "match", None)
                val = getattr(match, "value", None) if match else None
                if key and val is not None:
                    self.points_by_collection[collection_name] = [
                        p for p in self.points_by_collection.get(collection_name, [])
                        if p.payload.get(key) != val
                    ]

    async def get_collection(self, collection_name):
        res = MagicMock()
        res.points_count = len(self.points_by_collection.get(collection_name, []))
        return res

    async def close(self):
        pass


# Helper mock class to iterate lines in streaming responses
class E2EAsyncIteratorMock:
    def __init__(self, items):
        self.items = items
        self.idx = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.idx >= len(self.items):
            raise StopAsyncIteration
        item = self.items[self.idx]
        self.idx += 1
        return item


@pytest.fixture
def base_e2e_config():
    return {
        "project": {"name": "e2e-rag-pipeline", "environment": "development"},
        "ingestion": {
            "parser": {"provider": "pymupdf"},
            "chunker": {
                "provider": "recursive",
                "config": {"target_chunk_size": 250, "chunk_overlap": 20}
            },
            "batch_size": 2,
            "enable_multimodal_enrichment": True,
            "multimodal_enricher": {
                "provider": "openai",
                "model_name": "gpt-4o",
                "temperature": 0.0,
                "table_prompt": "Translate table to Markdown.",
                "image_prompt": "Generate visual description."
            }
        },
        "embeddings": {
            "provider": "local",
            "config": {"model_name": "BAAI/bge-small-en-v1.5", "device": "cpu"}
        },
        "llm": {
            "provider": "local",
            "config": {
                "base_url": "http://localhost:11434/v1",
                "model": "llama3",
                "temperature": 0.2
            }
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {"collection_name": "e2e-collection", "vector_size": 384}
        },
        "retrieval": {
            "strategy": "simple",
            "top_k": 3
        },
        "generation": {
            "include_sources": True,
            "max_context_chunks": 3
        },
        "guardrails": {
            "enabled": True,
            "input": {"provider": "llama_guard"},
            "output": {"provider": "llama_guard"}
        },
        "evaluation": {
            "enabled": True,
            "provider": "ragas"
        }
    }


@pytest.mark.asyncio
async def test_e2e_pipeline_full_workflow(base_e2e_config, tmp_path):
    # 1. Mock global libraries
    # Local embedding model mocks
    mock_transformer = MagicMock()
    mock_transformer.get_sentence_embedding_dimension.return_value = 384
    mock_transformer.get_embedding_dimension.return_value = 384
    
    # Return fake vectors of size 384 as a numpy array
    def mock_encode(texts, **kwargs):
        return np.ones((len(texts), 384))
    
    mock_transformer.encode = mock_encode
    mock_sentence_transformers.SentenceTransformer.return_value = mock_transformer

    # Qdrant client E2E Memory mock
    memory_client = MemoryQdrantClient()
    mock_qdrant.AsyncQdrantClient.return_value = memory_client

    # Mock Llama Guard responses
    mock_openai_client = MagicMock()
    # input safe, output safe
    mock_safe_response = MagicMock(choices=[MagicMock(message=MagicMock(content="safe"))])
    mock_openai_client.chat.completions.create = AsyncMock(return_value=mock_safe_response)
    mock_openai.AsyncOpenAI.return_value = mock_openai_client

    # Mock Ragas Evaluation
    mock_ragas.evaluate = MagicMock(return_value={"faithfulness": 0.98, "answer_relevancy": 0.92})
    mock_datasets.Dataset.from_dict.return_value = MagicMock()

    # 2. Setup the Orchestrator
    config = load_config_from_dict(base_e2e_config)
    orchestrator = RAGPipelineOrchestrator(config)

    # 3. Patch fitz PDF reader to return layout elements
    mock_page1 = MagicMock()
    mock_page1.get_text.return_value = "This is a document talking about Retrieval-Augmented Generation (RAG)."
    
    mock_page2 = MagicMock()
    mock_page2.get_text.return_value = "<table><tr><td>RAG Benefits</td><td>Accuracy & Control</td></tr></table>"
    
    mock_doc = MagicMock()
    mock_doc.__len__.return_value = 2
    mock_doc.__getitem__.side_effect = [mock_page1, mock_page2]

    # Mock httpx response for Local LLM (Multimodal visual/table enrichment)
    # The pipeline has enable_multimodal_enrichment=True.
    # The parser gets text, and table HTML.
    # When PyMuPDF parses, let's mock it to return table document elements.
    # Let's mock fitz.open and patch HTTPX response for the LLM enrichment and answer generation
    with patch("fitz.open", return_value=mock_doc):
        # We need mock responses for local LLM requests
        # We'll mock httpx.AsyncClient post and stream requests
        mock_httpx_response = MagicMock()
        mock_httpx_response.json.return_value = {
            "choices": [
                {"message": {"content": "Enriched Table Markdown or local LLM generated response"}}
            ],
            "usage": {"prompt_tokens": 50, "completion_tokens": 10}
        }
        mock_httpx_response.raise_for_status = MagicMock()
        
        # Intercept httpx AsyncClient post method
        with patch("httpx.AsyncClient.post", AsyncMock(return_value=mock_httpx_response)):
            
            # Step 1: Ingest document
            dummy_file = tmp_path / "rag_guide.pdf"
            dummy_file.touch()

            # Execute ingestion E2E
            chunk_ids = await orchestrator.ingest_source(str(dummy_file))
            
            # Verify ingestion successfully stored points in Qdrant memory store
            assert len(chunk_ids) > 0
            assert len(memory_client.points_by_collection["e2e-collection"]) == len(chunk_ids)
            
            # Check the ingestion status log
            status = orchestrator.ingestion_status.get("rag_guide.pdf")
            assert status is not None
            assert status["status"] == "completed"
            assert status["step"] == 3
            assert status["chunks_count"] == len(chunk_ids)

            # Step 2: Query pipeline E2E
            query_text = "What is Retrieval-Augmented Generation?"
            
            # We mock the query completion LLM response
            query_mock_response = MagicMock()
            query_mock_response.json.return_value = {
                "choices": [
                    {"message": {"content": "Retrieval-Augmented Generation (RAG) is a technique that uses external document search to improve LLM answers."}}
                ],
                "usage": {"prompt_tokens": 120, "completion_tokens": 40}
            }
            query_mock_response.raise_for_status = MagicMock()

            with patch("httpx.AsyncClient.post", AsyncMock(return_value=query_mock_response)):
                gen_result = await orchestrator.query(query_text)
                
                # Assertions on E2E query result
                assert gen_result.answer == "Retrieval-Augmented Generation (RAG) is a technique that uses external document search to improve LLM answers."
                assert len(gen_result.sources) > 0
                assert gen_result.sources[0].chunk.content is not None
                
                # Check metrics & evaluation outputs
                assert "evaluation" in gen_result.metadata
                assert gen_result.metadata["evaluation"]["metrics"]["faithfulness"] == 0.98
                assert gen_result.metadata["evaluation"]["metrics"]["answer_relevancy"] == 0.92
                
                # Check status stats
                assert gen_result.metadata["num_sources_retrieved"] > 0
                assert gen_result.metadata["num_sources_used"] > 0

            # Step 3: Stream Query E2E
            # We mock httpx AsyncClient stream context manager
            stream_cm = AsyncMock()
            stream_cm.aiter_lines = MagicMock(return_value=E2EAsyncIteratorMock([
                'data: {"choices": [{"delta": {"content": "RAG "}}]}',
                'data: {"choices": [{"delta": {"content": "improves "}}]}',
                'data: {"choices": [{"delta": {"content": "LLM accuracy."}}]}',
                'data: [DONE]'
            ]))
            stream_cm.raise_for_status = MagicMock()
            
            with patch("httpx.AsyncClient.stream") as mock_stream_method:
                mock_stream_method.return_value.__aenter__ = AsyncMock(return_value=stream_cm)
                mock_stream_method.return_value.__aexit__ = AsyncMock()
                
                streamed_tokens = []
                async for chunk in orchestrator.query_stream("Tell me about streaming"):
                    streamed_tokens.append(chunk)
                
                # Check streamed answer aggregation
                full_stream_answer = "".join(streamed_tokens)
                assert full_stream_answer == "RAG improves LLM accuracy."

            # Step 4: Deletion E2E
            # Verify we can delete document chunks by filename
            await orchestrator.vector_store.delete_by_metadata("file_name", "rag_guide.pdf")
            assert len(memory_client.points_by_collection["e2e-collection"]) == 0

    await orchestrator.close()


@pytest.mark.asyncio
async def test_e2e_pipeline_guardrails_blocking(base_e2e_config, tmp_path):
    # Setup mock to block input guardrail
    mock_openai_client = MagicMock()
    mock_unsafe_response = MagicMock(choices=[MagicMock(message=MagicMock(content="unsafe\nS1, S3"))])
    mock_openai_client.chat.completions.create = AsyncMock(return_value=mock_unsafe_response)
    mock_openai.AsyncOpenAI.return_value = mock_openai_client

    # Initialize orchestrator
    config = load_config_from_dict(base_e2e_config)
    orchestrator = RAGPipelineOrchestrator(config)

    # In memory client mock
    mock_q_client = MagicMock()
    mock_collections_res = MagicMock()
    mock_collections_res.collections = []
    mock_q_client.get_collections = AsyncMock(return_value=mock_collections_res)
    mock_q_client.create_collection = AsyncMock()
    mock_qdrant.AsyncQdrantClient.return_value = mock_q_client

    # Run query with unsafe content
    gen_result = await orchestrator.query("How to make something unsafe?")
    
    # Assert query was blocked by input guardrail
    assert gen_result.metadata.get("input_guardrail_blocked") is True
    assert "safety policies" in gen_result.answer
    assert gen_result.sources == []
    
    # Run streaming query under unsafe conditions
    streamed_tokens = []
    async for chunk in orchestrator.query_stream("Unsafe query"):
        streamed_tokens.append(chunk)
        
    full_answer = "".join(streamed_tokens)
    assert "safety policies" in full_answer

    await orchestrator.close()

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Any, AsyncIterator
from pydantic import BaseModel

from rag.config.loader import load_config_from_dict
from rag.pipeline.orchestrator import RAGPipelineOrchestrator
from rag.core.registry import ComponentRegistry
from rag.core.interfaces import (
    BaseParser,
    BaseChunker,
    BaseEmbeddingModel,
    BaseLLM,
    BaseVectorStore,
    BaseRetriever,
    BaseReranker,
    BaseGuardrail,
    BaseEvaluator,
)
from rag.core.types import (
    Document,
    Chunk,
    DocumentMetadata,
    RetrievalResult,
    GuardrailResult,
    EvaluationResult,
    SparseVector,
)


# Mock classes for Orchestrator test
class MockParser(BaseParser):
    async def parse(self, source, metadata=None):
        meta = DocumentMetadata(source=str(source), file_name="doc.txt")
        return [Document(content="parsed content", metadata=meta)]
    async def parse_batch(self, sources, metadata=None):
        meta = DocumentMetadata(source="batch", file_name="doc.txt")
        return [Document(content="parsed content", metadata=meta) for _ in sources]

class MockChunker(BaseChunker):
    async def chunk(self, document):
        return [Chunk(content=document.content, document_id=document.id, metadata=document.metadata)]
    async def chunk_batch(self, documents):
        return [Chunk(content=doc.content, document_id=doc.id, metadata=doc.metadata) for doc in documents]

class MockEmbeddingModel(BaseEmbeddingModel):
    async def embed(self, texts):
        return [[0.1, 0.2, 0.3] for _ in texts]
    async def embed_query(self, query):
        return [0.1, 0.2, 0.3]
    async def embed_sparse(self, texts):
        return [SparseVector(indices=[1], values=[1.0]) for _ in texts]
    def _get_model(self):
        """No-op for testing — satisfies pre-warm call in orchestrator __init__."""
        pass
    @property
    def dimensions(self):
        return 3

class MockLLM(BaseLLM):
    async def generate(self, prompt, **kwargs):
        return "LLM generated response"
    async def generate_stream(self, prompt, **kwargs) -> AsyncIterator[str]:
        yield "LLM "
        yield "streamed "
        yield "response"
    async def generate_structured(self, prompt, output_schema, **kwargs):
        return output_schema()

class MockVectorStore(BaseVectorStore):
    def __init__(self, **kwargs):
        self.initialized = False
        self.chunks = []
    async def initialize(self):
        self.initialized = True
    async def upsert(self, chunks):
        for chunk in chunks:
            existing_idx = next((i for i, c in enumerate(self.chunks) if c.id == chunk.id), None)
            if existing_idx is not None:
                self.chunks[existing_idx] = chunk
            else:
                self.chunks.append(chunk)
        return [c.id for c in chunks]
    async def search(self, query_embedding, top_k=10, filters=None):
        return []
    async def hybrid_search(self, query_embedding, sparse_vector, top_k=10, alpha=0.5, filters=None):
        return []
    async def delete(self, ids):
        pass
    async def count(self):
        return len(self.chunks)
    async def delete_by_metadata(self, key: str, value: Any) -> None:
        self.chunks = [c for c in self.chunks if getattr(c.metadata, key, None) != value]
    async def list_chunks(self, limit: int = 10000):
        return self.chunks[:limit]
    async def list_chunks_by_metadata(self, key: str, value: Any, limit: int = 1000):
        """Server-side filtered chunk listing."""
        return [c for c in self.chunks if getattr(c.metadata, key, None) == value][:limit]
    async def get_unique_metadata_values(self, key: str, limit: int = 10000):
        """Get unique values for a metadata field."""
        values = set()
        for c in self.chunks:
            val = getattr(c.metadata, key, None)
            if val:
                values.add(str(val))
        return list(values)
    async def get_by_id(self, id: str):
        found = [c for c in self.chunks if c.id == id]
        return found[0] if found else None
    async def close(self):
        pass

class MockRetriever(BaseRetriever):
    def __init__(self, **kwargs):
        self.vector_store = kwargs.get("vector_store")
    async def retrieve(self, context):
        metadata = DocumentMetadata(source="retrieved_doc", file_name="retrieved_doc.txt")
        chunk = Chunk(id="chunk-id", content="retrieved chunk content", document_id="doc-id", metadata=metadata)
        return [RetrievalResult(chunk=chunk, score=0.85, retrieval_method="dense")]

class MockReranker(BaseReranker):
    async def rerank(self, query, results, top_n=5):
        for r in results:
            r.rerank_score = 0.95
        return results

class MockGuardrail(BaseGuardrail):
    def __init__(self, **kwargs):
        self.should_block = False
    async def validate(self, text, context=None):
        if self.should_block:
            return GuardrailResult(is_safe=False, violation_category="SAFETY_VIOLATION", explanation="Unsafe content")
        return GuardrailResult(is_safe=True)

class MockEvaluator(BaseEvaluator):
    async def evaluate(self, query, answer, contexts, ground_truth=None):
        return EvaluationResult(metrics={"faithfulness": 0.99}, details={"reason": "Excellent"})


@pytest.fixture(autouse=True)
def setup_orchestrator_mocks(monkeypatch):
    monkeypatch.setattr(ComponentRegistry, "discover", lambda: None)
    ComponentRegistry.reset()
    
    ComponentRegistry.register("parser", "unstructured")(MockParser)
    ComponentRegistry.register("chunker", "semantic")(MockChunker)
    ComponentRegistry.register("embedding_model", "openai")(MockEmbeddingModel)
    ComponentRegistry.register("llm", "openai")(MockLLM)
    ComponentRegistry.register("vector_store", "qdrant")(MockVectorStore)
    ComponentRegistry.register("retriever", "simple")(MockRetriever)
    ComponentRegistry.register("reranker", "cohere")(MockReranker)
    ComponentRegistry.register("guardrail", "llama_guard")(MockGuardrail)
    ComponentRegistry.register("evaluator", "ragas")(MockEvaluator)
    
    yield
    ComponentRegistry.reset()


@pytest.fixture
def orchestrator_config():
    raw_config = {
        "project": {"name": "orch-test", "environment": "development"},
        "ingestion": {
            "parser": {"provider": "unstructured"},
            "chunker": {"provider": "semantic"},
            "batch_size": 5
        },
        "embeddings": {"provider": "openai"},
        "llm": {"provider": "openai"},
        "vector_store": {"provider": "qdrant"},
        "retrieval": {
            "strategy": "simple",
            "top_k": 5,
            "reranker": {"provider": "cohere"}
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
    return load_config_from_dict(raw_config)


@pytest.mark.asyncio
async def test_orchestrator_ingestion(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)
    
    # 1. Ingest single source
    ids = await orchestrator.ingest_source("single_doc.txt")
    assert len(ids) == 1
    assert len(orchestrator.vector_store.chunks) == 1
    assert orchestrator.vector_store.initialized is True
    
    # Check that embeddings/sparse vectors were attached
    chunk = orchestrator.vector_store.chunks[0]
    assert chunk.embedding == [0.1, 0.2, 0.3]
    assert chunk.sparse_embedding == {1: 1.0}
    
    # 2. Ingest batch
    orchestrator.vector_store.chunks.clear()
    batch_ids = await orchestrator.ingest_batch(["doc1.txt", "doc2.txt"])
    assert len(batch_ids) == 2
    assert len(orchestrator.vector_store.chunks) == 2


@pytest.mark.asyncio
async def test_orchestrator_query_success(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)
    
    result = await orchestrator.query("What is the system latency?", metadata={"filters": {"category": "test"}})
    
    assert result.answer == "LLM generated response"
    assert len(result.sources) == 1
    assert result.sources[0].rerank_score == 0.95
    assert result.metadata["evaluation"]["metrics"]["faithfulness"] == 0.99
    assert result.metadata["num_sources_retrieved"] == 1
    assert result.metadata["num_sources_used"] == 1


@pytest.mark.asyncio
async def test_orchestrator_query_input_guardrail_blocks(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)
    orchestrator.input_guardrail.should_block = True
    
    result = await orchestrator.query("blocked input query")
    
    assert "safety policies" in result.answer
    assert result.sources == []
    assert result.metadata["input_guardrail_blocked"] is True
    assert result.metadata["violation_category"] == "SAFETY_VIOLATION"


@pytest.mark.asyncio
async def test_orchestrator_query_output_guardrail_blocks(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)
    orchestrator.output_guardrail.should_block = True
    
    result = await orchestrator.query("safe query but response unsafe")
    
    assert "violated safety policies" in result.answer
    assert result.sources == []
    assert result.metadata["output_guardrail_blocked"] is True


@pytest.mark.asyncio
async def test_orchestrator_query_stream(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)
    
    tokens = []
    async for token in orchestrator.query_stream("Stream this query"):
        tokens.append(token)
        
    assert "".join(tokens) == "LLM streamed response"


@pytest.mark.asyncio
async def test_orchestrator_query_stream_blocked(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)
    orchestrator.input_guardrail.should_block = True
    
    tokens = []
    async for token in orchestrator.query_stream("blocked input query"):
        tokens.append(token)
        
    assert len(tokens) == 1
    assert "safety policies" in tokens[0]


@pytest.mark.asyncio
async def test_orchestrator_close(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)
    
    # Set mock close methods
    orchestrator.parser.close = AsyncMock()
    orchestrator.embedding_model.close = AsyncMock()
    orchestrator.vector_store.close = AsyncMock()
    orchestrator.llm.close = AsyncMock()
    orchestrator.reranker.close = AsyncMock()
    
    await orchestrator.close()
    
    orchestrator.parser.close.assert_called_once()
    orchestrator.embedding_model.close.assert_called_once()
    orchestrator.vector_store.close.assert_called_once()
    orchestrator.llm.close.assert_called_once()
    orchestrator.reranker.close.assert_called_once()


@pytest.mark.asyncio
async def test_orchestrator_update_missing_summaries(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)

    # 1. Create a chunk that is missing a summary but has tables_html
    meta = DocumentMetadata(
        source="doc_with_table.txt",
        file_name="doc_with_table.txt",
        custom={
            "tables_html": ["<table></table>"],
            "raw_text": "This is raw table text.",
        }
    )
    chunk = Chunk(
        id="chunk-1",
        content="This is raw table text.",
        document_id="doc-1",
        metadata=meta,
        chunk_index=0,
        token_count=5
    )

    # Put it in the mock vector store
    orchestrator.vector_store.chunks = [chunk]

    # Mock embed to keep track of calls
    orchestrator.embedding_model.embed = AsyncMock(return_value=[[0.9, 0.9, 0.9]])

    # 2. Run update_missing_summaries
    num_updated, remaining = await orchestrator.update_missing_summaries()

    assert num_updated == 1
    assert remaining == 0
    assert len(orchestrator.vector_store.chunks) == 1
    
    updated_chunk = orchestrator.vector_store.chunks[0]
    assert updated_chunk.content == "LLM generated response"
    assert updated_chunk.metadata.custom["summary_text"] == "LLM generated response"
    assert updated_chunk.embedding == [0.9, 0.9, 0.9]
    orchestrator.embedding_model.embed.assert_called_once_with(["LLM generated response"])


@pytest.mark.asyncio
async def test_history_aware_query_condensation(orchestrator_config):
    orchestrator = RAGPipelineOrchestrator(orchestrator_config)
    await orchestrator.initialize()

    prompt_received = []
    async def mock_generate(prompt, **kwargs):
        prompt_received.append(prompt)
        if "standalone" in prompt.lower() or "rewrite" in prompt.lower():
            return "standalone condensed query"
        return "final synthesized answer"

    orchestrator.llm.generate = mock_generate
    orchestrator.retriever.retrieve = AsyncMock(return_value=[])

    chat_history = [
        {"sender": "user", "text": "What is advanced RAG?"},
        {"sender": "assistant", "text": "It is an advanced framework."}
    ]

    res = await orchestrator.query(
        user_query="Can you list its parsers?",
        chat_history=chat_history
    )

    # 1. Verify query condensation prompt was sent to LLM
    assert len(prompt_received) >= 2
    condensation_prompt = prompt_received[0]
    assert "what is advanced rag?" in condensation_prompt.lower()
    assert "can you list its parsers?" in condensation_prompt.lower()

    # 2. Verify retriever was called with the condensed query
    orchestrator.retriever.retrieve.assert_called_once()
    called_q_ctx = orchestrator.retriever.retrieve.call_args[0][0]
    assert called_q_ctx.original_query == "standalone condensed query"

    # 3. Verify final generation prompt has formatted chat history
    final_prompt = prompt_received[1]
    assert "chat history:" in final_prompt.lower()
    assert "what is advanced rag?" in final_prompt.lower()
    assert "can you list its parsers?" in final_prompt.lower()



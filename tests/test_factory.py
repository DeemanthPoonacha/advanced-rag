import pytest
from typing import Any
from pydantic import BaseModel
from rag.config.loader import load_config_from_dict
from rag.core.factory import ComponentFactory
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


# Mock Implementation Classes
class MockParser(BaseParser):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def parse(self, source, metadata=None): return []
    async def parse_batch(self, sources, metadata=None): return []

class MockChunker(BaseChunker):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def chunk(self, document): return []
    async def chunk_batch(self, documents): return []

class MockEmbeddingModel(BaseEmbeddingModel):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def embed(self, texts): return []
    async def embed_query(self, query): return []
    @property
    def dimensions(self): return 1536

class MockLLM(BaseLLM):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def generate(self, prompt, **kwargs): return ""
    async def generate_stream(self, prompt, **kwargs):
        yield ""
    async def generate_structured(self, prompt, output_schema, **kwargs):
        return output_schema()

class MockVectorStore(BaseVectorStore):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def initialize(self): pass
    async def upsert(self, chunks): return []
    async def search(self, query_embedding, top_k=10, filters=None): return []
    async def hybrid_search(self, query_embedding, sparse_vector, top_k=10, alpha=0.5, filters=None): return []
    async def delete(self, ids): pass
    async def count(self): return 0
    async def delete_by_metadata(self, key: str, value: Any) -> None: pass
    async def list_chunks(self, limit: int = 10000): return []
    async def get_by_id(self, id: str): return None
    async def close(self): pass

class MockRetriever(BaseRetriever):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def retrieve(self, context): return []

class MockReranker(BaseReranker):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def rerank(self, query, results, top_n=5): return []

class MockGuardrail(BaseGuardrail):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def validate(self, text, context=None):
        from rag.core.types import GuardrailResult
        return GuardrailResult(is_safe=True)

class MockEvaluator(BaseEvaluator):
    def __init__(self, **kwargs):
        self.kwargs = kwargs
    async def evaluate(self, query, answer, contexts, ground_truth=None):
        from rag.core.types import EvaluationResult
        return EvaluationResult()


@pytest.fixture(autouse=True)
def setup_mock_registry(monkeypatch):
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


def test_factory_creation():
    raw_config = {
        "project": {"name": "factory-test"},
        "ingestion": {
            "parser": {
                "provider": "unstructured",
                "config": {"strategy": "hi_res"}
            },
            "chunker": {
                "provider": "semantic",
                "config": {"target_chunk_size": 500}
            }
        },
        "embeddings": {
            "provider": "openai",
            "config": {"model": "text-embedding-3-small"}
        },
        "llm": {
            "provider": "openai",
            "config": {"model": "gpt-4o-mini"}
        },
        "vector_store": {
            "provider": "qdrant",
            "config": {"url": "http://localhost:6333"}
        },
        "retrieval": {
            "strategy": "simple",
            "top_k": 10,
            "similarity_threshold": 0.5,
            "config": {"merge_threshold": 0.4},
            "reranker": {
                "provider": "cohere",
                "config": {"model": "rerank-english-v3.0"}
            }
        },
        "guardrails": {
            "enabled": True,
            "input": {
                "provider": "llama_guard",
                "config": {"model": "meta-llama/Llama-Guard-3-8B"}
            },
            "output": {
                "provider": "llama_guard",
                "config": {"model": "meta-llama/Llama-Guard-3-8B"}
            }
        },
        "evaluation": {
            "enabled": True,
            "provider": "ragas",
            "config": {"metrics": ["faithfulness"]}
        }
    }
    
    config = load_config_from_dict(raw_config)
    factory = ComponentFactory(config)
    
    # Test created parser
    parser = factory.create_parser()
    assert isinstance(parser, MockParser)
    assert parser.kwargs["strategy"] == "hi_res"
    
    # Test created chunker
    chunker = factory.create_chunker()
    assert isinstance(chunker, MockChunker)
    assert chunker.kwargs["target_chunk_size"] == 500
    
    # Test created embedding model
    embed_model = factory.create_embedding_model()
    assert isinstance(embed_model, MockEmbeddingModel)
    assert embed_model.kwargs["model"] == "text-embedding-3-small"
    
    # Test created LLM
    llm = factory.create_llm()
    assert isinstance(llm, MockLLM)
    assert llm.kwargs["model"] == "gpt-4o-mini"
    
    # Test created vector store
    store = factory.create_vector_store()
    assert isinstance(store, MockVectorStore)
    assert store.kwargs["url"] == "http://localhost:6333"
    
    # Test created retriever
    retriever = factory.create_retriever(store, embed_model, llm)
    assert isinstance(retriever, MockRetriever)
    assert retriever.kwargs["vector_store"] is store
    assert retriever.kwargs["embedding_model"] is embed_model
    assert retriever.kwargs["llm"] is llm
    assert retriever.kwargs["top_k"] == 10
    assert retriever.kwargs["similarity_threshold"] == 0.5
    assert retriever.kwargs["merge_threshold"] == 0.4
    
    # Test created reranker
    reranker = factory.create_reranker()
    assert isinstance(reranker, MockReranker)
    assert reranker.kwargs["model"] == "rerank-english-v3.0"
    
    # Test guardrails
    input_guard = factory.create_input_guardrail()
    assert isinstance(input_guard, MockGuardrail)
    assert input_guard.kwargs["model"] == "meta-llama/Llama-Guard-3-8B"
    
    output_guard = factory.create_output_guardrail()
    assert isinstance(output_guard, MockGuardrail)
    assert output_guard.kwargs["model"] == "meta-llama/Llama-Guard-3-8B"
    
    # Test evaluator
    evaluator = factory.create_evaluator()
    assert isinstance(evaluator, MockEvaluator)
    assert evaluator.kwargs["metrics"] == ["faithfulness"]


def test_factory_disabled_or_missing_components():
    raw_config = {
        "project": {"name": "factory-test-missing"},
        "ingestion": {},
        "embeddings": {"provider": "openai"},
        "llm": {"provider": "openai"},
        "vector_store": {"provider": "qdrant"},
        "retrieval": {
            "strategy": "simple",
            "reranker": None
        },
        "guardrails": {
            "enabled": False
        },
        "evaluation": None
    }
    
    config = load_config_from_dict(raw_config)
    factory = ComponentFactory(config)
    
    assert factory.create_reranker() is None
    assert factory.create_input_guardrail() is None
    assert factory.create_output_guardrail() is None
    assert factory.create_evaluator() is None

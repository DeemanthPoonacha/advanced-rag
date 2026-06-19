import asyncio
from pydantic import BaseModel
from rag.config.loader import load_config_from_dict
from rag.core.registry import ComponentRegistry
from rag.core.factory import ComponentFactory
from rag.core.interfaces import (
    BaseParser, BaseChunker, BaseEmbeddingModel,
    BaseLLM, BaseVectorStore, BaseRetriever
)

# 1. Define Mock Components (we will register them manually after discovery)
class SandboxParser(BaseParser):
    async def parse(self, source, metadata=None):
        from rag.core.types import Document, DocumentMetadata
        return [Document(content=f"Extracted content from {source}", metadata=DocumentMetadata(source=str(source)))]
    async def parse_batch(self, sources, metadata=None):
        return []

class SandboxChunker(BaseChunker):
    async def chunk(self, document):
        from rag.core.types import Chunk
        return [Chunk(content=document.content, document_id=document.id, chunk_index=0)]
    async def chunk_batch(self, documents):
        chunks = []
        for doc in documents:
            chunks.extend(await self.chunk(doc))
        return chunks

class SandboxEmbedder(BaseEmbeddingModel):
    async def embed(self, texts):
        return [[0.1] * self.dimensions for _ in texts]
    async def embed_query(self, query):
        return [0.1] * self.dimensions
    @property
    def dimensions(self):
        return 4

class SandboxDB(BaseVectorStore):
    def __init__(self, **kwargs):
        self.storage = []
    async def initialize(self): pass
    async def upsert(self, chunks):
        self.storage.extend(chunks)
        return [c.id for c in chunks]
    async def search(self, query_embedding, top_k=10, filters=None):
        from rag.core.types import RetrievalResult
        return [RetrievalResult(chunk=c, score=0.99) for c in self.storage]
    async def hybrid_search(self, q_emb, s_vec, top_k=10, alpha=0.5, filters=None):
        return []
    async def delete(self, ids): pass
    async def count(self): return len(self.storage)
    async def close(self): pass

class SandboxRetriever(BaseRetriever):
    def __init__(self, vector_store, embedding_model, **kwargs):
        self.db = vector_store
        self.embedder = embedding_model
    async def retrieve(self, context):
        q_emb = await self.embedder.embed_query(context.original_query)
        return await self.db.search(q_emb, top_k=context.top_k)

class SandboxLLM(BaseLLM):
    async def generate(self, prompt, **kwargs):
        return f"Hello! Generated answer based on: {prompt[:80]}..."
    async def generate_stream(self, prompt, **kwargs):
        yield ""
    async def generate_structured(self, prompt, output_schema, **kwargs):
        return output_schema()

# 2. Write Execution Workflow
async def main():
    print("--- Initializing Registry Discovery ---")
    # Manually run discover() first so registry lists are populated with library classes
    ComponentRegistry.discover()

    # Register our mock implementations to overwrite standard classes for this test run
    ComponentRegistry.register("parser", "unstructured")(SandboxParser)
    ComponentRegistry.register("chunker", "semantic")(SandboxChunker)
    ComponentRegistry.register("embedding_model", "openai")(SandboxEmbedder)
    ComponentRegistry.register("vector_store", "qdrant")(SandboxDB)
    ComponentRegistry.register("retriever", "simple")(SandboxRetriever)
    ComponentRegistry.register("llm", "openai")(SandboxLLM)

    # Load raw configuration matching validated keys
    raw_config = {
        "project": {"name": "sandbox", "environment": "development"},
        "ingestion": {
            "parser": {"provider": "unstructured"},
            "chunker": {"provider": "semantic"},
            "batch_size": 10
        },
        "embeddings": {"provider": "openai"},
        "llm": {"provider": "openai"},
        "vector_store": {"provider": "qdrant", "config": {}},
        "retrieval": {"strategy": "simple", "top_k": 3}
    }
    
    # Validate and load config models
    config = load_config_from_dict(raw_config)
    
    # Factory instantiates components dynamically (resolving our overrides)
    factory = ComponentFactory(config)
    parser = factory.create_parser()
    chunker = factory.create_chunker()
    embedder = factory.create_embedding_model()
    db = factory.create_vector_store()
    retriever = factory.create_retriever(vector_store=db, embedding_model=embedder)
    llm = factory.create_llm()
    
    # Run Ingest Workflow
    print("\n--- Running Ingest ---")
    docs = await parser.parse("dummy_doc.txt")
    chunks = await chunker.chunk_batch(docs)
    embeddings = await embedder.embed([c.content for c in chunks])
    for i, c in enumerate(chunks):
        c.embedding = embeddings[i]
    await db.initialize()
    chunk_ids = await db.upsert(chunks)
    print(f"Upserted Chunk IDs: {chunk_ids}")
    
    # Run Retrieve and Generate Workflow
    print("\n--- Running Retrieve & Generate ---")
    from rag.core.types import QueryContext
    ctx = QueryContext(original_query="What is the pipeline performance?")
    retrieved_results = await retriever.retrieve(ctx)
    print(f"Retrieved: {[r.chunk.content for r in retrieved_results]}")
    
    context_str = "\n".join(r.chunk.content for r in retrieved_results)
    answer = await llm.generate(f"Query: {ctx.original_query}\nContext: {context_str}")
    print(f"Answer: {answer}")

if __name__ == "__main__":
    asyncio.run(main())

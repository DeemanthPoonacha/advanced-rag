import sys
import json
from unittest.mock import AsyncMock, MagicMock, patch
from tests.conftest import mock_qdrant, mock_qdrant_models, mock_pinecone, mock_pymilvus, mock_asyncpg
mock_pc_module = mock_pinecone

import pytest
from rag.vectorstores.qdrant_store import QdrantVectorStore
from rag.vectorstores.pinecone_store import PineconeVectorStore
from rag.vectorstores.milvus_store import MilvusVectorStore
from rag.vectorstores.pgvector_store import PgvectorStore
from rag.core.types import Chunk, DocumentMetadata, SparseVector


# Set up Qdrant models mocks
class FakeDistance:
    COSINE = "cosine"
    EUCLID = "euclid"
    DOT = "dot"

class FakePointStruct:
    def __init__(self, id, vector, payload):
        self.id = id
        self.vector = vector
        self.payload = payload

mock_qdrant_models.Distance = FakeDistance
mock_qdrant_models.SparseIndexParams = MagicMock()
mock_qdrant_models.SparseVectorParams = MagicMock()
mock_qdrant_models.VectorParams = MagicMock()
mock_qdrant_models.PointStruct = FakePointStruct
mock_qdrant_models.SparseVector = MagicMock()
mock_qdrant_models.FusionQuery = MagicMock()
mock_qdrant_models.Prefetch = MagicMock()
mock_qdrant_models.PointIdsList = MagicMock()
mock_qdrant_models.FieldCondition = MagicMock()
mock_qdrant_models.Filter = MagicMock()
mock_qdrant_models.MatchValue = MagicMock()


@pytest.fixture
def sample_chunks():
    metadata = DocumentMetadata(source="doc.txt", file_name="doc.txt", file_type="text")
    return [
        Chunk(
            id="chunk-1",
            content="Hello world",
            document_id="doc-1",
            metadata=metadata,
            embedding=[0.1, 0.2, 0.3],
            sparse_embedding={10: 0.5, 20: 0.8},
            chunk_index=0,
            token_count=2
        )
    ]


@pytest.mark.asyncio
async def test_qdrant_store(sample_chunks):
    mock_client = MagicMock()
    mock_qdrant.AsyncQdrantClient.return_value = mock_client

    # 1. initialize
    mock_collections_res = MagicMock()
    mock_collections_res.collections = [MagicMock(name="existing-col")]
    mock_client.get_collections = AsyncMock(return_value=mock_collections_res)
    mock_client.create_collection = AsyncMock()

    store = QdrantVectorStore(collection_name="documents", distance="cosine")
    await store.initialize()
    
    mock_client.create_collection.assert_called_once()

    # 2. upsert
    mock_client.upsert = AsyncMock()
    ids = await store.upsert(sample_chunks)
    assert ids == ["chunk-1"]
    mock_client.upsert.assert_called_once()

    # 3. search
    mock_hit = MagicMock(id="chunk-1", score=0.9, payload={
        "content": "Hello world",
        "document_id": "doc-1",
        "source": "doc.txt",
        "file_name": "doc.txt"
    })
    mock_query_res = MagicMock()
    mock_query_res.points = [mock_hit]
    mock_client.query_points = AsyncMock(return_value=mock_query_res)
    search_res = await store.search([0.1, 0.2, 0.3], top_k=1)
    assert len(search_res) == 1
    assert search_res[0].chunk.content == "Hello world"
    assert search_res[0].score == 0.9

    # 4. hybrid search
    mock_query_points_res = MagicMock()
    mock_query_points_res.points = [mock_hit]
    mock_client.query_points = AsyncMock(return_value=mock_query_points_res)
    
    hybrid_res = await store.hybrid_search(
        query_embedding=[0.1, 0.2, 0.3],
        sparse_vector=SparseVector(indices=[10], values=[0.5])
    )
    assert len(hybrid_res) == 1
    assert hybrid_res[0].chunk.id == "chunk-1"

    # 5. count
    mock_collection_info = MagicMock(points_count=5)
    mock_client.get_collection = AsyncMock(return_value=mock_collection_info)
    assert await store.count() == 5

    # 6. delete & close
    mock_client.delete = AsyncMock()
    mock_client.close = AsyncMock()
    await store.delete(["chunk-1"])
    await store.close()
    mock_client.delete.assert_called_once()
    mock_client.close.assert_called_once()


@pytest.mark.asyncio
async def test_pinecone_store(sample_chunks):
    mock_index = MagicMock()
    mock_pc = MagicMock()
    mock_pc.Index.return_value = mock_index
    mock_pc.list_indexes.return_value = [MagicMock(name="documents")]
    
    mock_pc_module.Pinecone.return_value = mock_pc
    mock_pc_module.ServerlessSpec = MagicMock()

    store = PineconeVectorStore(index_name="documents", namespace="test-ns")
    
    # 1. initialize
    await store.initialize()
    mock_pc.Index.assert_called_with("documents")

    # 2. upsert
    mock_index.upsert = MagicMock()
    # Runs in executor, so it runs synchronously inside
    ids = await store.upsert(sample_chunks)
    assert ids == ["chunk-1"]

    # 3. search
    mock_match = MagicMock(id="chunk-1", score=0.85, metadata={
        "content": "Hello world",
        "document_id": "doc-1",
        "source": "doc.txt",
        "file_name": "doc.txt"
    })
    mock_query_res = MagicMock(matches=[mock_match])
    mock_index.query.return_value = mock_query_res
    
    search_res = await store.search([0.1, 0.2, 0.3], top_k=1)
    assert len(search_res) == 1
    assert search_res[0].score == 0.85

    # 4. count
    mock_stats = MagicMock()
    mock_stats.namespaces = {"test-ns": MagicMock(vector_count=42)}
    mock_index.describe_index_stats.return_value = mock_stats
    assert await store.count() == 42

    # 5. delete & close
    mock_index.delete = MagicMock()
    await store.delete(["chunk-1"])
    await store.close()
    mock_index.delete.assert_called_once_with(ids=["chunk-1"], namespace="test-ns")


@pytest.mark.asyncio
async def test_milvus_store(sample_chunks):
    mock_client = MagicMock()
    mock_pymilvus.MilvusClient.return_value = mock_client
    mock_pymilvus.CollectionSchema = MagicMock()
    mock_pymilvus.FieldSchema = MagicMock()
    mock_pymilvus.DataType = MagicMock()

    store = MilvusVectorStore(collection_name="documents")
    
    # 1. initialize
    mock_client.has_collection.return_value = False
    mock_client.prepare_index_params = MagicMock()
    mock_client.create_collection = MagicMock()
    await store.initialize()
    mock_client.create_collection.assert_called_once()

    # 2. upsert
    mock_client.upsert = MagicMock()
    ids = await store.upsert(sample_chunks)
    assert ids == ["chunk-1"]

    # 3. search
    mock_hit = {
        "id": "chunk-1",
        "distance": 0.95,
        "entity": {
            "content": "Hello world",
            "document_id": "doc-1",
            "source": "doc.txt",
            "file_name": "doc.txt"
        }
    }
    mock_client.search.return_value = [[mock_hit]]
    search_res = await store.search([0.1, 0.2, 0.3], top_k=1)
    assert len(search_res) == 1
    assert search_res[0].score == 0.95

    # 4. count
    mock_client.get_collection_stats.return_value = {"row_count": 100}
    assert await store.count() == 100

    # 5. delete & close
    mock_client.delete = MagicMock()
    await store.delete(["chunk-1"])
    await store.close()
    mock_client.delete.assert_called_once_with(collection_name="documents", filter="id in ['chunk-1']")
    mock_client.close.assert_called_once()


@pytest.mark.asyncio
async def test_pgvector_store(sample_chunks):
    mock_conn = AsyncMock()
    mock_pool = MagicMock()
    
    # Mock pool acquire async context manager
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock()
    mock_pool.close = AsyncMock()
    
    mock_asyncpg.create_pool = AsyncMock(return_value=mock_pool)

    store = PgvectorStore(table_name="chunks", dsn="postgresql://localhost:5432/rag")

    # 1. initialize
    await store.initialize()
    assert mock_conn.execute.call_count >= 2

    # 2. upsert
    ids = await store.upsert(sample_chunks)
    assert ids == ["chunk-1"]
    assert mock_conn.execute.call_count >= 3

    # 3. search
    mock_row = {
        "id": "chunk-1",
        "content": "Hello world",
        "document_id": "doc-1",
        "metadata": '{"source": "doc.txt", "file_name": "doc.txt"}',
        "parent_id": None,
        "chunk_index": 0,
        "token_count": 2,
        "score": 0.75
    }
    mock_conn.fetch = AsyncMock(return_value=[mock_row])
    
    search_res = await store.search([0.1, 0.2, 0.3], top_k=1)
    assert len(search_res) == 1
    assert search_res[0].score == 0.75

    # 4. count
    mock_conn.fetchrow = AsyncMock(return_value={"cnt": 15})
    assert await store.count() == 15

    # 5. delete & close
    await store.delete(["chunk-1"])
    await store.close()
    mock_pool.close.assert_called_once()

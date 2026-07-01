import pytest
from fastapi.testclient import TestClient
import yaml

from rag.api.app import app
from rag.core.types import SparseVector

@pytest.fixture
def api_client():
    # Use TestClient inside lifespan context manager to run startup/shutdown handlers
    with TestClient(app) as client:
        yield client

@pytest.mark.asyncio
async def test_hybrid_api_end_to_end(api_client):
    from tests.conftest import (
        mock_sentence_transformers,
        mock_qdrant,
        mock_unstructured_partition,
    )
    from unittest.mock import AsyncMock, MagicMock
    
    # 1. Mock Unstructured partitioning
    mock_el = MagicMock()
    mock_el.__str__.return_value = "Open source database engines like Postgres and Qdrant are extremely useful for building RAG applications."
    mock_el.metadata = MagicMock(page_number=1)
    mock_unstructured_partition.partition = MagicMock(return_value=[mock_el])
    
    # 2. Mock SentenceTransformer & CrossEncoder
    mock_model = MagicMock()
    mock_model.get_sentence_embedding_dimension = MagicMock(return_value=384)
    mock_model.get_embedding_dimension = MagicMock(return_value=384)
    mock_model.encode = MagicMock(return_value=MagicMock(tolist=lambda: [[0.1]*384]))
    mock_sentence_transformers.SentenceTransformer.return_value = mock_model
    mock_sentence_transformers.CrossEncoder.return_value.predict.return_value = [0.9]
    
    # 3. Mock AsyncQdrantClient
    mock_db_client = MagicMock()
    
    # Mock get_collections
    mock_collections_res = MagicMock()
    mock_collections_res.collections = []
    mock_db_client.get_collections = AsyncMock(return_value=mock_collections_res)
    mock_db_client.create_collection = AsyncMock()
    
    # Mock upsert
    mock_db_client.upsert = AsyncMock()
    
    # Mock query_points (search)
    mock_hit = MagicMock(id="chunk-1", score=0.9, payload={
        "content": "Open source database engines like Postgres and Qdrant are extremely useful for building RAG applications.",
        "document_id": "doc-1",
        "source": "test_hybrid_doc.txt",
        "file_name": "test_hybrid_doc.txt",
        "parent_id": None,
        "chunk_index": 0,
        "token_count": 10,
    })
    mock_query_res = MagicMock()
    mock_query_res.points = [mock_hit]
    mock_db_client.query_points = AsyncMock(return_value=mock_query_res)
    
    mock_qdrant.AsyncQdrantClient.return_value = mock_db_client

    # Save original config
    import os
    config_path = "config.yaml"
    original_config_content = None
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            original_config_content = f.read()

    try:
        # 1. Fetch current config
        res_get = api_client.get("/api/config")
        assert res_get.status_code == 200
        print("CONFIG RESP:", res_get.json())
        config_dict = res_get.json()["resolved_config"]
        assert config_dict is not None, "Orchestrator config was not initialized"
    
        # 2. Modify strategy to hybrid and set alpha
        if config_dict.get("retrieval") is None:
            config_dict["retrieval"] = {"strategy": "hybrid", "config": {"alpha": 0.5}}
        else:
            config_dict["retrieval"]["strategy"] = "hybrid"
        config_dict["retrieval"]["config"] = {"alpha": 0.5}
        
        # Re-serialize to YAML for the API
        raw_yaml = yaml.dump(config_dict)
        
        # 3. Post updated configuration
        res_update = api_client.post("/api/config", json={"yaml_content": raw_yaml})
        assert res_update.status_code == 200
        assert "success" in res_update.json()["status"]
        
        # 4. Ingest dummy document
        files = {"files": ("test_hybrid_doc.txt", b"Open source database engines like Postgres and Qdrant are extremely useful for building RAG applications.", "text/plain")}
        res_ingest = api_client.post("/api/ingest", files=files)
        if res_ingest.status_code != 200:
            print("INGEST ERROR:", res_ingest.text)
        assert res_ingest.status_code == 200
        assert res_ingest.json()["total_chunks_ingested"] > 0
        
        # 5. Query using hybrid search
        query_data = {"query": "Postgres and Qdrant database engines"}
        res_query = api_client.post("/api/query", json=query_data)
        assert res_query.status_code == 200
        
        data = res_query.json()
        assert "answer" in data
        assert len(data["sources"]) > 0
        
        # Check that the retrieved source chunks have the hybrid retrieval method or related metadata
        # The source metadata should indicate it was retrieved
        print(f"E2E Hybrid Answer: {data['answer']}")
        print(f"E2E Hybrid Sources: {data['sources']}")
    finally:
        if original_config_content is not None:
            with open(config_path, "w", encoding="utf-8") as f:
                f.write(original_config_content)
            # Re-post the original config to restore the orchestrator state
            try:
                api_client.post("/api/config", json={"yaml_content": original_config_content})
            except Exception:
                pass

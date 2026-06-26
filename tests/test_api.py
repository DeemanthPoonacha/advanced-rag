import asyncio
from unittest.mock import MagicMock, AsyncMock
from fastapi.testclient import TestClient
from rag.api.app import app
import rag.api.app as api_app

def test_api_endpoints():
    print("--- Starting API Integration Tests ---")
    
    # Mock the orchestrator to isolate tests from local/external dependencies
    mock_orchestrator = MagicMock()
    mock_orchestrator.initialize = AsyncMock()
    mock_orchestrator.close = AsyncMock()
    
    # Mock config
    from rag.config.loader import load_config_from_dict
    test_config_dict = {
        "project": {"name": "test-pipeline", "environment": "development"},
        "ingestion": {
            "parser": {"provider": "unstructured"},
            "chunker": {"provider": "semantic"},
            "batch_size": 10
        },
        "embeddings": {"provider": "openai"},
        "llm": {"provider": "openai"},
        "vector_store": {"provider": "qdrant", "config": {"collection_name": "documents"}},
        "retrieval": {"strategy": "simple", "top_k": 3}
    }
    mock_orchestrator.config = load_config_from_dict(test_config_dict)
    
    # Mock vector store
    mock_db = MagicMock()
    mock_db.count = AsyncMock(return_value=5)
    
    from rag.core.types import Chunk, DocumentMetadata
    dummy_chunks = [
        Chunk(
            id="c1",
            content="This is some dummy document text to be ingested into RAG.",
            document_id="doc1",
            chunk_index=0,
            metadata=DocumentMetadata(source="test_doc.txt", file_name="test_doc.txt", file_type="text/plain"),
            token_count=10
        )
    ]
    mock_db.list_chunks = AsyncMock(return_value=dummy_chunks)
    mock_db.list_chunks_by_metadata = AsyncMock(return_value=dummy_chunks)
    mock_db.get_unique_metadata_values = AsyncMock(return_value=["test_doc.txt"])
    mock_db.delete_by_metadata = AsyncMock()
    mock_orchestrator.vector_store = mock_db
    
    # Mock ingest
    mock_orchestrator.ingest_source = AsyncMock(return_value=["c1"])
    
    # Mock query
    from rag.core.types import GenerationResult, RetrievalResult
    dummy_sources = [RetrievalResult(chunk=dummy_chunks[0], score=0.9)]
    mock_orchestrator.query = AsyncMock(return_value=GenerationResult(answer="Mock Answer", sources=dummy_sources))
    
    # Mock query_stream generator
    async def dummy_stream(*args, **kwargs):
        yield "Mock "
        yield "Answer"
    mock_orchestrator.query_stream = dummy_stream
    
    # Inject mock orchestrator
    api_app.orchestrator = mock_orchestrator
    api_app.init_error = None
    api_app.init_orchestrator = lambda *args, **kwargs: None

    with TestClient(app) as client:
        # 1. Test GET /api/status
        print("\nTesting GET /api/status:")
        res = client.get("/api/status")
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert res.json()["status"] == "active"
        assert res.json()["mock_mode"] is False

        # 2. Test GET /api/config
        print("\nTesting GET /api/config:")
        res = client.get("/api/config")
        print(f"Status Code: {res.status_code}")
        print(f"Response (Keys): {list(res.json().keys())}")
        assert res.status_code == 200
        assert "raw_yaml" in res.json()

        # 3. Ingest document
        print("\nTesting POST /api/ingest:")
        # Send a dummy text file
        files = {"files": ("test_doc.txt", b"This is some dummy document text to be ingested into RAG.", "text/plain")}
        res = client.post("/api/ingest", files=files)
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert res.json()["total_chunks_ingested"] > 0

        # 4. Test GET /api/status (Verify count changed)
        print("\nTesting GET /api/status (Verify Chunk Count):")
        res = client.get("/api/status")
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert res.json()["chunk_count"] > 0

        # 5. Test POST /api/query
        print("\nTesting POST /api/query:")
        query_data = {"query": "What is in the document?"}
        res = client.post("/api/query", json=query_data)
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert "answer" in res.json()
        assert len(res.json()["sources"]) > 0

        # 6. Test POST /api/query/stream
        print("\nTesting POST /api/query/stream:")
        # Using SSE request
        with client.stream("POST", "/api/query/stream", json={"query": "What is streaming?"}) as stream_res:
            print(f"Status Code: {stream_res.status_code}")
            assert stream_res.status_code == 200
            chunk_count = 0
            for line in stream_res.iter_lines():
                if line:
                    print(f"Stream Chunk: {line}")
                    chunk_count += 1
                    if chunk_count >= 2:
                        break

        # 7. Test POST /api/config/parse
        print("\nTesting POST /api/config/parse:")
        valid_yaml = """
project:
  name: test-parse-pipeline
  environment: development
"""
        res = client.post("/api/config/parse", json={"yaml_content": valid_yaml})
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert res.json()["status"] == "success"
        assert res.json()["resolved_config"]["project"]["name"] == "test-parse-pipeline"

        # Test parse with invalid yaml
        res = client.post("/api/config/parse", json={"yaml_content": "invalid: - yaml: : syntax"})
        print(f"Status Code: {res.status_code} (should be 400 or 422)")
        assert res.status_code in [400, 422]

        # 8. Test GET /api/chunks
        print("\nTesting GET /api/chunks:")
        res = client.get("/api/chunks?limit=10")
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert "chunks" in res.json()
        assert isinstance(res.json()["chunks"], list)

        # 9. Test GET /api/documents
        print("\nTesting GET /api/documents:")
        res = client.get("/api/documents")
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert res.json()["status"] == "success"
        assert len(res.json()["documents"]) > 0
        assert any(doc["name"] == "test_doc.txt" for doc in res.json()["documents"])

        # 10. Test GET /api/documents/{filename}/chunks
        print("\nTesting GET /api/documents/test_doc.txt/chunks:")
        res = client.get("/api/documents/test_doc.txt/chunks")
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert res.json()["status"] == "success"
        assert len(res.json()["chunks"]) > 0

        # 11. Test DELETE /api/documents/{filename}
        print("\nTesting DELETE /api/documents/test_doc.txt:")
        res = client.delete("/api/documents/test_doc.txt")
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert res.json()["status"] == "success"

        # 12. Test GET /api/presets
        print("\nTesting GET /api/presets:")
        res = client.get("/api/presets")
        print(f"Status Code: {res.status_code}")
        print(f"Response: {res.json()}")
        assert res.status_code == 200
        assert "presets" in res.json()
        assert len(res.json()["presets"]) >= 4

        print("\n--- All API Integration Tests Passed! ---")

if __name__ == "__main__":
    test_api_endpoints()

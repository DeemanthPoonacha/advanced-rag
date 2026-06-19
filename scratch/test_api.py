import asyncio
from fastapi.testclient import TestClient
from rag.api.app import app

def run_tests():
    print("--- Starting API Integration Tests ---")
    client = TestClient(app)

    # 1. Test GET /api/status
    print("\nTesting GET /api/status:")
    res = client.get("/api/status")
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200
    assert "status" in res.json()

    # 2. Test GET /api/config
    print("\nTesting GET /api/config:")
    res = client.get("/api/config")
    print(f"Status Code: {res.status_code}")
    print(f"Response (Keys): {list(res.json().keys())}")
    assert res.status_code == 200
    assert "raw_yaml" in res.json()

    # 3. Test POST /api/toggle-mode (force Mock Mode so we don't hit external APIs)
    print("\nToggling Mock Sandbox Mode to True:")
    res = client.post("/api/toggle-mode?mock=true")
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200
    assert res.json()["mock_mode"] is True

    # 4. Verify status after toggling mock mode
    print("\nTesting GET /api/status (Mock Mode):")
    res = client.get("/api/status")
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200
    assert res.json()["mock_mode"] is True

    # 5. Ingest mock document
    print("\nTesting POST /api/ingest (Mock Mode):")
    # Send a dummy text file
    files = {"files": ("test_doc.txt", b"This is some dummy document text to be ingested into RAG.", "text/plain")}
    res = client.post("/api/ingest", files=files)
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200
    assert res.json()["total_chunks_ingested"] > 0

    # 6. Test GET /api/status (Verify count changed)
    print("\nTesting GET /api/status (Verify Chunk Count):")
    res = client.get("/api/status")
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200
    assert res.json()["chunk_count"] > 0

    # 7. Test POST /api/query
    print("\nTesting POST /api/query:")
    query_data = {"query": "What is in the document?"}
    res = client.post("/api/query", json=query_data)
    print(f"Status Code: {res.status_code}")
    print(f"Response: {res.json()}")
    assert res.status_code == 200
    assert "answer" in res.json()
    assert len(res.json()["sources"]) > 0

    # 8. Test POST /api/query/stream
    print("\nTesting POST /api/query/stream:")
    # Using SSE request
    with client.stream("POST", "/api/query/stream", json={"query": "What is streaming?"}) as stream_res:
        print(f"Status Code: {stream_res.status_code}")
        assert stream_res.status_code == 200
        # Print first few chunks
        chunk_count = 0
        for line in stream_res.iter_lines():
            if line:
                print(f"Stream Chunk: {line}")
                chunk_count += 1
                if chunk_count >= 5:
                    break

    print("\n--- All API Integration Tests Passed! ---")

if __name__ == "__main__":
    run_tests()

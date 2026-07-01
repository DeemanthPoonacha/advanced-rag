import os
os.environ["INNGEST_DEV"] = "1"

import pytest
from unittest.mock import MagicMock, AsyncMock
from fastapi.testclient import TestClient
from rag.api.app import app
import rag.api.app as api_app

def test_inngest_handshake():
    # Mock the orchestrator to prevent any database or local file reads during the handshake check
    mock_orchestrator = MagicMock()
    mock_orchestrator.initialize = AsyncMock()
    mock_orchestrator.close = AsyncMock()
    mock_orchestrator.ingestion_status = {}
    
    api_app.orchestrator = mock_orchestrator
    api_app.init_error = None
    
    with TestClient(app) as client:
        # Test GET /api/inngest (handshake/registration)
        res = client.get("/api/inngest")
        assert res.status_code == 200
        data = res.json()
        print("\n=== INNGEST REGISTRATION DATA ===")
        print(data)
        
        # Verify schema version and function count are returned
        assert "schema_version" in data
        assert "function_count" in data

#!/usr/bin/env python3
"""Test script to ingest generated test data and run test queries against the RAG pipeline.

Supports dual modes:
1. API Mode: If the FastAPI backend is running on port 8000, it uploads and queries via HTTP.
   (This is preferred because it avoids local file-lock issues on the SQLite/Qdrant DB).
2. Direct Mode: If the backend is not running, it initializes the orchestrator directly.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# Add src/ to the python path to load the rag library
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import httpx

# File path constants
TEST_DATA_DIR = Path(__file__).parent
FILES_TO_INGEST = [
    ("company_policy.md", {"category": "hr", "doc_type": "policy"}),
    ("server_troubleshooting.txt", {"category": "it", "doc_type": "guide"}),
    ("product_catalog.csv", {"category": "sales", "doc_type": "catalog"}),
    ("release_notes.txt", {"category": "engineering", "doc_type": "release_notes"}),
    ("rag_architecture_guide.pdf", {"category": "architecture", "doc_type": "guide"}),
]

TEST_QUERIES = [
    # HR query
    "What is the remote work stipend and the monthly internet subsidy?",
    # IT/Operations query
    "How do I resolve the database pool connection error (ERR_DB_POOL_FULL)?",
    # Catalog query
    "What is the SKU and price of the Aegis Security Gateway?",
    # Engineering/Release Notes query
    "What are the new release items in v3?",
    # PDF guide query
    "Explain the 4 main components of a RAG pipeline according to the guide.",
]

API_BASE_URL = "http://localhost:8000/api"

async def check_api_running() -> bool:
    """Check if the FastAPI backend is running."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{API_BASE_URL}/status", timeout=2.0)
            if response.status_code == 200:
                status_data = response.json()
                print(f"📡 Backend is running. Mode: {'Mock Sandbox' if status_data.get('mock_mode') else 'Standard RAG'}")
                return True
    except Exception:
        pass
    return False

async def run_via_api():
    """Ingest files and run queries using the FastAPI HTTP API."""
    print("📡 Executing tests in API Mode (talking to running backend server)...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Ingest files
        print("\n📥 Starting document ingestion via API...")
        for filename, metadata in FILES_TO_INGEST:
            file_path = TEST_DATA_DIR / filename
            if not file_path.exists():
                print(f"⚠️ Warning: File {file_path} does not exist. Skipping.")
                continue
                
            import mimetypes
            content_type, _ = mimetypes.guess_type(filename)
            content_type = content_type or "application/octet-stream"
            print(f"  Uploading '{filename}' ({content_type})...")
            with open(file_path, "rb") as f:
                files = {"files": (filename, f, content_type)}
                data = {"metadata_json": json.dumps(metadata)}
                response = await client.post(f"{API_BASE_URL}/ingest", files=files, data=data)
                
            if response.status_code == 200:
                res_json = response.json()
                print(f"  ✅ Ingested: {res_json.get('message', '')} ({res_json.get('total_chunks_ingested', 0)} chunks)")
            else:
                print(f"  ❌ Failed to ingest '{filename}': {response.status_code} - {response.text}")
                
        print("\n🎉 Ingestion complete!")
        
        # 2. Query the engine
        print("\n🔎 Running test queries via API...")
        for i, query in enumerate(TEST_QUERIES, 1):
            print(f"\n--- Query {i}: '{query}' ---")
            payload = {"query": query}
            response = await client.post(f"{API_BASE_URL}/query", json=payload)
            
            if response.status_code == 200:
                res_json = response.json()
                print(f"🤖 Answer:\n{res_json.get('answer', '')}")
                print(f"\n⏱️ Latency: {res_json.get('latency_ms', 0.0):.2f} ms")
                
                sources = res_json.get("sources", [])
                if sources:
                    print("📚 Sources retrieved:")
                    for s_idx, src in enumerate(sources, 1):
                        content = src.get("content", "")
                        content_snippet = content.replace('\n', ' ')[:120]
                        meta = src.get("metadata", {})
                        src_file = meta.get("file_name") or meta.get("source") or "unknown"
                        print(f"  [{s_idx}] {src_file} (Score: {src.get('score', 0.0):.2f}): \"{content_snippet}...\"")
            else:
                print(f"  ❌ Query failed: {response.status_code} - {response.text}")

async def run_via_orchestrator():
    """Ingest files and run queries directly via python class instances."""
    print("💻 Executing tests in Direct Mode (directly importing pipeline orchestrator)...")
    
    from rag.config.loader import load_config
    from rag.pipeline.orchestrator import RAGPipelineOrchestrator
    
    config_path = Path(__file__).parent.parent / "config.yaml"
    if not config_path.exists():
        print(f"❌ Error: config.yaml not found at {config_path}")
        return
        
    print(f"Loading configuration from {config_path}...")
    config = load_config(str(config_path))
    
    # Initialize Orchestrator
    orchestrator = RAGPipelineOrchestrator(config)
    print("✅ Orchestrator successfully initialized.")
    
    try:
        # Ingest documents
        print("\n📥 Starting document ingestion...")
        for filename, metadata in FILES_TO_INGEST:
            file_path = TEST_DATA_DIR / filename
            if not file_path.exists():
                print(f"⚠️ Warning: File {file_path} does not exist. Skipping.")
                continue
                
            print(f"  Ingesting '{filename}' with metadata: {metadata}...")
            chunk_ids = await orchestrator.ingest_source(
                source=str(file_path),
                metadata=metadata
            )
            print(f"  ✅ Ingested {len(chunk_ids)} chunks from '{filename}'.")
            
        print("\n🎉 Ingestion complete!")
        
        # Perform test queries
        print("\n🔎 Running test queries...")
        for i, query in enumerate(TEST_QUERIES, 1):
            print(f"\n--- Query {i}: '{query}' ---")
            result = await orchestrator.query(user_query=query)
            
            print(f"🤖 Answer:\n{result.answer}")
            print(f"\n⏱️ Latency: {result.latency_ms:.2f} ms")
            
            # Print retrieved sources
            if hasattr(result, "sources") and result.sources:
                print("📚 Sources retrieved:")
                for s_idx, src in enumerate(result.sources, 1):
                    # src can be a RetrievalResult
                    chunk_obj = getattr(src, "chunk", src)
                    content_snippet = getattr(chunk_obj, "content", "")
                    content_snippet = content_snippet.replace('\n', ' ')[:120]
                    src_metadata = getattr(chunk_obj, "metadata", {})
                    src_file = getattr(src_metadata, "file_name", None) or getattr(src_metadata, "source", "unknown")
                    print(f"  [{s_idx}] {src_file}: \"{content_snippet}...\"")
            elif "sources" in result.metadata:
                print("📚 Sources retrieved:")
                for s_idx, src in enumerate(result.metadata["sources"], 1):
                    snippet = src.get("snippet", "") or src.get("content", "")
                    snippet = snippet.replace('\n', ' ')[:120]
                    print(f"  [{s_idx}] {src.get('file_name', 'unknown')}: \"{snippet}...\"")
                    
    except Exception as e:
        print(f"\n❌ An error occurred: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Clean up database/HTTP resources
        await orchestrator.close()
        print("\n🔒 Session closed. Execution completed.")

async def main():
    print("==================================================")
    print("🚀 Acme Corp RAG Pipeline Test & Ingestion Runner")
    print("==================================================")
    
    is_running = await check_api_running()
    if is_running:
        await run_via_api()
    else:
        await run_via_orchestrator()

if __name__ == "__main__":
    asyncio.run(main())

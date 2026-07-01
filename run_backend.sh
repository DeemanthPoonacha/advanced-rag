#!/bin/bash
echo "============================================="
echo "   Advanced RAG Framework Backend Runner     "
echo "============================================="
echo "-> Starting FastAPI backend on http://localhost:8000..."
INNGEST_DEV=1 .venv/bin/uvicorn src.rag.api.app:app --host 0.0.0.0 --port 8000 --loop uvloop --http httptools --timeout-keep-alive 30

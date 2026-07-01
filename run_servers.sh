#!/bin/bash

# RAG Dashboard Run Script
# Start backend (FastAPI) and frontend (Vite React) concurrently.

source .venv/bin/activate
pip install -e .

# Print banner
echo "============================================="
echo "   Advanced RAG Framework Dashboard Runner   "
echo "============================================="

# 1. Start FastAPI Backend in background
echo "-> Starting FastAPI backend on http://localhost:8000..."
INNGEST_DEV=1 .venv/bin/uvicorn src.rag.api.app:app --host 0.0.0.0 --port 8000 --loop uvloop --http httptools --timeout-keep-alive 30 &
BACKEND_PID=$!

# 1b. Start Inngest Dev Server in background
echo "-> Starting Inngest Dev Server on http://localhost:8288..."
npx inngest-cli@latest dev --port 8288 &
INNGEST_PID=$!

# Ensure backend and Inngest stop when this script is interrupted
cleanup() {
    echo ""
    echo "-> Shutting down FastAPI backend (PID $BACKEND_PID)..."
    kill $BACKEND_PID 2>/dev/null || true
    echo "-> Shutting down Inngest Dev Server (PID $INNGEST_PID)..."
    kill $INNGEST_PID 2>/dev/null || true
    echo "-> Done. Goodbye!"
}
trap cleanup EXIT INT TERM

# 2. Check node_modules in frontend
if [ ! -d "frontend/node_modules" ]; then
    echo "-> frontend/node_modules not found. Installing npm dependencies..."
    (cd frontend && npm install)
fi

# 3. Start Frontend Vite Server in foreground
echo "-> Starting Vite React dev server..."
cd frontend
npm run dev

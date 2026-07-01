#!/bin/bash

# RAG Dashboard Run Script
# Start backend (FastAPI), Inngest, and frontend (Vite React) concurrently.

# Print banner
echo "============================================="
echo "   Advanced RAG Framework Dashboard Runner   "
echo "============================================="

# Ensure scripts are executable
chmod +x run_backend.sh run_inngest.sh run_frontend.sh

# 1. Start FastAPI Backend in background
./run_backend.sh &
BACKEND_PID=$!

# 2. Start Inngest Dev Server in background
./run_inngest.sh &
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

# 3. Start Frontend Vite Server in foreground
./run_frontend.sh

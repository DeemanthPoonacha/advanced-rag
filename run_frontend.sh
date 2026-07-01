#!/bin/bash
echo "============================================="
echo "   Advanced RAG Frontend Vite Runner         "
echo "============================================="

# Check node_modules in frontend
if [ ! -d "frontend/node_modules" ]; then
    echo "-> frontend/node_modules not found. Installing npm dependencies..."
    (cd frontend && npm install)
fi

echo "-> Starting Vite React dev server..."
cd frontend
npm run dev

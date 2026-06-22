# Advanced Generic RAG Framework

[![Python Version](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

An enterprise-ready, async-first, and completely configuration-driven Generic Retrieval-Augmented Generation (RAG) framework. This repository is decoupled into clean interface layers using Abstract Base Classes (ABCs), making every component swappable and extensible.

---

## 🚀 Key Features

*   **100% Configuration-Driven:** Load a single `config.yaml` to dynamically build, connect, and instantiate all components using Pydantic v2 schemas and factory patterns.
*   **Decoupled & Modular Design:** Decouples Ingestion, Chunking, Vector Storage, Inference, Retrieval, Reranking, Guardrails, and Evaluations into strict, pluggable interfaces.
*   **Production-Grade Ingestion:** Support for unstructured.io and LlamaParse parser models with recursive, semantic, and hierarchical chunkers.
*   **Multi-Engine Vector DBs:** Native support for Qdrant, Pinecone, Milvus, and PGVector with hybrid dense + sparse search and metadata filtering.
*   **Advanced Retrieval Strategies:** Built-in strategies for Multi-Query Expansion, Contextual Compression, and Hierarchical Auto-Merging.
*   **Production Safety & Evaluation:** Integrated input/output safety guardrails (Llama Guard and NeMo Guardrails) and automated evaluations (Ragas and TruLens feedback loops).
*   **Enterprise Observability:** Async-first implementation equipped with structured JSON logging, OpenTelemetry distributed tracing, and Prometheus metrics.

---

## 🗺️ Documentation Index

*   📖 **[Architecture & Design Guide](docs/architecture.md):** Deep-dive into registry auto-discovery, dependency injection, and core abstract interfaces.
*   ⚙️ **[Configuration Reference](docs/configuration.md):** Comprehensive parameter reference guide for `config.yaml` options.
*   💻 **[Developer API Guide](docs/api_guide.md):** Code examples for custom implementations, streaming output, and system tracing.
*   🖼️ **[Multi-Modal RAG Guide](docs/multimodal_rag.md):** Comprehensive guide to building a production-grade multi-modal RAG pipeline using Unstructured.io (extracting text, tables, and images) and vision LLMs.

---

## 🛠️ Quickstart

### 1. Installation
Set up your virtual environment and install the package with core dependencies:

```bash
# Initialize virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install the package in editable mode
pip install -e .
```

To install optional provider bundles (e.g. Qdrant, OpenAI, Ragas):
```bash
pip install -e ".[telemetry,openai,cohere,qdrant,ragas]"
```

### 2. Configure the Pipeline
Create a `config.yaml` in your project root. An annotated production-ready template is available in the repository root at [config.yaml](config.yaml):

```yaml
project:
  name: "custom-rag-pipeline"
  environment: "development"

ingestion:
  parser:
    provider: "unstructured"
    config:
      strategy: "hi_res"
      languages: ["en"]
  chunker:
    provider: "semantic"
    config:
      target_chunk_size: 500
  batch_size: 50

embeddings:
  provider: "openai"
  config:
    model: "text-embedding-3-small"
    api_key: "${OPENAI_API_KEY}"

llm:
  provider: "openai"
  config:
    model: "gpt-4o-mini"
    api_key: "${OPENAI_API_KEY}"

vector_store:
  provider: "qdrant"
  config:
    url: "http://localhost:6333"
    collection_name: "my_kb"

retrieval:
  strategy: "simple"
  top_k: 5
  similarity_threshold: 0.7
```

### 3. Programmatic Usage

Run the end-to-end ingest and query cycles using the orchestrator:

```python
import asyncio
from rag.config.loader import load_config
from rag.pipeline.orchestrator import RAGPipelineOrchestrator

async def main():
    # 1. Load configuration (resolving env variables)
    config = load_config("config.yaml")
    
    # 2. Instantiate the orchestrator
    orchestrator = RAGPipelineOrchestrator(config)
    
    # 3. Ingest documents (PDFs, HTML, markdown, etc.)
    await orchestrator.ingest_source("data/sample_policy.pdf")
    
    # 4. Perform a safety-moderated, evaluated query
    result = await orchestrator.query("What is the reimbursement policy?")
    print(f"Answer: {result.answer}")
    
    if result.sources:
        print("\nSources Used:")
        for res in result.sources:
            print(f"- [Score: {res.score:.2f}] {res.chunk.content[:150]}...")
            
    # 5. Clean up client connections
    await orchestrator.close()

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 🏛️ Project Directory Structure

```
.
├── config.yaml          # Example central configuration
├── pyproject.toml       # Dependencies, packaging, and tool config
├── README.md            # Gateway framework overview
├── docs/                # Detailed guides (architecture, configs, APIs)
├── src/
│   └── rag/             # Main package directory
│       ├── config/      # Config validation engine & interpolation
│       ├── core/        # Interfaces, ComponentRegistry, and Types
│       ├── embeddings/  # Dense embedding model implementations
│       ├── evaluation/  # Automated evaluation (Ragas / TruLens)
│       ├── guardrails/  # Input/output safety validation
│       ├── ingestion/   # Document parsing and chunking
│       ├── llm/         # LLM provider endpoints
│       ├── observability/# Structured logging, OpenTelemetry, metrics
│       ├── pipeline/    # Central orchestrator execution loop
│       └── vectorstores/# Multi-engine database connectors
└── tests/               # Comprehensive unit test suites
```

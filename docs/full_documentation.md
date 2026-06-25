# Advanced RAG Framework — Full Technical Documentation

[![Python Version](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

An enterprise-ready, async-first, configuration-driven Retrieval-Augmented Generation (RAG) framework with a full-stack interactive dashboard. Every component is decoupled behind Abstract Base Classes (ABCs), making the entire pipeline swappable via a single `config.yaml` file.

---

## Table of Contents

- [1. System Overview](#1-system-overview)
- [2. Architecture & Design Patterns](#2-architecture--design-patterns)
- [3. Core Domain Types](#3-core-domain-types)
- [4. Component Reference](#4-component-reference)
  - [4.1 Parsers](#41-parsers)
  - [4.2 Chunkers](#42-chunkers)
  - [4.3 Embedding Models](#43-embedding-models)
  - [4.4 LLM Providers](#44-llm-providers)
  - [4.5 Vector Stores](#45-vector-stores)
  - [4.6 Retrieval Strategies](#46-retrieval-strategies)
  - [4.7 Rerankers](#47-rerankers)
  - [4.8 Guardrails](#48-guardrails)
  - [4.9 Evaluators](#49-evaluators)
- [5. Pipeline Orchestrator](#5-pipeline-orchestrator)
- [6. Configuration Reference](#6-configuration-reference)
- [7. REST API Reference](#7-rest-api-reference)
- [8. Frontend Dashboard](#8-frontend-dashboard)
- [9. Observability](#9-observability)
- [10. Installation & Quickstart](#10-installation--quickstart)
- [11. Extending the Framework](#11-extending-the-framework)
- [12. Project Structure](#12-project-structure)

---

## 1. System Overview

The Advanced RAG Framework is a modular, production-grade system for building Retrieval-Augmented Generation pipelines. It consists of two main subsystems:

1. **Backend (Python)** — A FastAPI server wrapping an async pipeline orchestrator that manages document ingestion, vector storage, retrieval, LLM generation, safety guardrails, and automated evaluation.
2. **Frontend (React)** — A Vite-powered React + TypeScript dashboard providing interactive document ingestion, chunk inspection, RAG chat with streaming, and live pipeline configuration editing.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                      │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  ┌────────────┐  │
│  │ Chat     │  │ Ingest Panel │  │ Config      │  │ Sidebar    │  │
│  │ Panel    │  │ + Wizard     │  │ Panel       │  │ Navigation │  │
│  └────┬─────┘  └──────┬───────┘  └──────┬──────┘  └────────────┘  │
│       │               │                 │                          │
│       └───────────────┼─────────────────┘                          │
│                       │ HTTP / SSE                                  │
├───────────────────────┼────────────────────────────────────────────┤
│                       ▼                                             │
│              FastAPI Backend (uvicorn)                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  RAGPipelineOrchestrator                      │  │
│  │  ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────┐ ┌───────────┐  │  │
│  │  │ Parser │→│Chunker │→│Embeddings│→│Qdrant│ │LLM (Local)│  │  │
│  │  └────────┘ └────────┘ └──────────┘ └──────┘ └───────────┘  │  │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐   │  │
│  │  │Retriever│  │ Reranker │  │ Guardrails│  │ Evaluator │   │  │
│  │  └─────────┘  └──────────┘  └───────────┘  └───────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture & Design Patterns

### 2.1 Component Registry Pattern

All swappable modules self-register via decorators at import time. The `ComponentRegistry` class maintains a global lookup table mapping `(component_type, provider_name)` pairs to concrete implementation classes.

```python
@ComponentRegistry.register("vector_store", "qdrant")
class QdrantVectorStore(BaseVectorStore):
    ...
```

**Auto-Discovery**: The `ComponentRegistry.discover()` method imports all known implementation modules. Modules with missing optional dependencies are silently skipped, preventing startup failures.

**9 Component Types**: `parser`, `chunker`, `embedding_model`, `llm`, `vector_store`, `retriever`, `reranker`, `guardrail`, `evaluator`.

### 2.2 Factory Pattern & Dependency Injection

The `ComponentFactory` reads `PipelineConfig` sections, resolves provider classes from the registry, and instantiates them with configuration parameters. It performs constructor introspection to filter out unsupported keyword arguments.

```python
factory = ComponentFactory(config)
parser = factory.create_parser()          # Reads ingestion.parser
chunker = factory.create_chunker()        # Reads ingestion.chunker
embedding = factory.create_embedding_model()  # Reads embeddings
llm = factory.create_llm()               # Reads llm
vector_store = factory.create_vector_store()  # Reads vector_store + auto-infers vector_size
```

### 2.3 Pydantic v2 Configuration Schema

The entire `config.yaml` is validated by a strict Pydantic v2 model hierarchy rooted at `PipelineConfig`. This provides:

- Compile-time type safety with `Literal` enums for all provider names
- Range validation on numeric parameters (`top_k`, `batch_size`, `similarity_threshold`)
- Environment variable interpolation (`${VAR}` or `${VAR:-default}` syntax)
- `extra = "forbid"` at the top level to catch typos in configuration keys

### 2.4 Async-First Design

Every component interface uses `async def` methods. Synchronous operations (embedding inference, file I/O) are offloaded to thread pool executors via `asyncio.run_in_executor()`. The pipeline orchestrator uses `asyncio.gather()` for concurrent operations where data dependencies permit.

---

## 3. Core Domain Types

All shared data models are strict Pydantic v2 models defined in `src/rag/core/types.py`.

| Type | Purpose | Key Fields |
|------|---------|------------|
| `DocumentMetadata` | Rich metadata for parsed documents | `source`, `file_name`, `file_type`, `page_number`, `language`, `custom` (extensible dict) |
| `Document` | A parsed document before chunking | `id`, `content`, `metadata`, `embedding` |
| `Chunk` | A chunk derived from a Document | `id`, `content`, `document_id`, `metadata`, `embedding`, `sparse_embedding`, `parent_id`, `chunk_index`, `token_count` |
| `SparseVector` | Sparse embedding for hybrid search | `indices`, `values` (validated to match lengths) |
| `RetrievalResult` | A scored retrieval hit | `chunk`, `score`, `rerank_score`, `retrieval_method` |
| `QueryContext` | Full context for retrieval queries | `original_query`, `expanded_queries`, `filters`, `top_k`, `similarity_threshold`, `trace_id` |
| `GenerationResult` | Complete pipeline output | `answer`, `sources`, `token_usage`, `latency_ms`, `trace_id`, `metadata` |
| `GuardrailResult` | Safety validation output | `is_safe`, `violation_category`, `explanation`, `confidence` |
| `EvaluationResult` | Quality metric scores | `metrics` (dict of float), `details`, `timestamp` |
| `TokenUsage` | Token consumption stats | `prompt_tokens`, `completion_tokens`, `total_tokens`, `model` |

### Enums

| Enum | Values |
|------|--------|
| `DistanceMetric` | `cosine`, `euclidean`, `dot_product` |
| `ChunkingStrategy` | `semantic`, `recursive`, `hierarchical`, `fixed_size` |
| `RetrievalStrategy` | `simple`, `multi_query`, `contextual_compression`, `auto_merging` |
| `LifecycleStage` | `ingest`, `parse`, `chunk`, `embed`, `upsert`, `retrieve`, `rerank`, `generate`, `guardrail`, `evaluate` |

---

## 4. Component Reference

### 4.1 Parsers

**Interface**: `BaseParser`

| Method | Signature | Description |
|--------|-----------|-------------|
| `parse` | `async (source: str \| bytes, metadata?) → list[Document]` | Parse a single file path or raw bytes into structured Documents |
| `parse_batch` | `async (sources: list, metadata?) → list[Document]` | Parse multiple sources concurrently |
| `close` | `async () → None` | Release held resources |

**Implementations**:

| Provider Key | Class | Description |
|-------------|-------|-------------|
| `unstructured` | `UnstructuredParser` | Uses Unstructured.io for parsing PDFs, DOCX, HTML, images. Supports `hi_res`, `fast`, and `ocr_only` strategies. Extracts layout elements (text, tables, images) with element-type tagging. |
| `llamaparse` | `LlamaParseParser` | Uses LlamaParse cloud API for premium PDF parsing. Supports markdown and text output modes with multi-worker parallelism. |
| `multimodal_unstructured` | `MultimodalUnstructuredParser` | Extended Unstructured parser that preserves table HTML, extracts embedded images as base64, and tags element types for multimodal downstream processing. |

---

### 4.2 Chunkers

**Interface**: `BaseChunker`

| Method | Signature | Description |
|--------|-----------|-------------|
| `chunk` | `async (document: Document) → list[Chunk]` | Split a single document into chunks |
| `chunk_batch` | `async (documents: list[Document]) → list[Chunk]` | Split multiple documents, returning a flat chunk list |

**Implementations**:

| Provider Key | Class | Config Params | Description |
|-------------|-------|--------------|-------------|
| `semantic` | `SemanticChunker` | `target_chunk_size`, `similarity_threshold`, `buffer_size` | Embedding-aware splitting that groups semantically similar sentences together. Requires an embedding model reference. |
| `recursive` | `RecursiveChunker` | `chunk_size`, `chunk_overlap` | Recursive text splitting with paragraph → sentence → character hierarchy and configurable overlap. |
| `hierarchical` | `HierarchicalChunker` | `parent_chunk_size`, `child_chunk_size` | Creates parent–child chunk pairs for auto-merging retrieval. Parent chunks retain broad context; child chunks enable fine-grained matching. |
| `by_title` | `ByTitleChunker` | `target_chunk_size` | Groups content under detected section headings/titles. Respects document structure from layout-aware parsers. |
| `fixed_size` | `FixedSizeChunker` | `chunk_size`, `chunk_overlap` | Simple fixed character/token count splitting. |
| `multimodal_summarizer` | `MultimodalSummarizerChunker` | `model_name`, `temperature` | Generates AI-enhanced searchable summaries for chunks containing tables and images using a configured LLM (vision-capable). |

---

### 4.3 Embedding Models

**Interface**: `BaseEmbeddingModel`

| Method | Signature | Description |
|--------|-----------|-------------|
| `embed` | `async (texts: list[str]) → list[list[float]]` | Embed a batch of document texts |
| `embed_query` | `async (query: str) → list[float]` | Embed a single query (may use different prefix) |
| `embed_sparse` | `async (texts: list[str]) → list[SparseVector]` | Optional: produce sparse embeddings for hybrid search |
| `dimensions` | `property → int` | Embedding vector dimensionality |

**Implementations**:

| Provider Key | Class | Config Params | Description |
|-------------|-------|--------------|-------------|
| `openai` | `OpenAIEmbeddings` | `model`, `api_key`, `dimensions` | OpenAI embedding API (`text-embedding-3-small`, `text-embedding-3-large`). Supports dimensionality reduction. |
| `cohere` | `CohereEmbeddings` | `model`, `api_key` | Cohere Embed v3 API with native sparse embedding support for hybrid search. |
| `local` | `LocalEmbeddingModel` | `model_name`, `device`, `batch_size`, `normalize`, `query_prefix`, `document_prefix` | On-device inference using sentence-transformers. Supports CPU and CUDA. Runs synchronous encode in a thread pool executor. |

---

### 4.4 LLM Providers

**Interface**: `BaseLLM`

| Method | Signature | Description |
|--------|-----------|-------------|
| `generate` | `async (prompt: str, **kwargs) → str` | Single-shot text completion |
| `generate_stream` | `async (prompt: str, **kwargs) → AsyncIterator[str]` | Streaming completion yielding token chunks |
| `generate_structured` | `async (prompt, output_schema: BaseModel, **kwargs) → BaseModel` | Structured JSON output validated against a Pydantic schema |

**Implementations**:

| Provider Key | Class | Config Params | Description |
|-------------|-------|--------------|-------------|
| `openai` | `OpenAILLM` | `model`, `api_key`, `temperature`, `max_tokens` | OpenAI GPT API. Supports function calling and structured output via JSON schema injection. |
| `anthropic` | `AnthropicLLM` | `model`, `api_key`, `temperature`, `max_tokens` | Anthropic Claude API with streaming support. |
| `cohere` | `CohereLLM` | `model`, `api_key`, `temperature` | Cohere Command R / R+ API. |
| `local` | `LocalLLM` | `base_url`, `model`, `temperature`, `max_tokens`, `top_p`, `timeout` | Connects to any OpenAI-compatible local server (Ollama, vLLM, llama.cpp). Features automatic retry with exponential backoff (via `tenacity`), offline fallback mode that returns retrieved context when the LLM server is unreachable, and multimodal support (base64 image payloads). |

**LocalLLM Offline Fallback**: When the local model server is unreachable, `LocalLLM` gracefully degrades by returning the retrieved context directly to the user with a `[Local LLM Offline Fallback]` prefix rather than failing the entire query. This behavior can be overridden by passing `raise_on_error=True`.

---

### 4.5 Vector Stores

**Interface**: `BaseVectorStore`

| Method | Signature | Description |
|--------|-----------|-------------|
| `initialize` | `async () → None` | Create collections/indexes if they don't exist |
| `upsert` | `async (chunks: list[Chunk]) → list[str]` | Insert or update chunks with embeddings attached |
| `search` | `async (query_embedding, top_k, filters?) → list[RetrievalResult]` | Dense vector search |
| `hybrid_search` | `async (query_embedding, sparse_vector, top_k, alpha, filters?) → list[RetrievalResult]` | Dense + sparse hybrid search with alpha-weighted fusion |
| `delete` | `async (ids: list[str]) → None` | Delete vectors by ID |
| `delete_by_metadata` | `async (key: str, value: Any) → None` | Delete vectors matching a metadata filter |
| `count` | `async () → int` | Total vector count |
| `list_chunks` | `async (limit?) → list[Chunk]` | Scroll/paginate stored chunks |
| `get_by_id` | `async (id: str) → Chunk \| None` | Primary key point lookup |

**Implementations**:

| Provider Key | Class | Config Params | Description |
|-------------|-------|--------------|-------------|
| `qdrant` | `QdrantVectorStore` | `url`, `api_key`, `collection_name`, `vector_size`, `distance`, `on_disk`, `prefer_grpc` | Full-featured Qdrant integration. Supports local disk-backed mode, cloud hosted, and in-memory (`:memory:`). Native sparse/dense hybrid search via `Prefetch` + RRF fusion. Batched upserts (100 points per batch). |
| `pinecone` | `PineconeVectorStore` | `api_key`, `index_name`, `namespace` | Pinecone managed vector database with namespace isolation. |
| `milvus` | `MilvusVectorStore` | `uri`, `token`, `collection_name` | Milvus/Zilliz Cloud vector database. |
| `pgvector` | `PGVectorStore` | `connection_string`, `table_name` | PostgreSQL + pgvector extension via asyncpg. |

---

### 4.6 Retrieval Strategies

**Interface**: `BaseRetriever`

| Method | Signature | Description |
|--------|-----------|-------------|
| `retrieve` | `async (context: QueryContext) → list[RetrievalResult]` | Execute the configured retrieval strategy |

**Implementations**:

| Provider Key | Class | Description |
|-------------|-------|-------------|
| `simple` | `SimpleRetriever` | Baseline: embed query → dense vector search → filter by similarity threshold. |
| `multi_query` | `MultiQueryRetriever` | Uses the LLM to generate N alternative phrasings of the user query, performs parallel searches, and fuses results via reciprocal rank fusion. |
| `contextual_compression` | `ContextualCompressionRetriever` | Retrieves candidate chunks, then uses the LLM to compress/extract only the relevant portions from each chunk. |
| `auto_merging` | `AutoMergingRetriever` | Works with hierarchical chunks. Searches child chunks, and when multiple children from the same parent are retrieved, merges them into the parent chunk for broader context. Uses `get_by_id()` for fast parent lookups. |

---

### 4.7 Rerankers

**Interface**: `BaseReranker`

| Method | Signature | Description |
|--------|-----------|-------------|
| `rerank` | `async (query, results, top_n?) → list[RetrievalResult]` | Re-score and re-sort retrieval results |

| Provider Key | Class | Description |
|-------------|-------|-------------|
| `cohere` | `CohereReranker` | Uses Cohere Rerank API for cross-encoder scoring. |
| `cross_encoder` | `CrossEncoderReranker` | Local cross-encoder model from sentence-transformers. |

---

### 4.8 Guardrails

**Interface**: `BaseGuardrail`

| Method | Signature | Description |
|--------|-----------|-------------|
| `validate` | `async (text, context?) → GuardrailResult` | Check text safety |

| Provider Key | Class | Description |
|-------------|-------|-------------|
| `llama_guard` | `LlamaGuard` | Meta's Llama Guard model for content safety classification. |
| `nemo` | `NeMoGuardrails` | NVIDIA NeMo Guardrails framework. |

Guardrails are applied at two points in the query pipeline:
1. **Input Guardrail** — validates the user query before retrieval
2. **Output Guardrail** — validates the generated answer before returning to the user

---

### 4.9 Evaluators

**Interface**: `BaseEvaluator`

| Method | Signature | Description |
|--------|-----------|-------------|
| `evaluate` | `async (query, answer, contexts, ground_truth?) → EvaluationResult` | Compute quality metrics |

| Provider Key | Class | Description |
|-------------|-------|-------------|
| `ragas` | `RagasEvaluator` | Ragas framework metrics (faithfulness, answer relevancy, context recall). |
| `trulens` | `TruLensEvaluator` | TruLens feedback function evaluation. |

---

## 5. Pipeline Orchestrator

The `RAGPipelineOrchestrator` is the central async engine. It wires all components together and manages the complete RAG lifecycle.

### 5.1 Ingestion Flow

```
Source File → Parser → Documents → Chunker → Chunks → Embeddings → Vector Store
                                      ↓
                          Multimodal Summarizer (for tables/images)
                                      ↓
                          AI-enhanced searchable descriptions
```

**Key behavior**:
- The orchestrator automatically routes table/image elements to the `MultimodalSummarizerChunker` while standard text goes through the configured primary chunker
- Ingestion status is tracked per-file with step progression: `uploading` → `partitioning` → `chunking` → `indexing` → `completed`
- Layout element statistics (text/table/image/title counts) are extracted and exposed to the UI
- Sparse embeddings are generated automatically if the embedding model supports them

### 5.2 Query Flow

```
User Query → Input Guardrail → Retriever → Reranker → LLM Generation → Output Guardrail → Evaluator → Result
```

**Key behavior**:
- Context assembly supports multimodal content: text, HTML tables, and base64 images are forwarded to vision-capable LLMs
- User-attached files are processed alongside retrieved context
- The streaming endpoint (`query_stream`) bypasses output guardrails and evaluation for real-time token delivery

### 5.3 Background Summarizer

A background `asyncio.Task` continuously checks the vector store for chunks with tables/images that are missing AI summaries (e.g., due to LLM being offline during initial ingestion). When found, it:
1. Generates summaries via the multimodal summarizer LLM
2. Re-embeds the chunk with the new summary text
3. Upserts the updated chunk back into the vector store

This runs as an event-driven loop — triggered on new uploads and retrying with 15-second backoff when the LLM is unavailable.

---

## 6. Configuration Reference

The entire pipeline is driven by a single `config.yaml` file. All parameters are validated by Pydantic v2 models.

### 6.1 Top-Level Structure

```yaml
project:          # Deployment metadata
observability:    # Logging, tracing, metrics
ingestion:        # Parser + chunker + multimodal summarizer + batch size
embeddings:       # Embedding model provider + config
llm:              # LLM provider + config
vector_store:     # Vector database provider + config
retrieval:        # Strategy + reranker + top_k + threshold
generation:       # System prompt + prompt template + max context chunks
guardrails:       # Input/output safety validation
evaluation:       # Automated quality metrics (optional)
```

### 6.2 Detailed Parameters

#### `project`
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | `"rag-pipeline"` | Pipeline identifier |
| `version` | string | `"1.0.0"` | Version string |
| `environment` | `development` \| `staging` \| `production` | `"development"` | Deployment environment |

#### `ingestion.parser`
| Parameter | Type | Options | Description |
|-----------|------|---------|-------------|
| `provider` | string | `unstructured`, `llamaparse`, `multimodal_unstructured` | Parser backend |
| `config` | object | varies | Provider-specific settings (e.g., `strategy`, `languages`, `extract_images`) |

#### `ingestion.chunker`
| Parameter | Type | Options | Description |
|-----------|------|---------|-------------|
| `provider` | string | `semantic`, `recursive`, `hierarchical`, `by_title`, `fixed_size`, `multimodal_summarizer` | Chunking strategy |
| `config.target_chunk_size` | int | — | Target size for semantic/by_title chunkers |
| `config.chunk_size` | int | — | Size for recursive/fixed chunkers |
| `config.chunk_overlap` | int | — | Overlap for recursive/fixed chunkers |

#### `ingestion.multimodal_summarizer`
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `provider` | string | `"primary"` | `primary` (use main LLM), `openai`, `anthropic`, `cohere`, `local` |
| `model_name` | string | `"gpt-4o"` | Vision-capable model for summarizing tables/images |
| `temperature` | float | `0.0` | Sampling temperature for summaries |
| `api_key` | string? | `null` | API key (if using separate provider) |
| `base_url` | string? | `null` | Custom endpoint URL |

#### `ingestion`
| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `batch_size` | int | 1–1000 | `50` | Batch size for parallel embed/upsert operations |

#### `embeddings`
| Parameter | Type | Options | Description |
|-----------|------|---------|-------------|
| `provider` | string | `openai`, `cohere`, `local` | Embedding provider |
| `config.model_name` | string | — | Model identifier (e.g., `sentence-transformers/all-MiniLM-L6-v2`) |
| `config.device` | string | `cpu`, `cuda` | Device for local models |

#### `llm`
| Parameter | Type | Options | Description |
|-----------|------|---------|-------------|
| `provider` | string | `openai`, `anthropic`, `cohere`, `local` | LLM provider |
| `config.model` | string | — | Model identifier |
| `config.base_url` | string | — | Server URL (required for `local` provider) |
| `config.temperature` | float | — | Sampling temperature |
| `config.max_tokens` | int | — | Maximum completion tokens |

#### `vector_store`
| Parameter | Type | Options | Description |
|-----------|------|---------|-------------|
| `provider` | string | `qdrant`, `pinecone`, `milvus`, `pgvector` | Database backend |
| `config.url` | string | — | Server URL or local path |
| `config.collection_name` | string | — | Collection/index/table name |
| `config.vector_size` | int | — | Embedding dimensions (auto-inferred if omitted) |

#### `retrieval`
| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `strategy` | string | `simple`, `multi_query`, `contextual_compression`, `auto_merging` | `"simple"` | Retrieval strategy |
| `top_k` | int | 1–1000 | `10` | Maximum candidates from vector search |
| `similarity_threshold` | float | 0.0–1.0 | `0.0` | Minimum similarity score filter |
| `reranker` | object? | — | `null` | Optional reranker configuration |

#### `generation`
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `system_prompt` | string | (contextual assistant prompt) | System message for LLM |
| `prompt_template` | string | `"Context:\n{context}\n\nQuestion: {query}\n\nAnswer:"` | Template with `{context}` and `{query}` placeholders |
| `max_context_chunks` | int | `5` | Max chunks forwarded to LLM context |
| `include_sources` | bool | `true` | Whether to return source chunks in results |

#### `guardrails`
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | bool | `true` | Master toggle |
| `input` | object? | `null` | Input guardrail provider config |
| `output` | object? | `null` | Output guardrail provider config |

#### `evaluation`
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `provider` | string | `"ragas"` | `ragas` or `trulens` |
| `enabled` | bool | `true` | Toggle automated evaluation |

### 6.3 Preset Configurations

The framework ships with 4 predefined preset configurations:

| Preset | Description |
|--------|-------------|
| `local_sandbox` | Lightweight local CPU-based models (MiniLM) with local LLM for prototyping |
| `enterprise_accuracy` | Hierarchical chunking, hybrid search, Cohere reranking, safety guardrails, and quality evaluations |
| `multimodal_layout` | Extracts text, tables, and images with vision-supported models for rich document parsing |
| `strict_security` | Strict content moderation with Llama Guard and safety-vetted prompts |

Presets are stored as YAML files in the `presets/` directory and can be activated, listed, or extended via the API.

### 6.4 Example Configuration

```yaml
project:
  name: local-sandbox-pipeline
  environment: development

ingestion:
  batch_size: 10
  parser:
    provider: unstructured
    config: {}
  chunker:
    provider: by_title
    config:
      target_chunk_size: 500
  multimodal_summarizer:
    provider: primary
    model_name: gpt-4o
    temperature: 0

embeddings:
  provider: local
  config:
    model_name: sentence-transformers/all-MiniLM-L6-v2
    device: cuda

llm:
  provider: local
  config:
    base_url: http://localhost:11434/v1
    model: gemma3:12b
    temperature: 0.1

vector_store:
  provider: qdrant
  config:
    collection_name: documents
    url: data/qdrant_db
    vector_size: 384

retrieval:
  strategy: simple
  top_k: 3
  similarity_threshold: 0

generation:
  system_prompt: "You are a helpful assistant."
  prompt_template: "Context:\n{context}\n\nQuestion: {query}\n\nAnswer:"
  max_context_chunks: 3
  include_sources: true
```

---

## 7. REST API Reference

The FastAPI backend exposes the following endpoints. All endpoints are prefixed with `/api/`.

### 7.1 System Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Returns pipeline health, provider info, chunk count |

**Response**:
```json
{
  "status": "active",
  "project_name": "local-sandbox-pipeline",
  "environment": "development",
  "parser_provider": "unstructured",
  "chunker_provider": "by_title",
  "llm_provider": "local",
  "vector_store_provider": "qdrant",
  "collection_name": "documents",
  "chunk_count": 42
}
```

### 7.2 Configuration Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config` | Retrieve raw YAML and resolved JSON config |
| `POST` | `/api/config` | Update config from YAML string, rebuild orchestrator |
| `POST` | `/api/config/json` | Update config from JSON object |
| `POST` | `/api/config/parse` | Dry-run: validate YAML without saving |

### 7.3 Preset Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/presets` | List all predefined + custom presets |
| `GET` | `/api/presets/{name}` | Get preset details and raw YAML |
| `POST` | `/api/presets/{name}` | Create/update a custom preset (YAML) |
| `POST` | `/api/presets/{name}/json` | Create/update a custom preset (JSON) |
| `POST` | `/api/presets/{name}/activate` | Activate preset: overwrite config + reload pipeline |
| `DELETE` | `/api/presets/{name}` | Delete a custom preset |

### 7.4 Document Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest` | Upload files for ingestion (multipart form-data) |
| `GET` | `/api/ingest/status` | Poll per-file ingestion progress |

**POST /api/ingest**

- **Content-Type**: `multipart/form-data`
- **Fields**: `files` (one or more files), `metadata_json` (optional JSON string)
- **Response**:
```json
{
  "status": "success",
  "message": "Successfully ingested 2 of 2 files.",
  "files": [
    {"filename": "report.pdf", "chunks_count": 15},
    {"filename": "data.csv", "chunks_count": 3}
  ],
  "total_chunks_ingested": 18,
  "chunk_ids": ["uuid-1", "uuid-2", "..."],
  "failures": []
}
```

**GET /api/ingest/status**

Returns per-file ingestion progress with step numbers and element statistics:
```json
{
  "report.pdf": {
    "step": 3,
    "status": "completed",
    "details": "Ingestion successful! Indexed 15 chunks.",
    "text_count": 12,
    "table_count": 2,
    "image_count": 1,
    "title_count": 3,
    "total_elements": 18,
    "chunks_count": 15,
    "chunks": [...]
  }
}
```

### 7.5 Document Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/documents` | List all ingested documents (aggregated from vector store) |
| `GET` | `/api/documents/{filename}/chunks` | Fetch chunks for a specific document |
| `DELETE` | `/api/documents/{filename}` | Delete a document and all its chunks |

### 7.6 Query & Retrieval

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/query` | Full RAG query (guardrails + retrieval + generation + evaluation) |
| `POST` | `/api/query/stream` | Streaming RAG query via Server-Sent Events (SSE) |
| `POST` | `/api/retrieve` | Retrieval-only (no LLM generation) |
| `GET` | `/api/chunks` | List all chunks in the vector store |

**POST /api/query**

```json
// Request
{
  "query": "What is the reimbursement policy?",
  "ground_truth": "Optional reference answer",
  "metadata": {"filters": {"file_name": "policy.pdf"}},
  "attachments": [{"filename": "extra.txt", "content": "..."}]
}

// Response
{
  "answer": "According to the policy document...",
  "latency_ms": 1234.56,
  "trace_id": "uuid",
  "metadata": {
    "num_sources_retrieved": 5,
    "num_sources_used": 3,
    "evaluation": {"metrics": {"faithfulness": 0.95}}
  },
  "sources": [
    {"content": "...", "score": 0.92, "metadata": {...}}
  ]
}
```

### 7.7 Attachment Parsing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/parse-attachment` | Parse an uploaded file for chat context (text extraction + image base64 encoding) |

---

## 8. Frontend Dashboard

The frontend is a React 19 + TypeScript application built with Vite and styled with Tailwind CSS v4. It provides three main views:

### 8.1 Architecture

```
src/
├── App.tsx                    # Root component with page routing
├── main.tsx                   # React entry point
├── store/useStore.ts          # Zustand state management
├── api/queries.ts             # React Query hooks for API calls
├── types.ts                   # Shared TypeScript interfaces
├── components/
│   ├── Sidebar.tsx            # Navigation drawer with conversation history
│   ├── Header.tsx             # Top bar with page title
│   ├── ChatPanel.tsx          # RAG chat interface
│   ├── IngestPanel.tsx        # Document ingestion dashboard
│   ├── ConfigPanel.tsx        # Pipeline configuration editor
│   ├── ChunksPanel.tsx        # Chunk browser/explorer
│   ├── ingest/
│   │   ├── FileRegistryList.tsx      # Document registry with expandable rows
│   │   ├── ChunkInspector.tsx        # Side panel: original text, AI summary, metadata
│   │   ├── FileMetricsInspector.tsx  # Document-level metrics inspector
│   │   ├── IngestOverview.tsx        # Pipeline status overview
│   │   └── PipelineVisualizer.tsx    # Animated step-by-step ingestion wizard
│   ├── config/
│   │   ├── GeneralSettingsCard.tsx   # Project + parser + chunker settings
│   │   ├── SplitterConfigCard.tsx    # Chunker-specific configuration
│   │   ├── EmbeddingsConfigCard.tsx  # Embedding model settings
│   │   ├── LlmConfigCard.tsx        # LLM provider settings
│   │   ├── VectorDbConfigCard.tsx    # Vector store settings
│   │   ├── RetrievalConfigCard.tsx   # Retrieval strategy settings
│   │   ├── GenerationConfigCard.tsx  # Generation prompt settings
│   │   ├── SafetyConfigCard.tsx      # Guardrails settings
│   │   └── ObservabilityConfigCard.tsx  # Logging/tracing/metrics settings
│   └── ui/
│       ├── Toast.tsx            # Notification toast component
│       └── Tooltip.tsx          # Hover tooltip component
```

### 8.2 Chat Panel

- Multi-conversation management with conversation history
- SSE-based streaming token display with markdown rendering
- File attachment support (parsed via `/api/parse-attachment`)
- Source attribution with expandable source cards showing scores and metadata
- Evaluation metrics display when configured

### 8.3 Ingest Panel

- **Drag-and-drop file upload** with multi-file support
- **Animated ingestion wizard** showing step-by-step progress:
  1. File upload
  2. Layout partitioning (text, tables, images detection)
  3. Chunking + AI summarization + embedding + vector indexing
- **Document registry** listing all ingested files with:
  - Chunk count, total tokens, file type, upload timestamp
  - Summarization progress (how many multimodal chunks have AI summaries)
  - Expandable chunk list with page numbers and type badges
- **Chunk Inspector** side panel with three tabs:
  - **Original Text** — Raw extracted content with rendered tables/images
  - **AI Summary** — Vision LLM-generated searchable description
  - **Metadata** — Full chunk metadata in a key-value table

### 8.4 Config Panel

- **Visual configuration editor** with categorized cards for each pipeline section
- **YAML editor** with syntax validation and live JSON preview
- **Preset management** — activate, create, and switch between configuration presets
- **Hot reload** — configuration changes rebuild the pipeline orchestrator without server restart

### 8.5 State Management

The frontend uses **Zustand** for global state management and **React Query** for server state synchronization:

- `useStore` — Client-side state: active page, wizard state, upload state, conversations
- `useRagStatus()` — Polls `/api/status` for pipeline health
- `useDocuments()` — Fetches `/api/documents` for the document registry
- `usePipelineConfig()` — Fetches `/api/config` for configuration display
- `useIngestStatus()` — Polls `/api/ingest/status` during active uploads
- `useUploadDocuments()` — Mutation hook for file upload
- `useDeleteDocument()` — Mutation hook for document deletion

---

## 9. Observability

### 9.1 Structured Logging

All components use `structlog` for structured JSON logging. Log events include:
- Component lifecycle events (`pipeline_initialize_start`, `pipeline_ingest_parse_complete`)
- Performance metrics (`prompt_tokens`, `completion_tokens`)
- Error context (`error=`, `chunk_id=`)

### 9.2 Distributed Tracing

The `@trace_operation(stage, name)` decorator and `trace_span()` context manager create OpenTelemetry spans for every pipeline operation. Each span is tagged with:
- `LifecycleStage` (ingest, parse, chunk, embed, upsert, retrieve, rerank, generate, guardrail, evaluate)
- Operation name
- Custom attributes

Supported backends:
- **OpenTelemetry** — Export to any OTLP-compatible collector (Jaeger, Grafana Tempo, etc.)
- **LangSmith** — LangChain's observability platform

### 9.3 Metrics

Prometheus metrics endpoint (configurable port, default 9090) exposes runtime pipeline metrics.

---

## 10. Installation & Quickstart

### 10.1 Prerequisites

- Python 3.11+
- Node.js 18+ (for the frontend)
- Optional: CUDA-capable GPU for local embeddings/LLM acceleration
- Optional: Ollama or vLLM for local LLM inference

### 10.2 Backend Setup

```bash
# Clone the repository
git clone <repo-url>
cd advanced-rag

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install with core + desired providers
pip install -e ".[api,local,qdrant,unstructured]"

# Configure the pipeline
# Edit config.yaml with your preferred providers
```

### 10.3 Frontend Setup

```bash
cd frontend
npm install
```

### 10.4 Running the Application

The `run_servers.sh` script starts both servers concurrently:

```bash
./run_servers.sh
```

This will:
1. Activate the Python virtual environment
2. Install the package in editable mode
3. Start the FastAPI backend on `http://localhost:8000`
4. Start the Vite React dev server on `http://localhost:5173`

**Manual startup**:

```bash
# Terminal 1: Backend
source .venv/bin/activate
uvicorn src.rag.api.app:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend && npm run dev
```

### 10.5 Optional Dependencies

Install only the providers you need:

```bash
pip install -e ".[openai]"         # OpenAI LLM + embeddings
pip install -e ".[anthropic]"      # Anthropic Claude
pip install -e ".[cohere]"         # Cohere LLM + embeddings + reranking
pip install -e ".[local]"          # sentence-transformers (local embeddings)
pip install -e ".[qdrant]"         # Qdrant vector store
pip install -e ".[pinecone]"       # Pinecone vector store
pip install -e ".[milvus]"         # Milvus vector store
pip install -e ".[pgvector]"       # PostgreSQL + pgvector
pip install -e ".[unstructured]"   # Unstructured.io parser
pip install -e ".[llamaparse]"     # LlamaParse parser
pip install -e ".[ragas]"          # Ragas evaluation
pip install -e ".[trulens]"        # TruLens evaluation
pip install -e ".[telemetry]"      # OpenTelemetry tracing
pip install -e ".[all]"            # Everything
```

---

## 11. Extending the Framework

### 11.1 Creating a Custom Component

1. **Extend the appropriate ABC** from `src/rag/core/interfaces.py`
2. **Register with the decorator**: `@ComponentRegistry.register("component_type", "provider_name")`
3. **Add the module path** to `_IMPLEMENTATION_MODULES` in `src/rag/core/registry.py`
4. **Reference in `config.yaml`** using the provider name

**Example: Custom Vector Store**

```python
# src/rag/vectorstores/my_custom_store.py

from rag.core.interfaces import BaseVectorStore
from rag.core.registry import ComponentRegistry
from rag.core.types import Chunk, RetrievalResult, SparseVector

@ComponentRegistry.register("vector_store", "my_custom")
class MyCustomVectorStore(BaseVectorStore):
    def __init__(self, connection_url: str, **kwargs):
        self._url = connection_url

    async def initialize(self) -> None:
        # Create indexes/collections
        ...

    async def upsert(self, chunks: list[Chunk]) -> list[str]:
        # Insert/update vectors
        ...

    async def search(self, query_embedding, top_k=10, filters=None) -> list[RetrievalResult]:
        # Dense search
        ...

    # ... implement remaining abstract methods
```

```yaml
# config.yaml
vector_store:
  provider: my_custom
  config:
    connection_url: "http://localhost:9200"
```

### 11.2 Adding a New Preset

Create a YAML file in `presets/` with a valid pipeline configuration:

```bash
cp presets/local_sandbox.yaml presets/my_custom_preset.yaml
# Edit my_custom_preset.yaml with your settings
```

Or create via the API:
```bash
curl -X POST http://localhost:8000/api/presets/my_custom_preset \
  -H "Content-Type: application/json" \
  -d '{"yaml_content": "project:\n  name: my-preset\n..."}'
```

---

## 12. Project Structure

```
advanced-rag/
├── config.yaml                    # Active pipeline configuration
├── pyproject.toml                 # Python package metadata & dependencies
├── requirements.txt               # Pinned dependency versions
├── run_servers.sh                 # Combined backend + frontend launcher
├── README.md                      # Project overview
│
├── docs/                          # Documentation
│   ├── architecture.md            # Architecture & design patterns
│   ├── configuration.md           # Configuration parameter reference
│   ├── api_guide.md               # Developer API guide
│   ├── multimodal_rag.md          # Multi-modal RAG guide
│   └── full_documentation.md      # This file
│
├── presets/                       # Configuration presets
│   ├── local_sandbox.yaml
│   ├── enterprise_accuracy.yaml
│   ├── multimodal_layout.yaml
│   └── strict_security.yaml
│
├── src/rag/                       # Python backend package
│   ├── __init__.py
│   ├── core/                      # Interfaces, Registry, Factory, Types
│   │   ├── interfaces.py          # 9 Abstract Base Classes
│   │   ├── registry.py            # Component auto-discovery registry
│   │   ├── factory.py             # Config-driven component instantiation
│   │   └── types.py               # Pydantic v2 domain models
│   ├── config/                    # Configuration loading & validation
│   │   ├── schema.py              # PipelineConfig Pydantic schema
│   │   └── loader.py              # YAML loading + env var interpolation
│   ├── api/                       # FastAPI REST API
│   │   └── app.py                 # All endpoints + background tasks
│   ├── pipeline/                  # Central orchestrator
│   │   └── orchestrator.py        # RAGPipelineOrchestrator
│   ├── ingestion/                 # Document parsing & chunking
│   │   ├── parsers/               # UnstructuredParser, LlamaParseParser, MultimodalUnstructured
│   │   └── chunkers/              # Semantic, Recursive, Hierarchical, ByTitle, MultimodalSummarizer
│   ├── embeddings/                # OpenAI, Cohere, Local (sentence-transformers)
│   ├── llm/                       # OpenAI, Anthropic, Cohere, Local (Ollama/vLLM)
│   ├── vectorstores/              # Qdrant, Pinecone, Milvus, PGVector
│   ├── retrieval/                 # Retrieval strategies + rerankers
│   │   ├── strategies/            # Simple, MultiQuery, ContextualCompression, AutoMerging
│   │   └── rerankers/             # Cohere, CrossEncoder
│   ├── guardrails/                # LlamaGuard, NeMo
│   ├── evaluation/                # Ragas, TruLens
│   └── observability/             # Structured logging, OpenTelemetry tracing, Prometheus
│
├── frontend/                      # React + Vite frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx                # Root component
│       ├── main.tsx               # Entry point
│       ├── store/useStore.ts      # Zustand state management
│       ├── api/queries.ts         # React Query API hooks
│       ├── types.ts               # TypeScript interfaces
│       └── components/            # UI components (Chat, Ingest, Config, etc.)
│
├── tests/                         # Unit & integration tests
├── data/                          # Local data directory (Qdrant DB, uploads)
└── test_data/                     # Test fixtures
```

---

*Generated from source code analysis of the Advanced RAG Framework codebase.*

# Configuration Reference Guide

The Advanced RAG Framework is entirely configuration-driven. A single configuration schema parses, validates, and initializes the entire pipeline. This reference guide describes each section of the `config.yaml` file.

---

## 🔌 Environment Variable Interpolation

The framework automatically interpolates system environment variables using the `${VAR}` or `${VAR:-default_value}` syntax before validation.

```yaml
# Examples:
api_key: "${OPENAI_API_KEY}"          # Requires OPENAI_API_KEY to be set
endpoint: "${TRACING_ENDPOINT:-http://localhost:4317}" # Defaults to localhost
```

---

## 📂 Configuration Parameters Reference

### 1. `project`
Metadata describing the deployment workspace context.

*   **`name`** (string): The name identifier for the RAG pipeline.
*   **`version`** (string): Version string of the RAG config.
*   **`environment`** (enum): Allowed values: `"development"`, `"staging"`, `"production"`.

---

### 2. `observability`
Central configuration for logging, tracing, and metric endpoints.

#### `logging`
*   **`level`** (enum): `"DEBUG"`, `"INFO"`, `"WARNING"`, `"ERROR"`, `"CRITICAL"`.
*   **`format`** (enum): `"json"` (structured production logs) or `"text"` (human-readable).
*   **`output`** (enum): `"stdout"` or `"file"`.
*   **`file_path`** (string/null): Required if output is `"file"`.

#### `tracing`
*   **`enabled`** (boolean): Toggle OpenTelemetry/LangSmith tracking.
*   **`provider`** (enum): `"opentelemetry"`, `"langsmith"`.
*   **`endpoint`** (string): OTLP collector endpoint.
*   **`service_name`** (string): Tracing service identification.
*   **`sample_rate`** (float): Rate between `0.0` and `1.0`.

#### `metrics`
*   **`enabled`** (boolean): Toggle Prometheus collector endpoint.
*   **`provider`** (enum): `"prometheus"`.
*   **`port`** (integer): Port to expose Prometheus metrics (default: `9090`).

---

### 3. `ingestion`
Parameters governing document parsing and chunking.

*   **`parser`** (object):
    *   **`provider`** (enum): `"unstructured"`, `"llamaparse"`.
    *   **`config`** (object): Forwarded constructor configurations.
        *   *Unstructured:* `strategy` (`"hi_res"`, `"fast"`, `"ocr_only"`), `languages` (list), `extract_images` (bool).
        *   *LlamaParse:* `result_type` (`"markdown"`, `"text"`), `premium_mode` (bool), `num_workers` (int).
*   **`chunker`** (object):
    *   **`provider`** (enum): `"semantic"`, `"recursive"`, `"hierarchical"`.
    *   **`config`** (object):
        *   *Semantic Chunker:* `target_chunk_size` (int), `similarity_threshold` (float), `buffer_size` (int).
        *   *Recursive Chunker:* `chunk_size` (int), `chunk_overlap` (int).
        *   *Hierarchical Chunker:* `parent_chunk_size` (int), `child_chunk_size` (int).
*   **`batch_size`** (integer): Parsing/Upserting batch size (1-1000).

---

### 4. `embeddings`
Embedding generation settings.

*   **`provider`** (enum): `"openai"`, `"cohere"`, `"local"`.
*   **`config`** (object):
    *   *OpenAI:* `model` (e.g. `"text-embedding-3-small"`), `dimensions` (int), `api_key` (string).
    *   *Cohere:* `model` (e.g. `"embed-english-v3.0"`), `api_key` (string).
    *   *Local:* `model` (e.g. `"all-MiniLM-L6-v2"`), `device` (`"cpu"`, `"cuda"`).

---

### 5. `llm`
Large Language Model settings.

*   **`provider`** (enum): `"openai"`, `"anthropic"`, `"cohere"`, `"local"`.
*   **`config`** (object):
    *   *OpenAI:* `model` (`"gpt-4o"`, `"gpt-4o-mini"`), `temperature` (float), `max_tokens` (int), `api_key` (string).
    *   *Anthropic:* `model` (`"claude-3-5-sonnet-latest"`), `api_key` (string).
    *   *Cohere:* `model` (`"command-r-plus"`), `api_key` (string).
    *   *Local:* `model` (model key), `base_url` (Ollama/vLLM local server endpoint).

---

### 6. `vector_store`
Database engine selection.

*   **`provider`** (enum): `"qdrant"`, `"pinecone"`, `"milvus"`, `"pgvector"`.
*   **`config`** (object):
    *   *Qdrant:* `url`, `api_key`, `collection_name`, `distance` (`"cosine"`, `"euclidean"`).
    *   *Pinecone:* `api_key`, `index_name`, `namespace`.
    *   *Milvus:* `uri`, `token`, `collection_name`.
    *   *PGVector:* `connection_string` (asyncpg database URL), `table_name`.

---

### 7. `retrieval`
Strategy settings for candidates search and reranking.

*   **`strategy`** (enum): `"simple"`, `"multi_query"`, `"contextual_compression"`, `"auto_merging"`.
*   **`top_k`** (integer): Initial candidate limit returned by the database.
*   **`similarity_threshold`** (float): Minimum candidate vector similarity threshold (0.0 to 1.0).
*   **`config`** (object): Extra settings for custom retrievers.
*   **`reranker`** (object/null):
    *   **`provider`** (enum): `"cohere"`, `"cross_encoder"`.
    *   **`config`** (object):
        *   *Cohere:* `model` (rerank model), `top_n` (int), `api_key` (string).
        *   *Cross-Encoder:* `model` (sentence-transformers model), `top_n` (int).

---

### 8. `generation`
Answer synthesis options.

*   **`system_prompt`** (string): Prompt defining the LLM role and rules.
*   **`prompt_template`** (string): Text string formatting `{context}` and `{query}` keys together.
*   **`max_context_chunks`** (integer): Maximum number of text chunks forwarded to the prompt context.
*   **`include_sources`** (boolean): Flag to attach scored sources to the `GenerationResult`.

---

### 9. `guardrails`
Safety validation parameters.

*   **`enabled`** (boolean): Toggle input/output checks.
*   **`input`** (object/null): Input GuardrailProviderConfig.
    *   **`provider`** (enum): `"llama_guard"`, `"nemo"`.
    *   **`config`** (object): Settings (e.g. `model`, `api_key`, `base_url`).
*   **`output`** (object/null): Output GuardrailProviderConfig.

---

### 10. `evaluation`
Automated evaluation loop settings.

*   **`enabled`** (boolean): Toggle automated evaluation.
*   **`provider`** (enum): `"ragas"`, `"trulens"`.
*   **`config`** (object):
    *   *Ragas:* `metrics` (list of metrics to compute), `llm_model`, `embeddings_model`, `api_key`.
    *   *TruLens:* `metrics` (list), `llm_model`, `api_key`.

"""Centralized Pydantic v2 configuration schema.

Every tunable parameter in the pipeline is expressed here as a strictly
validated Pydantic model.  The top-level ``PipelineConfig`` is the single
source of truth consumed by the Factory to assemble components at runtime.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


# ─── Project ─────────────────────────────────────────────────────────────


class ProjectConfig(BaseModel):
    """Top-level project metadata."""

    name: str = "rag-pipeline"
    version: str = "1.0.0"
    environment: Literal["development", "staging", "production"] = "development"


# ─── Observability ───────────────────────────────────────────────────────


class LoggingConfig(BaseModel):
    """Structured logging configuration."""

    level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    format: Literal["json", "text"] = "json"
    output: Literal["stdout", "file"] = "stdout"
    file_path: str | None = None

    @model_validator(mode="after")
    def _validate_file_path(self) -> "LoggingConfig":
        if self.output == "file" and not self.file_path:
            raise ValueError("file_path is required when output is 'file'")
        return self


class TracingConfig(BaseModel):
    """Distributed tracing configuration."""

    enabled: bool = True
    provider: Literal["opentelemetry", "langsmith"] = "opentelemetry"
    endpoint: str = "http://localhost:4317"
    service_name: str = "rag-pipeline"
    api_key: str | None = None
    sample_rate: float = Field(default=1.0, ge=0.0, le=1.0)


class MetricsConfig(BaseModel):
    """Metrics export configuration."""

    enabled: bool = True
    provider: Literal["prometheus", "custom"] = "prometheus"
    port: int = Field(default=9090, ge=1024, le=65535)


class ObservabilityConfig(BaseModel):
    """Unified observability (logging + tracing + metrics)."""

    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    tracing: TracingConfig = Field(default_factory=TracingConfig)
    metrics: MetricsConfig = Field(default_factory=MetricsConfig)


# ─── Provider Base ───────────────────────────────────────────────────────


class ProviderConfig(BaseModel):
    """Base for any swappable component identified by a provider name."""

    model_config = {"extra": "forbid"}

    provider: str
    config: dict[str, Any] = Field(default_factory=dict)


# ─── Ingestion ───────────────────────────────────────────────────────────


class ParserConfig(ProviderConfig):
    """Document parser provider selection."""

    provider: Literal[
        "unstructured",
        "unstructured_api",
        "llamaparse",
        "pymupdf",
        "docling",
        "gcp_documentai",
    ] = "unstructured"


class ChunkerConfig(ProviderConfig):
    """Chunking strategy selection."""

    provider: Literal[
        "semantic",
        "recursive",
        "hierarchical",
        "by_title",
        "fixed_size",
        "multimodal_summarizer",
        "markdown_header",
    ] = "semantic"


class IngestionConfig(BaseModel):
    """Full ingestion pipeline configuration."""

    class MultimodalSummarizerConfig(BaseModel):
        """Configuration for the multimodal summarizer."""
        model_config = {"extra": "allow"}
        provider: Literal["primary", "openai", "anthropic", "cohere", "local"] = "primary"
        model_name: str = "gpt-4o"
        temperature: float = 0.0
        api_key: str | None = None
        base_url: str | None = None

    class PyMuPDFConfig(BaseModel):
        """Configuration for PyMuPDF parser."""
        model_config = {"extra": "allow"}
        extract_images: bool = False

    class DoclingConfig(BaseModel):
        """Configuration for Docling parser."""
        model_config = {"extra": "allow"}
        export_format: Literal["markdown", "json"] = "markdown"

    class GCPDocumentAIConfig(BaseModel):
        """Configuration for GCP Document AI parser."""
        model_config = {"extra": "allow"}
        project_id: str | None = None
        location: str = "us"
        processor_id: str | None = None

    class UnstructuredAPIConfig(BaseModel):
        """Configuration for Unstructured API parser."""
        model_config = {"extra": "allow"}
        api_url: str = "https://api.unstructured.io/general/v0/general"
        api_key: str | None = None
        strategy: str = "hi_res"

    class MarkdownHeaderConfig(BaseModel):
        """Configuration for Markdown Header Splitter."""
        model_config = {"extra": "allow"}
        max_chunk_size: int = Field(default=1024, ge=100, le=8192)
        chunk_overlap: int = Field(default=200, ge=0, le=4096)
        prepend_headers: bool = True

    parser: ParserConfig = Field(
        default_factory=lambda: ParserConfig(provider="unstructured")
    )
    chunker: ChunkerConfig = Field(
        default_factory=lambda: ChunkerConfig(provider="semantic")
    )
    multimodal_summarizer: MultimodalSummarizerConfig = Field(
        default_factory=MultimodalSummarizerConfig
    )
    pymupdf: PyMuPDFConfig = Field(default_factory=PyMuPDFConfig)
    docling: DoclingConfig = Field(default_factory=DoclingConfig)
    gcp_documentai: GCPDocumentAIConfig = Field(default_factory=GCPDocumentAIConfig)
    unstructured_api: UnstructuredAPIConfig = Field(default_factory=UnstructuredAPIConfig)
    markdown_header: MarkdownHeaderConfig = Field(default_factory=MarkdownHeaderConfig)
    batch_size: int = Field(default=50, ge=1, le=1000)


# ─── Embeddings ──────────────────────────────────────────────────────────


class EmbeddingsConfig(ProviderConfig):
    """Embedding model provider selection."""

    provider: Literal["openai", "cohere", "local"] = "openai"


# ─── LLM ─────────────────────────────────────────────────────────────────


class LLMConfig(ProviderConfig):
    """Large-language-model provider selection."""

    provider: Literal["openai", "anthropic", "cohere", "local"] = "openai"


# ─── Vector Store ────────────────────────────────────────────────────────


class VectorStoreConfig(ProviderConfig):
    """Vector database provider selection."""

    provider: Literal["pinecone", "qdrant", "milvus", "pgvector"] = "qdrant"


# ─── Retrieval ───────────────────────────────────────────────────────────


class RerankerConfig(ProviderConfig):
    """Reranker provider selection."""

    provider: Literal["cohere", "cross_encoder"] = "cohere"


class RetrievalConfig(BaseModel):
    """Retrieval strategy + reranker configuration."""

    strategy: Literal[
        "simple", "multi_query", "contextual_compression", "auto_merging"
    ] = "simple"
    config: dict[str, Any] = Field(default_factory=dict)
    reranker: RerankerConfig | None = None
    top_k: int = Field(default=10, ge=1, le=1000)
    similarity_threshold: float = Field(default=0.0, ge=0.0, le=1.0)


# ─── Guardrails ──────────────────────────────────────────────────────────


class GuardrailProviderConfig(ProviderConfig):
    """Guardrail provider selection."""

    provider: Literal["llama_guard", "nemo"] = "llama_guard"


class GuardrailsConfig(BaseModel):
    """Input and output guardrail configuration."""

    enabled: bool = True
    input: GuardrailProviderConfig | None = None
    output: GuardrailProviderConfig | None = None


# ─── Evaluation ──────────────────────────────────────────────────────────


class EvaluationConfig(ProviderConfig):
    """Automated evaluation framework configuration."""

    provider: Literal["ragas", "trulens"] = "ragas"
    enabled: bool = True


# ─── Generation ──────────────────────────────────────────────────────────


class GenerationConfig(BaseModel):
    """Configuration for the answer synthesis step."""

    system_prompt: str = (
        "You are a helpful assistant. Answer the user's question based only on "
        "the provided context. If the context does not contain enough information "
        "to answer, say so explicitly."
    )
    prompt_template: str = (
        "Context:\n{context}\n\n---\n\nQuestion: {query}\n\nAnswer:"
    )
    max_context_chunks: int = Field(default=5, ge=1, le=50)
    include_sources: bool = True


# ─── Top-Level Pipeline Config ───────────────────────────────────────────


class PipelineConfig(BaseModel):
    """Root configuration model — the single object parsed from ``config.yaml``.

    Every field maps 1-to-1 with a top-level YAML key.  Pydantic v2 strict
    validation ensures the entire file is semantically correct before any
    component is instantiated.
    """

    model_config = {"extra": "forbid"}

    project: ProjectConfig = Field(default_factory=ProjectConfig)
    observability: ObservabilityConfig = Field(default_factory=ObservabilityConfig)
    ingestion: IngestionConfig = Field(default_factory=IngestionConfig)
    embeddings: EmbeddingsConfig = Field(
        default_factory=lambda: EmbeddingsConfig(provider="openai")
    )
    llm: LLMConfig = Field(
        default_factory=lambda: LLMConfig(provider="openai")
    )
    vector_store: VectorStoreConfig = Field(
        default_factory=lambda: VectorStoreConfig(provider="qdrant")
    )
    retrieval: RetrievalConfig = Field(default_factory=RetrievalConfig)
    generation: GenerationConfig = Field(default_factory=GenerationConfig)
    guardrails: GuardrailsConfig = Field(default_factory=GuardrailsConfig)
    evaluation: EvaluationConfig | None = None

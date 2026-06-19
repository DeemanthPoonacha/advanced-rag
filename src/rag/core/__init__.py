"""Core sub-package — interfaces, types, registry, and factory."""

from .factory import ComponentFactory
from .interfaces import (
    BaseChunker,
    BaseEmbeddingModel,
    BaseEvaluator,
    BaseGuardrail,
    BaseLLM,
    BaseParser,
    BaseReranker,
    BaseRetriever,
    BaseVectorStore,
)
from .registry import ComponentRegistry
from .types import (
    Chunk,
    ChunkingStrategy,
    DistanceMetric,
    Document,
    DocumentMetadata,
    EvaluationResult,
    GenerationResult,
    GuardrailResult,
    LifecycleStage,
    QueryContext,
    RetrievalResult,
    RetrievalStrategy,
    SparseVector,
    TokenUsage,
)

__all__ = [
    # Factory & Registry
    "ComponentFactory",
    "ComponentRegistry",
    # Interfaces
    "BaseChunker",
    "BaseEmbeddingModel",
    "BaseEvaluator",
    "BaseGuardrail",
    "BaseLLM",
    "BaseParser",
    "BaseReranker",
    "BaseRetriever",
    "BaseVectorStore",
    # Types
    "Chunk",
    "ChunkingStrategy",
    "DistanceMetric",
    "Document",
    "DocumentMetadata",
    "EvaluationResult",
    "GenerationResult",
    "GuardrailResult",
    "LifecycleStage",
    "QueryContext",
    "RetrievalResult",
    "RetrievalStrategy",
    "SparseVector",
    "TokenUsage",
]

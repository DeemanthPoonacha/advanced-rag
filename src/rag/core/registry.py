"""Component Registry — the global lookup table mapping provider names to classes.

Implementations register themselves via decorators at import time::

    @ComponentRegistry.register("parser", "unstructured")
    class UnstructuredParser(BaseParser):
        ...

The ``discover()`` method auto-imports all implementation modules so that
every decorator fires before the Factory reads from the registry.
"""

from __future__ import annotations

import importlib
import logging
from typing import TypeVar

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

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Maps component-type keys to their required base class.
COMPONENT_TYPES: dict[str, type] = {
    "parser": BaseParser,
    "chunker": BaseChunker,
    "embedding_model": BaseEmbeddingModel,
    "llm": BaseLLM,
    "vector_store": BaseVectorStore,
    "retriever": BaseRetriever,
    "reranker": BaseReranker,
    "guardrail": BaseGuardrail,
    "evaluator": BaseEvaluator,
}

# All known implementation modules.  Missing optional dependencies are
# silently skipped during discovery.
_IMPLEMENTATION_MODULES: list[str] = [
    # Parsers
    "rag.ingestion.parsers.unstructured_parser",
    "rag.ingestion.parsers.unstructured_api_parser",
    "rag.ingestion.parsers.llamaparse_parser",
    "rag.ingestion.parsers.pymupdf_parser",
    "rag.ingestion.parsers.docling_parser",
    "rag.ingestion.parsers.gcp_documentai_parser",
    # Chunkers
    "rag.ingestion.chunkers.semantic_chunker",
    "rag.ingestion.chunkers.recursive_chunker",
    "rag.ingestion.chunkers.hierarchical_chunker",
    "rag.ingestion.chunkers.by_title_chunker",
    "rag.ingestion.chunkers.markdown_header_chunker",
    # Embedding models
    "rag.embeddings.openai_embeddings",
    "rag.embeddings.cohere_embeddings",
    "rag.embeddings.local_embeddings",
    # LLMs
    "rag.llm.openai_llm",
    "rag.llm.anthropic_llm",
    "rag.llm.cohere_llm",
    "rag.llm.local_llm",
    # Vector stores
    "rag.vectorstores.qdrant_store",
    "rag.vectorstores.pinecone_store",
    "rag.vectorstores.milvus_store",
    "rag.vectorstores.pgvector_store",
    # Retrievers
    "rag.retrieval.strategies.simple_retriever",
    "rag.retrieval.strategies.multi_query",
    "rag.retrieval.strategies.contextual_compression",
    "rag.retrieval.strategies.auto_merging",
    "rag.retrieval.strategies.hybrid",
    "rag.retrieval.strategies.self_query",
    # Rerankers
    "rag.retrieval.rerankers.cohere_reranker",
    "rag.retrieval.rerankers.cross_encoder_reranker",
    # Guardrails
    "rag.guardrails.llama_guard",
    "rag.guardrails.nemo_guardrails",
    # Evaluators
    "rag.evaluation.ragas_evaluator",
    "rag.evaluation.trulens_evaluator",
]


class ComponentRegistry:
    """Thread-safe, global registry of component implementations.

    Concrete classes register themselves via the ``@register`` decorator.
    The Factory then calls ``get()`` to resolve a provider name to a class.
    """

    _registry: dict[str, dict[str, type]] = {key: {} for key in COMPONENT_TYPES}
    _discovered: bool = False

    # ── Registration ─────────────────────────────────────────────────

    @classmethod
    def register(cls, component_type: str, provider_name: str):
        """Class decorator that registers an implementation.

        Args:
            component_type: One of the keys in ``COMPONENT_TYPES``.
            provider_name: The string used in ``config.yaml`` (e.g. ``"openai"``).

        Returns:
            The original class, unmodified.

        Raises:
            ValueError: If ``component_type`` is unknown.
            TypeError: If the class does not extend the correct ABC.
        """
        if component_type not in COMPONENT_TYPES:
            raise ValueError(
                f"Unknown component type '{component_type}'. "
                f"Valid types: {list(COMPONENT_TYPES.keys())}"
            )

        def decorator(klass: type[T]) -> type[T]:
            base_class = COMPONENT_TYPES[component_type]
            if not issubclass(klass, base_class):
                raise TypeError(
                    f"{klass.__name__} must be a subclass of {base_class.__name__} "
                    f"to register as a '{component_type}'"
                )
            cls._registry[component_type][provider_name] = klass
            logger.debug(
                "Registered %s provider '%s' -> %s",
                component_type,
                provider_name,
                klass.__name__,
            )
            return klass

        return decorator

    # ── Lookup ───────────────────────────────────────────────────────

    @classmethod
    def get(cls, component_type: str, provider_name: str) -> type:
        """Retrieve a registered implementation class.

        Args:
            component_type: The component category (e.g. ``"parser"``).
            provider_name: The provider key (e.g. ``"unstructured"``).

        Returns:
            The registered class.

        Raises:
            KeyError: If the component type or provider is not registered.
        """
        if component_type not in cls._registry:
            raise KeyError(
                f"Unknown component type: '{component_type}'. "
                f"Valid types: {list(COMPONENT_TYPES.keys())}"
            )
        implementations = cls._registry[component_type]
        if provider_name not in implementations:
            available = list(implementations.keys()) or ["(none registered)"]
            raise KeyError(
                f"No '{provider_name}' registered for '{component_type}'. "
                f"Available providers: {available}"
            )
        return implementations[provider_name]

    @classmethod
    def list_providers(cls, component_type: str) -> list[str]:
        """List all registered provider names for a component type.

        Args:
            component_type: The component category.

        Returns:
            Sorted list of provider name strings.
        """
        if component_type not in cls._registry:
            raise KeyError(f"Unknown component type: '{component_type}'")
        return sorted(cls._registry[component_type].keys())

    @classmethod
    def list_all(cls) -> dict[str, list[str]]:
        """Return a mapping of every component type to its registered providers."""
        return {
            ctype: sorted(providers.keys())
            for ctype, providers in cls._registry.items()
        }

    # ── Auto-Discovery ───────────────────────────────────────────────

    @classmethod
    def discover(cls) -> None:
        """Auto-import all implementation modules so ``@register`` decorators fire.

        Modules whose optional dependencies are missing are silently skipped.
        This method is idempotent — repeated calls are no-ops.
        """
        if cls._discovered:
            return
        cls._discovered = True

        for module_path in _IMPLEMENTATION_MODULES:
            try:
                importlib.import_module(module_path)
                logger.debug("Discovered module: %s", module_path)
            except ImportError as exc:
                logger.debug(
                    "Skipping optional module %s (missing dependency: %s)",
                    module_path,
                    exc,
                )
            except Exception:
                logger.exception("Error importing module %s", module_path)

    @classmethod
    def reset(cls) -> None:
        """Clear the registry.  Primarily used in tests."""
        cls._registry = {key: {} for key in COMPONENT_TYPES}
        cls._discovered = False

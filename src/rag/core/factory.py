"""Component Factory — builds concrete instances from ``PipelineConfig``.

The factory reads each section of the configuration, looks up the provider in
the ``ComponentRegistry``, and instantiates the appropriate implementation
class with its ``config`` dict unpacked as keyword arguments.
"""

from __future__ import annotations

import logging
from typing import Any

from ..config.schema import PipelineConfig
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

logger = logging.getLogger(__name__)


class ComponentFactory:
    """Instantiates pipeline components via the registry + config.

    Usage::

        config = load_config("config.yaml")
        factory = ComponentFactory(config)
        parser = factory.create_parser()
        embedder = factory.create_embedding_model()
    """

    def __init__(self, config: PipelineConfig) -> None:
        self._config = config
        ComponentRegistry.discover()

    # ── Generic builder ──────────────────────────────────────────────

    def _build(
        self,
        component_type: str,
        provider: str,
        config: dict[str, Any],
    ) -> Any:
        """Look up and instantiate a component from the registry.

        Args:
            component_type: Registry category (e.g. ``"parser"``).
            provider: Provider key (e.g. ``"unstructured"``).
            config: Keyword arguments forwarded to the constructor.

        Returns:
            An instance of the registered implementation class.
        """
        import inspect
        klass = ComponentRegistry.get(component_type, provider)
        logger.info(
            "Building %s with provider '%s' -> %s",
            component_type,
            provider,
            klass.__name__,
        )
        try:
            sig = inspect.signature(klass)
            has_var_keyword = any(
                p.kind == inspect.Parameter.VAR_KEYWORD
                for p in sig.parameters.values()
            )
            if not has_var_keyword:
                filtered_config = {
                    k: v for k, v in config.items()
                    if k in sig.parameters
                }
            else:
                filtered_config = config
        except Exception:
            filtered_config = config

        return klass(**filtered_config)

    # ── Typed Builders ───────────────────────────────────────────────

    def create_parser(self) -> BaseParser:
        """Build the document parser specified in ``ingestion.parser``."""
        cfg = self._config.ingestion.parser
        
        # Route sub-configs dynamically based on provider type
        if cfg.provider == "pymupdf":
            parser_config = self._config.ingestion.pymupdf.model_dump()
        elif cfg.provider == "docling":
            parser_config = self._config.ingestion.docling.model_dump()
        elif cfg.provider == "gcp_documentai":
            parser_config = self._config.ingestion.gcp_documentai.model_dump()
        elif cfg.provider == "unstructured_api":
            parser_config = self._config.ingestion.unstructured_api.model_dump()
        else:
            parser_config = cfg.config
            
        return self._build("parser", cfg.provider, parser_config)

    def create_chunker(self) -> BaseChunker:
        """Build the chunker specified in ``ingestion.chunker``."""
        cfg = self._config.ingestion.chunker
        
        # Route sub-configs dynamically based on provider type
        if cfg.provider == "markdown_header":
            chunker_config = self._config.ingestion.markdown_header.model_dump()
        else:
            chunker_config = cfg.config
            
        return self._build("chunker", cfg.provider, chunker_config)

    def create_embedding_model(self) -> BaseEmbeddingModel:
        """Build the embedding model specified in ``embeddings``."""
        cfg = self._config.embeddings
        return self._build("embedding_model", cfg.provider, cfg.config)

    def create_llm(self) -> BaseLLM:
        """Build the LLM specified in ``llm``."""
        cfg = self._config.llm
        return self._build("llm", cfg.provider, cfg.config)

    def create_vector_store(self) -> BaseVectorStore:
        """Build the vector store specified in ``vector_store``.

        This method automatically unifies configuration parameters for collection,
        index, and table names, and infers vector dimensions from the configured
        embeddings provider if ``vector_size`` is not explicitly provided.
        """
        cfg = self._config.vector_store
        store_config = cfg.config.copy()

        # Unify collection_name, index_name, table_name
        collection_name = (
            store_config.get("collection_name")
            or store_config.get("index_name")
            or store_config.get("table_name")
        )
        if collection_name:
            store_config["collection_name"] = collection_name
            store_config["index_name"] = collection_name
            store_config["table_name"] = collection_name

        # Infer vector_size from embedding model if not specified or None
        if "vector_size" not in store_config or store_config["vector_size"] is None:
            embed_model = self.create_embedding_model()
            store_config["vector_size"] = embed_model.dimensions

        return self._build("vector_store", cfg.provider, store_config)

    def create_retriever(
        self,
        vector_store: BaseVectorStore,
        embedding_model: BaseEmbeddingModel,
        llm: BaseLLM | None = None,
    ) -> BaseRetriever:
        """Build the retriever strategy specified in ``retrieval``.

        Retriever constructors receive the vector store, embedding model,
        and optionally an LLM (required by multi-query / compression
        strategies) alongside the strategy-specific config.

        Args:
            vector_store: The initialised vector store instance.
            embedding_model: The initialised embedding model instance.
            llm: Optional LLM for query expansion / compression.

        Returns:
            A concrete ``BaseRetriever`` implementation.
        """
        cfg = self._config.retrieval
        params: dict[str, Any] = {
            "vector_store": vector_store,
            "embedding_model": embedding_model,
            "top_k": cfg.top_k,
            "similarity_threshold": cfg.similarity_threshold,
            **cfg.config,
        }
        if llm is not None:
            params["llm"] = llm
        return self._build("retriever", cfg.strategy, params)

    def create_reranker(self) -> BaseReranker | None:
        """Build the reranker if one is configured.

        Returns:
            A ``BaseReranker`` instance, or ``None`` if no reranker is configured.
        """
        cfg = self._config.retrieval.reranker
        if cfg is None:
            return None
        return self._build("reranker", cfg.provider, cfg.config)

    def create_input_guardrail(self) -> BaseGuardrail | None:
        """Build the input guardrail if enabled and configured.

        Returns:
            A ``BaseGuardrail`` instance, or ``None``.
        """
        cfg = self._config.guardrails
        if not cfg.enabled or cfg.input is None:
            return None
        return self._build("guardrail", cfg.input.provider, cfg.input.config)

    def create_output_guardrail(self) -> BaseGuardrail | None:
        """Build the output guardrail if enabled and configured.

        Returns:
            A ``BaseGuardrail`` instance, or ``None``.
        """
        cfg = self._config.guardrails
        if not cfg.enabled or cfg.output is None:
            return None
        return self._build("guardrail", cfg.output.provider, cfg.output.config)

    def create_evaluator(self) -> BaseEvaluator | None:
        """Build the evaluator if enabled and configured.

        Returns:
            A ``BaseEvaluator`` instance, or ``None``.
        """
        cfg = self._config.evaluation
        if cfg is None or not cfg.enabled:
            return None
        return self._build("evaluator", cfg.provider, cfg.config)

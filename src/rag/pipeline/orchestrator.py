"""RAG Pipeline Orchestrator.

Ties ingestion, embedding, vector storage, retrieval, reranking, LLM generation,
guardrails, and evaluation into a single unified execution loop.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator

import structlog

from ..config.schema import PipelineConfig
from ..core.factory import ComponentFactory
from ..core.types import (
    GenerationResult,
    LifecycleStage,
    QueryContext,
    TokenUsage,
)
from ..observability.tracing import trace_operation

logger = structlog.get_logger(__name__)


class RAGPipelineOrchestrator:
    """The central async engine orchestrating the RAG lifecycle.

    Usage::

        # Load config and orchestrator
        config = load_config("config.yaml")
        orchestrator = RAGPipelineOrchestrator(config)

        # Ingest a source document
        await orchestrator.ingest_source("path/to/doc.pdf")

        # Run retrieval and generation query
        result = await orchestrator.query("What is the system latency?")
        print(result.answer)
    """

    def __init__(self, config: PipelineConfig) -> None:
        """Initialize the pipeline orchestrator.

        Args:
            config: Pipeline configuration model.
        """
        self.config = config
        self.factory = ComponentFactory(config)

        # Ingestion components
        self.parser = self.factory.create_parser()
        self.chunker = self.factory.create_chunker()
        self.embedding_model = self.factory.create_embedding_model()
        
        if hasattr(self.chunker, "set_embedding_model"):
            self.chunker.set_embedding_model(self.embedding_model)

        self.vector_store = self.factory.create_vector_store()

        # Inference components
        self.llm = self.factory.create_llm()

        # Retrieval components
        self.retriever = self.factory.create_retriever(
            vector_store=self.vector_store,
            embedding_model=self.embedding_model,
            llm=self.llm,
        )
        self.reranker = self.factory.create_reranker()

        # Guardrails and Evaluation
        self.input_guardrail = self.factory.create_input_guardrail()
        self.output_guardrail = self.factory.create_output_guardrail()
        self.evaluator = self.factory.create_evaluator()

        self.ingestion_status: dict[str, Any] = {}
        self._initialized = False

    def start_ingestion(self, filenames: list[str]) -> None:
        """Clear and initialize the ingestion status tracking for a list of filenames."""
        self.ingestion_status.clear()
        for filename in filenames:
            self.ingestion_status[filename] = {
                "step": 1,
                "status": "uploading",
                "details": "Saving file to server queue...",
                "text_count": 0,
                "table_count": 0,
                "image_count": 0,
                "title_count": 0,
                "total_elements": 0,
                "chunks_count": 0,
                "chunks": []
            }

    def set_ingestion_failed(self, filename: str, error_message: str) -> None:
        """Set a document's ingestion status to failed with an error message."""
        self.ingestion_status[filename] = {
            "step": 3,
            "status": "failed",
            "details": f"Failure: {error_message}",
            "text_count": 0,
            "table_count": 0,
            "image_count": 0,
            "title_count": 0,
            "total_elements": 0,
            "chunks_count": 0,
            "chunks": []
        }

    async def initialize(self) -> None:
        """Ensure downstream indexes and connection pools are active."""
        if not self._initialized:
            logger.info("pipeline_initialize_start")
            await self.vector_store.initialize()
            self._initialized = True
            logger.info("pipeline_initialize_complete")

    # ── Ingestion Lifecycle ──────────────────────────────────────────

    @trace_operation(LifecycleStage.INGEST, "pipeline_ingest_source")
    async def ingest_source(
        self,
        source: str | bytes,
        metadata: dict[str, Any] | None = None,
    ) -> list[str]:
        """Ingest a single document source.

        Runs parser ➔ chunker ➔ embedding generator ➔ vector database upsert.

        Args:
            source: Local file path or raw file bytes.
            metadata: Custom metadata to attach to the document.

        Returns:
            List of generated chunk IDs stored in the vector database.
        """
        await self.initialize()

        # Resolve filename for progress status tracking
        filename = (metadata or {}).get("filename") if metadata else None
        if not filename:
            if isinstance(source, (str, Path)):
                import os
                filename = os.path.basename(str(source))
            else:
                filename = "uploaded_document"

        # Update status to step 2: layout partitioning
        self.ingestion_status[filename] = {
            "step": 2,
            "status": "partitioning",
            "details": "Analyzing layout to partition text, tables, and images...",
            "text_count": 0,
            "table_count": 0,
            "image_count": 0,
            "title_count": 0,
            "total_elements": 0,
            "chunks_count": 0,
            "chunks": []
        }

        try:
            logger.info("pipeline_ingest_parse_start", source_type=type(source).__name__)
            documents = await self.parser.parse(source, metadata)
            logger.info("pipeline_ingest_parse_complete", num_documents=len(documents))

            if not documents:
                self.ingestion_status[filename] = {
                    "step": 3,
                    "status": "completed",
                    "details": "No elements found to parse.",
                    "text_count": 0, "table_count": 0, "image_count": 0, "title_count": 0,
                    "total_elements": 0, "chunks_count": 0, "chunks": []
                }
                return []

            # Extract layout element statistics
            text_count = 0
            table_count = 0
            image_count = 0
            title_count = 0
            for doc in documents:
                m_dict = {}
                if doc.metadata:
                    if hasattr(doc.metadata, "model_dump"):
                        m_dict = doc.metadata.model_dump()
                    elif isinstance(doc.metadata, dict):
                        m_dict = doc.metadata
                custom = m_dict.get("custom", {})
                if not isinstance(custom, dict):
                    custom = {}
                
                # Check for tables and images inside custom metadata (from MultimodalUnstructuredParser)
                tables = custom.get("tables_html", [])
                if not isinstance(tables, list):
                    tables = [tables] if tables else []
                
                images = custom.get("images_base64", [])
                if not isinstance(images, list):
                    images = [images] if images else []

                if tables:
                    table_count += len(tables)
                if images:
                    image_count += len(images)

                el_type = custom.get("element_type", "text")
                if el_type == "text":
                    text_count += 1
                elif el_type == "table":
                    if not tables:
                        table_count += 1
                elif el_type == "image":
                    if not images:
                        image_count += 1
                elif el_type == "title":
                    title_count += 1
            
            total_elements = text_count + table_count + image_count + title_count

            # Update status to step 3: chunking & AI summarization
            self.ingestion_status[filename] = {
                "step": 3,
                "status": "chunking",
                "details": "Segmenting document into semantic blocks and generating AI summaries...",
                "text_count": text_count,
                "table_count": table_count,
                "image_count": image_count,
                "title_count": title_count,
                "total_elements": total_elements,
                "chunks_count": 0,
                "chunks": []
            }

            logger.info("pipeline_ingest_chunk_start")
            chunks = await self._chunk_documents(documents)
            logger.info("pipeline_ingest_chunk_complete", num_chunks=len(chunks))

            if not chunks:
                self.ingestion_status[filename] = {
                    "step": 3,
                    "status": "completed",
                    "details": "Layout partitioned, but 0 chunks created.",
                    "text_count": text_count, "table_count": table_count, "image_count": image_count, "title_count": title_count,
                    "total_elements": total_elements, "chunks_count": 0, "chunks": []
                }
                return []

            # Update status to indexing
            self.ingestion_status[filename] = {
                "step": 3,
                "status": "indexing",
                "details": "Embedding text blocks and upserting into vector DB...",
                "text_count": text_count,
                "table_count": table_count,
                "image_count": image_count,
                "title_count": title_count,
                "total_elements": total_elements,
                "chunks_count": len(chunks),
                "chunks": []
            }

            logger.info("pipeline_ingest_embed_start")
            texts = [chunk.content for chunk in chunks]
            embeddings = await self.embedding_model.embed(texts)

            # Try generating sparse embeddings if the embedding model supports it
            sparse_embeddings = None
            try:
                if hasattr(self.embedding_model, "embed_sparse"):
                    sparse_embeddings = await self.embedding_model.embed_sparse(texts)
            except Exception:
                pass

            # Attach embeddings to chunks
            for i, chunk in enumerate(chunks):
                chunk.embedding = embeddings[i]
                if sparse_embeddings:
                    s_vec = sparse_embeddings[i]
                    chunk.sparse_embedding = dict(zip(s_vec.indices, s_vec.values))

            logger.info("pipeline_ingest_embed_complete")

            logger.info("pipeline_ingest_upsert_start")
            chunk_ids = await self.vector_store.upsert(chunks)
            logger.info("pipeline_ingest_upsert_complete", num_upserted=len(chunk_ids))

            # Format chunk details to display dynamically in UI
            formatted_chunks = []
            for c in chunks:
                c_m = {}
                if c.metadata:
                    if hasattr(c.metadata, "model_dump"):
                        c_m = c.metadata.model_dump()
                    elif isinstance(c.metadata, dict):
                        c_m = c.metadata
                        
                file_type = c_m.get("file_type", "")
                custom = c_m.get("custom", {})
                if not isinstance(custom, dict):
                    custom = {}
                    
                c_type = "text"
                if (
                    file_type == "image" 
                    or custom.get("image_extracted") 
                    or custom.get("image_base64")
                    or (isinstance(custom.get("images_base64"), list) and len(custom["images_base64"]) > 0)
                ):
                    c_type = "image"
                elif (
                    custom.get("table_extracted")
                    or (isinstance(custom.get("tables_html"), list) and len(custom["tables_html"]) > 0)
                ):
                    c_type = "table"
                    
                summary = custom.get("summary_text", "")
                
                formatted_chunks.append({
                    "id": c.id,
                    "page": c_m.get("page_number", 1),
                    "type": c_type,
                    "snippet": c.content[:120] + "..." if len(c.content) > 120 else c.content,
                    "originalText": c.content,
                    "summaryText": summary,
                    "isRaw": not summary,
                    "metadata": c_m
                })

            # Update status to completed
            self.ingestion_status[filename] = {
                "step": 3,
                "status": "completed",
                "details": f"Ingestion successful! Indexed {len(chunks)} chunks.",
                "text_count": text_count,
                "table_count": table_count,
                "image_count": image_count,
                "title_count": title_count,
                "total_elements": total_elements,
                "chunks_count": len(chunks),
                "chunks": formatted_chunks
            }

            return chunk_ids

        except Exception as file_error:
            self.ingestion_status[filename] = {
                "step": 3,
                "status": "failed",
                "details": f"Failure: {str(file_error)}",
                "text_count": 0, "table_count": 0, "image_count": 0, "title_count": 0,
                "total_elements": 0, "chunks_count": 0, "chunks": []
            }
            raise file_error

    async def _chunk_documents(self, documents: list[Document]) -> list[Chunk]:
        """Chunk a list of documents, routing tables/images to MultimodalSummarizerChunker."""
        standard_docs = []
        multimodal_docs = []
        for doc in documents:
            m_dict = {}
            if doc.metadata:
                if hasattr(doc.metadata, "model_dump"):
                    m_dict = doc.metadata.model_dump()
                elif isinstance(doc.metadata, dict):
                    m_dict = doc.metadata
            custom = m_dict.get("custom", {}) or {}
            if not isinstance(custom, dict):
                custom = {}
            el_type = custom.get("element_type", "text")
            if el_type in ("table", "image"):
                multimodal_docs.append(doc)
            else:
                standard_docs.append(doc)

        chunks = []
        if standard_docs:
            chunks.extend(await self.chunker.chunk_batch(standard_docs))
        
        if multimodal_docs:
            try:
                from ..ingestion.chunkers.multimodal_summarizer import MultimodalSummarizerChunker
                cfg = self.config.ingestion.multimodal_summarizer
                
                summarizer_llm = None
                if cfg.provider == "primary":
                    summarizer_llm = self.llm
                else:
                    llm_config = {
                        "model": cfg.model_name,
                        "temperature": cfg.temperature,
                    }
                    if cfg.api_key:
                        llm_config["api_key"] = cfg.api_key
                    if cfg.base_url:
                        llm_config["base_url"] = cfg.base_url
                    summarizer_llm = self.factory._build("llm", cfg.provider, llm_config)

                summarizer = MultimodalSummarizerChunker(
                    llm=summarizer_llm,
                    model_name=cfg.model_name,
                    temperature=cfg.temperature,
                    api_key=cfg.api_key,
                    base_url=cfg.base_url
                )
                
                # Prepare each document with the tables_html or images_base64 list structure expected by the summarizer
                for doc in multimodal_docs:
                    custom = doc.metadata.custom
                    if not isinstance(custom, dict):
                        custom = {}
                        doc.metadata.custom = custom
                    if custom.get("element_type") == "table":
                        custom["tables_html"] = [doc.content]
                    elif custom.get("element_type") == "image":
                        image_b64 = custom.get("image_base64")
                        if image_b64:
                            custom["images_base64"] = [image_b64]
                        else:
                            custom["images_base64"] = []
                            
                mm_chunks = await summarizer.chunk_batch(multimodal_docs)
                chunks.extend(mm_chunks)
            except Exception as mm_err:
                logger.error("multimodal_chunker_failed_falling_back_to_text", error=str(mm_err))
                chunks.extend(await self.chunker.chunk_batch(multimodal_docs))

        return chunks

    @trace_operation(LifecycleStage.INGEST, "pipeline_ingest_batch")
    async def ingest_batch(
        self,
        sources: list[str | bytes],
        metadata: list[dict[str, Any]] | None = None,
    ) -> list[str]:
        """Ingest multiple document sources concurrently.

        Runs batch parse ➔ batch chunk ➔ batched embed ➔ batched upsert.

        Args:
            sources: List of file paths or raw bytes.
            metadata: Optional list of metadata dicts corresponding to each source.

        Returns:
            Flat list of all generated chunk IDs.
        """
        await self.initialize()

        logger.info("pipeline_ingest_batch_parse_start", num_sources=len(sources))
        documents = await self.parser.parse_batch(sources, metadata)
        logger.info("pipeline_ingest_batch_parse_complete", num_documents=len(documents))

        if not documents:
            return []

        logger.info("pipeline_ingest_batch_chunk_start")
        chunks = await self._chunk_documents(documents)
        logger.info("pipeline_ingest_batch_chunk_complete", num_chunks=len(chunks))

        if not chunks:
            return []

        batch_size = self.config.ingestion.batch_size
        logger.info("pipeline_ingest_batch_embed_start", batch_size=batch_size)

        # Process embeddings in config-defined batch sizes
        for start_idx in range(0, len(chunks), batch_size):
            end_idx = min(start_idx + batch_size, len(chunks))
            batch_chunks = chunks[start_idx:end_idx]
            batch_texts = [c.content for c in batch_chunks]

            embeddings = await self.embedding_model.embed(batch_texts)

            sparse_embeddings = None
            try:
                sparse_embeddings = await self.embedding_model.embed_sparse(batch_texts)
            except NotImplementedError:
                pass

            for i, chunk in enumerate(batch_chunks):
                chunk.embedding = embeddings[i]
                if sparse_embeddings:
                    s_vec = sparse_embeddings[i]
                    chunk.sparse_embedding = dict(zip(s_vec.indices, s_vec.values))

        logger.info("pipeline_ingest_batch_embed_complete")

        logger.info("pipeline_ingest_batch_upsert_start")
        chunk_ids = []
        for start_idx in range(0, len(chunks), batch_size):
            end_idx = min(start_idx + batch_size, len(chunks))
            batch_chunks = chunks[start_idx:end_idx]
            ids = await self.vector_store.upsert(batch_chunks)
            chunk_ids.extend(ids)

        logger.info("pipeline_ingest_batch_upsert_complete", num_upserted=len(chunk_ids))
        return chunk_ids

    # ── Query Lifecycle ──────────────────────────────────────────────

    @trace_operation(LifecycleStage.GENERATE, "pipeline_query")
    async def query(
        self,
        user_query: str,
        ground_truth: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> GenerationResult:
        """Run the end-to-end query, retrieval, generation, and validation pipeline.

        Args:
            user_query: User query question text.
            ground_truth: Optional reference answer (used for evaluation).
            metadata: Custom metadata passed to the query context.

        Returns:
            The complete validation-tested GenerationResult.
        """
        start_time = time.perf_counter()
        trace_id = str(uuid.uuid4())
        await self.initialize()

        logger.info("pipeline_query_start", query=user_query, trace_id=trace_id)

        # 1. Input Guardrail
        if self.input_guardrail:
            logger.info("pipeline_input_guardrail_start")
            guard_res = await self.input_guardrail.validate(user_query)
            logger.info("pipeline_input_guardrail_complete", is_safe=guard_res.is_safe)
            
            if not guard_res.is_safe:
                latency = (time.perf_counter() - start_time) * 1000.0
                return GenerationResult(
                    answer="This query violates safety policies and cannot be processed.",
                    sources=[],
                    token_usage=TokenUsage(),
                    latency_ms=latency,
                    trace_id=trace_id,
                    metadata={
                        "input_guardrail_blocked": True,
                        "violation_category": guard_res.violation_category,
                        "explanation": guard_res.explanation,
                    },
                )

        # 2. Retrieval
        logger.info("pipeline_retrieve_start")
        q_ctx = QueryContext(
            original_query=user_query,
            filters=metadata.get("filters", {}) if metadata else {},
            top_k=self.config.retrieval.top_k,
            similarity_threshold=self.config.retrieval.similarity_threshold,
            trace_id=trace_id,
            metadata=metadata or {},
        )
        retrieved_results = await self.retriever.retrieve(q_ctx)
        logger.info("pipeline_retrieve_complete", num_results=len(retrieved_results))

        # 3. Rerank
        reranked_results = retrieved_results
        if self.reranker and retrieved_results:
            logger.info("pipeline_rerank_start")
            reranked_results = await self.reranker.rerank(
                query=user_query,
                results=retrieved_results,
                top_n=self.config.generation.max_context_chunks,
            )
            logger.info("pipeline_rerank_complete", num_results=len(reranked_results))
        else:
            reranked_results = retrieved_results[:self.config.generation.max_context_chunks]

        # 4. Generate Answer
        logger.info("pipeline_generate_start")
        context_parts = []
        images = []
        for i, res in enumerate(reranked_results):
            custom = res.chunk.metadata.custom if (hasattr(res.chunk.metadata, "custom") and res.chunk.metadata.custom) else {}
            raw_text = custom.get("raw_text", res.chunk.content)
            part_str = f"Document {i+1}:\n{raw_text}"
            
            tables_html = custom.get("tables_html", [])
            if tables_html:
                part_str += "\nTABLES:\n" + "\n".join(tables_html)
                
            context_parts.append(part_str)
            
            images_base64 = custom.get("images_base64", [])
            images.extend(images_base64)
            
        context_str = "\n\n".join(context_parts)

        prompt = self.config.generation.prompt_template.format(
            context=context_str,
            query=user_query,
        )

        answer = await self.llm.generate(
            prompt,
            system_prompt=self.config.generation.system_prompt,
            images=images if images else None,
        )
        logger.info("pipeline_generate_complete")

        # 5. Output Guardrail
        if self.output_guardrail:
            logger.info("pipeline_output_guardrail_start")
            guard_res = await self.output_guardrail.validate(answer, context=user_query)
            logger.info("pipeline_output_guardrail_complete", is_safe=guard_res.is_safe)
            
            if not guard_res.is_safe:
                latency = (time.perf_counter() - start_time) * 1000.0
                return GenerationResult(
                    answer="Generated response violated safety policies and was blocked.",
                    sources=[],
                    token_usage=TokenUsage(),
                    latency_ms=latency,
                    trace_id=trace_id,
                    metadata={
                        "output_guardrail_blocked": True,
                        "violation_category": guard_res.violation_category,
                        "explanation": guard_res.explanation,
                    },
                )

        # 6. Automated Evaluation
        eval_res_dict = {}
        if self.evaluator:
            logger.info("pipeline_eval_start")
            contexts_list = [res.chunk.content for res in reranked_results]
            try:
                eval_res = await self.evaluator.evaluate(
                    query=user_query,
                    answer=answer,
                    contexts=contexts_list,
                    ground_truth=ground_truth,
                )
                eval_res_dict = {
                    "metrics": eval_res.metrics,
                    "details": eval_res.details,
                }
                logger.info("pipeline_eval_complete", metrics=eval_res.metrics)
            except Exception as exc:
                logger.error("pipeline_eval_failed", error=str(exc))
                eval_res_dict = {"error": str(exc)}

        latency = (time.perf_counter() - start_time) * 1000.0

        res_metadata = {
            "num_sources_retrieved": len(retrieved_results),
            "num_sources_used": len(reranked_results),
        }
        if eval_res_dict:
            res_metadata["evaluation"] = eval_res_dict

        return GenerationResult(
            answer=answer,
            sources=reranked_results if self.config.generation.include_sources else [],
            token_usage=TokenUsage(model=self.config.llm.config.get("model", "")),
            latency_ms=latency,
            trace_id=trace_id,
            metadata=res_metadata,
        )

    async def query_stream(
        self,
        user_query: str,
        metadata: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Stream generated response tokens.

        Bypasses output guardrails and metrics evaluations for live interactive speed.
        Runs input guardrail validation first if configured.
        """
        await self.initialize()
        trace_id = str(uuid.uuid4())

        if self.input_guardrail:
            guard_res = await self.input_guardrail.validate(user_query)
            if not guard_res.is_safe:
                yield "This query violates safety policies and cannot be processed."
                return

        # Retrieve & Rerank
        q_ctx = QueryContext(
            original_query=user_query,
            filters=metadata.get("filters", {}) if metadata else {},
            top_k=self.config.retrieval.top_k,
            similarity_threshold=self.config.retrieval.similarity_threshold,
            trace_id=trace_id,
            metadata=metadata or {},
        )
        retrieved_results = await self.retriever.retrieve(q_ctx)
        
        if self.reranker and retrieved_results:
            reranked_results = await self.reranker.rerank(
                query=user_query,
                results=retrieved_results,
                top_n=self.config.generation.max_context_chunks,
            )
        else:
            reranked_results = retrieved_results[:self.config.generation.max_context_chunks]

        context_parts = []
        images = []
        for i, res in enumerate(reranked_results):
            custom = res.chunk.metadata.custom if (hasattr(res.chunk.metadata, "custom") and res.chunk.metadata.custom) else {}
            raw_text = custom.get("raw_text", res.chunk.content)
            part_str = f"Document {i+1}:\n{raw_text}"
            
            tables_html = custom.get("tables_html", [])
            if tables_html:
                part_str += "\nTABLES:\n" + "\n".join(tables_html)
                
            context_parts.append(part_str)
            
            images_base64 = custom.get("images_base64", [])
            images.extend(images_base64)
            
        context_str = "\n\n".join(context_parts)

        prompt = self.config.generation.prompt_template.format(
            context=context_str,
            query=user_query,
        )

        async for token in self.llm.generate_stream(
            prompt,
            system_prompt=self.config.generation.system_prompt,
            images=images if images else None,
        ):
            yield token

    async def close(self) -> None:
        """Gracefully release open HTTP/gRPC channels and database connection pools."""
        logger.info("pipeline_close_start")
        close_tasks = []

        components = [
            self.parser,
            self.embedding_model,
            self.vector_store,
            self.llm,
            self.reranker,
            self.input_guardrail,
            self.output_guardrail,
            self.evaluator,
        ]

        for component in components:
            if component and hasattr(component, "close"):
                # Call close if it is a coroutine function
                if asyncio.iscoroutinefunction(component.close):
                    close_tasks.append(component.close())
                else:
                    try:
                        component.close()
                    except Exception as exc:
                        logger.error("component_close_failed", error=str(exc))

        if close_tasks:
            await asyncio.gather(*close_tasks, return_exceptions=True)

        logger.info("pipeline_close_complete")

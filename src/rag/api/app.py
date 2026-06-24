import os
import shutil
import uuid
import asyncio
from pathlib import Path
from typing import Any, Optional, Dict, List
import yaml

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from sse_starlette.sse import EventSourceResponse

# Import core RAG components
from rag.config.loader import load_config, load_config_from_dict
from rag.pipeline.orchestrator import RAGPipelineOrchestrator
from rag.core.registry import ComponentRegistry
from rag.core.interfaces import (
    BaseParser, BaseChunker, BaseEmbeddingModel,
    BaseLLM, BaseVectorStore, BaseRetriever
)

# Global orchestrator and initialization status
orchestrator: Optional[RAGPipelineOrchestrator] = None
init_error: Optional[str] = None
use_mock_mode: bool = False


# ── Mock Sandbox Implementations for Fallback/Demo ───────────────────

class SandboxParser(BaseParser):
    def __init__(self, **kwargs):
        pass

    async def parse(self, source, metadata=None):
        from rag.core.types import Document, DocumentMetadata
        name = (metadata or {}).get("filename") or getattr(source, "filename", str(source))
        if isinstance(source, bytes):
            name = "uploaded_document"
        return [Document(content=f"Extracted content from {name}. This is mock information stored to test the RAG flow.", metadata=DocumentMetadata(source=name, file_name=name))]
    async def parse_batch(self, sources, metadata=None):
        return []

class SandboxChunker(BaseChunker):
    def __init__(self, **kwargs):
        pass

    async def chunk(self, document):
        from rag.core.types import Chunk
        # Split mock document into 3 sentences
        sentences = [s.strip() for s in document.content.split(".") if s.strip()]
        chunks = []
        for i, sent in enumerate(sentences):
            chunks.append(Chunk(content=sent + ".", document_id=document.id, chunk_index=i))
        return chunks if chunks else [Chunk(content=document.content, document_id=document.id, chunk_index=0)]
    async def chunk_batch(self, documents):
        chunks = []
        for doc in documents:
            chunks.extend(await self.chunk(doc))
        return chunks

class SandboxEmbedder(BaseEmbeddingModel):
    def __init__(self, **kwargs):
        pass

    async def embed(self, texts):
        return [[0.1] * self.dimensions for _ in texts]
    async def embed_query(self, query):
        return [0.1] * self.dimensions
    @property
    def dimensions(self):
        return 1536

class SandboxDB(BaseVectorStore):
    def __init__(self, **kwargs):
        self.storage = []
    async def initialize(self): pass
    async def upsert(self, chunks):
        self.storage.extend(chunks)
        return [c.id for c in chunks]
    async def search(self, query_embedding, top_k=10, filters=None):
        from rag.core.types import RetrievalResult
        # Simple string-match simulation
        results = [RetrievalResult(chunk=c, score=0.95) for c in self.storage]
        return results[:top_k]
    async def hybrid_search(self, q_emb, s_vec, top_k=10, alpha=0.5, filters=None):
        return []
    async def delete(self, ids): pass
    async def count(self): return len(self.storage)
    async def close(self): pass

class SandboxRetriever(BaseRetriever):
    def __init__(self, vector_store, embedding_model, **kwargs):
        self.db = vector_store
        self.embedder = embedding_model
    async def retrieve(self, context):
        q_emb = await self.embedder.embed_query(context.original_query)
        return await self.db.search(q_emb, top_k=context.top_k)

class SandboxLLM(BaseLLM):
    def __init__(self, **kwargs):
        pass

    async def generate(self, prompt, **kwargs):
        # Simulate answering queries
        query_text = prompt.split("Question:")[-1].split("Answer:")[0].strip() if "Question:" in prompt else "Query"
        return f"This is a mock RAG response generated for query: '{query_text}'.\n\nThe mock parser extracted relevant chunks from your document and stored them in a sandbox database. Then, the sandbox LLM generated this response based on that retrieved context."
    
    async def generate_stream(self, prompt, **kwargs):
        text = await self.generate(prompt, **kwargs)
        # Yield in small chunks
        words = text.split(" ")
        for i, word in enumerate(words):
            yield (word + " ")
            await asyncio.sleep(0.08)

    async def generate_structured(self, prompt, output_schema, **kwargs):
        return output_schema()

# ── Orchestrator Initializer ──────────────────────────────────────────

def register_mock_components():
    """Register mock components under the standard provider names to bypass external API requirements."""
    ComponentRegistry.discover()
    ComponentRegistry.register("parser", "unstructured")(SandboxParser)
    ComponentRegistry.register("chunker", "semantic")(SandboxChunker)
    ComponentRegistry.register("embedding_model", "openai")(SandboxEmbedder)
    ComponentRegistry.register("vector_store", "qdrant")(SandboxDB)
    ComponentRegistry.register("retriever", "simple")(SandboxRetriever)
    ComponentRegistry.register("llm", "openai")(SandboxLLM)

def init_orchestrator(force_mock: bool = False):
    global orchestrator, init_error, use_mock_mode
    use_mock_mode = force_mock
    
    # Check if config.yaml specifies fully local setup (which doesn't require OpenAI keys)
    is_local_only = False
    try:
        config_path = Path("config.yaml")
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as f:
                raw_data = yaml.safe_load(f)
            if isinstance(raw_data, dict):
                emb_prov = raw_data.get("embeddings", {}).get("provider")
                llm_prov = raw_data.get("llm", {}).get("provider")
                if emb_prov == "local" and llm_prov == "local":
                    is_local_only = True
    except Exception:
        pass

    # If no OpenAI Key is available and we haven't forced mock, check if we should default to mock
    if not force_mock and not os.environ.get("OPENAI_API_KEY") and not is_local_only:
        print("OPENAI_API_KEY environment variable not found. Defaulting to Mock Sandbox Mode.")
        use_mock_mode = True

    try:
        if use_mock_mode:
            print("Initializing API in Mock Sandbox Mode...")
            register_mock_components()
            
            # Create a simple mock configuration
            mock_config = {
                "project": {"name": "mock-sandbox-pipeline", "environment": "development"},
                "ingestion": {
                    "parser": {"provider": "unstructured"},
                    "chunker": {"provider": "semantic"},
                    "batch_size": 10
                },
                "embeddings": {"provider": "openai"},
                "llm": {"provider": "openai"},
                "vector_store": {"provider": "qdrant", "config": {}},
                "retrieval": {"strategy": "simple", "top_k": 3}
            }
            config = load_config_from_dict(mock_config)
        else:
            print("Initializing API in Standard RAG Mode...")
            config = load_config("config.yaml")

        # Initialize Orchestrator
        orchestrator = RAGPipelineOrchestrator(config)
        init_error = None
        print("RAG Orchestrator successfully initialized.")
    except Exception as e:
        orchestrator = None
        init_error = str(e)
        print(f"Error initializing RAG Orchestrator: {init_error}")

# ── Lifespan Context Manager ──────────────────────────────────────────
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app_inst: FastAPI):
    init_orchestrator()
    yield
    global orchestrator
    if orchestrator:
        await orchestrator.close()
        orchestrator = None

# Set up FastAPI application
app = FastAPI(
    title="Advanced RAG Engine API",
    description="FastAPI backend for modular, configuration-driven RAG execution loop",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API Models ────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str
    ground_truth: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    attachments: Optional[List[Dict[str, Any]]] = None

class ConfigUpdateRequest(BaseModel):
    yaml_content: str

# ── API Endpoints ─────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    global orchestrator, init_error, use_mock_mode
    
    status_data = {
        "status": "active" if orchestrator is not None else "failed",
        "mock_mode": use_mock_mode,
        "error": init_error,
    }
    
    if orchestrator:
        status_data.update({
            "project_name": orchestrator.config.project.name,
            "environment": orchestrator.config.project.environment,
            "parser_provider": orchestrator.config.ingestion.parser.provider,
            "chunker_provider": orchestrator.config.ingestion.chunker.provider,
            "llm_provider": orchestrator.config.llm.provider,
            "vector_store_provider": orchestrator.config.vector_store.provider,
            "collection_name": orchestrator.config.vector_store.config.get("collection_name", "documents")
        })
        try:
            # Get document count in Vector Store
            await orchestrator.initialize()
            status_data["chunk_count"] = await orchestrator.vector_store.count()
        except Exception:
            status_data["chunk_count"] = 0
            
    return status_data

@app.post("/api/toggle-mode")
async def toggle_mode(mock: bool):
    """Dynamically toggle between Mock Sandbox and Standard configuration modes."""
    init_orchestrator(force_mock=mock)
    return {
        "status": "success",
        "mock_mode": use_mock_mode,
        "error": init_error
    }

@app.get("/api/config")
async def get_config():
    """Retrieve raw config.yaml contents and current resolved configuration."""
    config_path = Path("config.yaml")
    raw_yaml = ""
    if config_path.exists():
        raw_yaml = config_path.read_text(encoding="utf-8")
        
    resolved_config = None
    if orchestrator:
        resolved_config = orchestrator.config.model_dump()
        
    return {
        "raw_yaml": raw_yaml,
        "resolved_config": resolved_config
    }

@app.post("/api/config")
async def update_config(req: ConfigUpdateRequest):
    """Validate and write new yaml configuration, then rebuild orchestrator."""
    global orchestrator, init_error
    
    try:
        # 1. Parse and validate YAML
        raw_data = yaml.safe_load(req.yaml_content)
        if not isinstance(raw_data, dict):
            raise HTTPException(status_code=400, detail="Config must be a key-value dictionary.")
        
        # Validate using Pydantic Loader
        validated_config = load_config_from_dict(raw_data)
        
        # 2. Write to config.yaml file
        config_path = Path("config.yaml")
        config_path.write_text(req.yaml_content, encoding="utf-8")
        
        # 3. Reload orchestrator
        if orchestrator:
            await orchestrator.close()
            
        orchestrator = RAGPipelineOrchestrator(validated_config)
        init_error = None
        
        return {
            "status": "success",
            "message": "Configuration updated and pipeline reloaded successfully."
        }
    except ValidationError as ve:
        raise HTTPException(
            status_code=422,
            detail={"message": "Pydantic validation failed for configuration", "errors": ve.errors()}
        )
    except yaml.YAMLError as ye:
        raise HTTPException(status_code=400, detail=f"Invalid YAML syntax: {str(ye)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reload pipeline: {str(e)}")

@app.post("/api/config/json")
async def update_config_json(req: Dict[str, Any]):
    """Validate and write new JSON configuration as YAML, then rebuild orchestrator."""
    global orchestrator, init_error
    
    try:
        # Validate using Pydantic Loader
        validated_config = load_config_from_dict(req)
        
        # Write to config.yaml file as YAML
        config_path = Path("config.yaml")
        yaml_content = yaml.dump(req, default_flow_style=False)
        config_path.write_text(yaml_content, encoding="utf-8")
        
        # Reload orchestrator
        if orchestrator:
            await orchestrator.close()
            
        orchestrator = RAGPipelineOrchestrator(validated_config)
        init_error = None
        
        return {
            "status": "success",
            "message": "Configuration updated and pipeline reloaded successfully."
        }
    except ValidationError as ve:
        raise HTTPException(
            status_code=422,
            detail={"message": "Pydantic validation failed for configuration", "errors": ve.errors()}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reload pipeline: {str(e)}")

@app.post("/api/config/parse")
async def parse_config_yaml(req: ConfigUpdateRequest):
    """Validate and return JSON representation of raw yaml without saving it."""
    try:
        raw_data = yaml.safe_load(req.yaml_content)
        if not isinstance(raw_data, dict):
            raise HTTPException(status_code=400, detail="Config must be a key-value dictionary.")
        # Validate using Pydantic Loader
        validated_config = load_config_from_dict(raw_data)
        return {
            "status": "success",
            "resolved_config": validated_config.model_dump()
        }
    except ValidationError as ve:
        raise HTTPException(
            status_code=422,
            detail={"message": "Pydantic validation failed for configuration", "errors": ve.errors()}
        )
    except yaml.YAMLError as ye:
        raise HTTPException(status_code=400, detail=f"Invalid YAML syntax: {str(ye)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse yaml: {str(e)}")

@app.get("/api/chunks")
async def get_all_chunks(limit: int = 10000):
    global orchestrator, use_mock_mode
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Orchestrator not initialized. Error: {init_error}"
        )
    
    try:
        await orchestrator.initialize()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize pipeline: {str(e)}"
        )
    
    if use_mock_mode:
        db = orchestrator.vector_store
        storage = getattr(db, "storage", [])
        chunks_list = []
        for c in storage[:limit]:
            meta_dict = {}
            if c.metadata:
                if hasattr(c.metadata, "model_dump"):
                    meta_dict = c.metadata.model_dump()
                elif isinstance(c.metadata, dict):
                    meta_dict = c.metadata

            custom = meta_dict.get("custom", {}) or {}
            if not isinstance(custom, dict):
                custom = {}

            chunks_list.append({
                "id": c.id,
                "content": c.content,
                "document_id": c.document_id,
                "chunk_index": c.chunk_index,
                "metadata": {
                    "source": meta_dict.get("source", ""),
                    "file_name": meta_dict.get("file_name", "") or meta_dict.get("source", ""),
                    "file_type": meta_dict.get("file_type", ""),
                    "language": meta_dict.get("language", "en"),
                    "page_number": meta_dict.get("page_number"),
                    "total_pages": meta_dict.get("total_pages"),
                    **{k: v for k, v in meta_dict.items() if k not in ["source", "file_name", "file_type", "language", "page_number", "total_pages", "custom"]},
                    **custom
                },
                "token_count": c.token_count
            })
        return {
            "status": "success",
            "chunks": chunks_list
        }
    
    try:
        db = orchestrator.vector_store
        client = db._get_client()
        collection_name = db._collection_name
        
        chunks_list = []
        offset = None
        has_more = True
        
        while has_more:
            # Fetch in batches of up to 1000 to keep it efficient
            scroll_limit = min(limit - len(chunks_list), 1000) if limit else 1000
            if scroll_limit <= 0:
                break
                
            records, offset = await client.scroll(
                collection_name=collection_name,
                limit=scroll_limit,
                offset=offset,
                with_payload=True,
                with_vectors=False
            )
            
            for record in records:
                payload = record.payload or {}
                meta_dict = {
                    "source": payload.get("source", payload.get("file_name", "")),
                    "file_name": payload.get("filename") or payload.get("file_name", ""),
                    "file_type": payload.get("file_type", ""),
                    "language": payload.get("language", "en"),
                    "page_number": payload.get("page_number"),
                    "total_pages": payload.get("total_pages"),
                }
                
                # Unpack everything else except the core chunk fields
                core_keys = {"content", "document_id", "chunk_index", "source", "file_name", "filename", "file_type", "language", "page_number", "total_pages", "parent_id", "token_count"}
                for k, v in payload.items():
                    if k not in core_keys:
                        meta_dict[k] = v

                chunks_list.append({
                    "id": str(record.id),
                    "content": payload.get("content", ""),
                    "document_id": payload.get("document_id", ""),
                    "chunk_index": payload.get("chunk_index", 0),
                    "metadata": meta_dict,
                    "token_count": payload.get("token_count", 0)
                })
                
            if not offset or len(records) < scroll_limit or (limit and len(chunks_list) >= limit):
                has_more = False
                
        return {
            "status": "success",
            "chunks": chunks_list
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to scroll chunks: {str(e)}"
        )

@app.post("/api/query")
async def query_pipeline(req: QueryRequest):
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Orchestrator not initialized. Error: {init_error}"
        )
        
    try:
        result = await orchestrator.query(
            user_query=req.query,
            ground_truth=req.ground_truth,
            metadata=req.metadata,
            attachments=req.attachments
        )
        
        # Format sources list
        sources_list = []
        if result.sources:
            for r in result.sources:
                sources_list.append({
                    "content": r.chunk.content,
                    "score": r.score,
                    "metadata": r.chunk.metadata.model_dump() if hasattr(r.chunk.metadata, "model_dump") else r.chunk.metadata
                })
                
        return {
            "answer": result.answer,
            "latency_ms": result.latency_ms,
            "trace_id": result.trace_id,
            "metadata": result.metadata,
            "sources": sources_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/retrieve")
async def retrieve_pipeline(req: QueryRequest):
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Orchestrator not initialized. Error: {init_error}"
        )
        
    try:
        await orchestrator.initialize()
        trace_id = str(uuid.uuid4())
        
        from rag.core.types import QueryContext
        q_ctx = QueryContext(
            original_query=req.query,
            filters=req.metadata.get("filters", {}) if req.metadata else {},
            top_k=orchestrator.config.retrieval.top_k,
            similarity_threshold=orchestrator.config.retrieval.similarity_threshold,
            trace_id=trace_id,
            metadata=req.metadata or {},
        )
        
        retrieved_results = await orchestrator.retriever.retrieve(q_ctx)
        
        if hasattr(orchestrator, "reranker") and orchestrator.reranker and retrieved_results:
            retrieved_results = await orchestrator.reranker.rerank(q_ctx, retrieved_results)
            
        chunks_list = []
        for r in retrieved_results:
            chunks_list.append({
                "content": r.chunk.content,
                "score": r.score,
                "metadata": r.chunk.metadata.model_dump() if hasattr(r.chunk.metadata, "model_dump") else r.chunk.metadata
            })
            
        return {
            "status": "success",
            "chunks": chunks_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/query/stream")
async def query_stream_pipeline(req: QueryRequest):
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Orchestrator not initialized. Error: {init_error}"
        )
        
    async def token_generator():
        try:
            async for token in orchestrator.query_stream(req.query, req.metadata, req.attachments):
                yield {"data": token}
        except asyncio.CancelledError:
            print("Streaming request cancelled by client.")
        except Exception as e:
            yield {"data": f"\n\n[ERROR: {str(e)}]"}
            
    return EventSourceResponse(token_generator())

@app.get("/api/ingest/status")
async def get_ingestion_status():
    global orchestrator
    if not orchestrator:
        return {}
    return orchestrator.ingestion_status

@app.post("/api/ingest")
async def ingest_files(
    files: List[UploadFile] = File(...),
    metadata_json: Optional[str] = Form(None)
):
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Orchestrator not initialized. Error: {init_error}"
        )
        
    import json
    metadata = {}
    if metadata_json:
        try:
            metadata = json.loads(metadata_json)
        except Exception:
            pass

    # Initialize ingestion status at the class level
    orchestrator.start_ingestion([file.filename for file in files])

    # Create temporary directory inside workspace
    temp_dir = Path("data/temp_uploads")
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    total_chunk_ids = []
    ingested_files_log = []
    
    try:
        for file in files:
            current_filename = file.filename
            try:
                # Generate unique temp filename to prevent conflict
                file_extension = Path(current_filename).suffix
                temp_file_name = f"{uuid.uuid4()}{file_extension}"
                temp_file_path = temp_dir / temp_file_name
                
                # Save file to temp path
                with open(temp_file_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
                    
                # Run ingestion metadata
                file_metadata = {**metadata, "filename": current_filename}
                
                # Call orchestrator ingest directly - status logic is now inside orchestrator!
                chunk_ids = await orchestrator.ingest_source(
                    source=str(temp_file_path),
                    metadata=file_metadata
                )
                total_chunk_ids.extend(chunk_ids)
                ingested_files_log.append({
                    "filename": current_filename,
                    "chunks_count": len(chunk_ids)
                })
                
                # Delete temporary file
                if temp_file_path.exists():
                    temp_file_path.unlink()
            except Exception as file_error:
                orchestrator.set_ingestion_failed(current_filename, str(file_error))
                raise file_error
                
        return {
            "status": "success",
            "message": f"Successfully ingested {len(files)} files.",
            "files": ingested_files_log,
            "total_chunks_ingested": len(total_chunk_ids),
            "chunk_ids": total_chunk_ids
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup any remaining files in temp uploads
        if temp_dir.exists():
            for f in temp_dir.glob("*"):
                try:
                    f.unlink()
                except Exception:
                    pass

@app.delete("/api/documents/{filename}")
async def delete_document(filename: str):
    global orchestrator, use_mock_mode
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Orchestrator not initialized."
        )

    if use_mock_mode:
        db = orchestrator.vector_store
        storage = getattr(db, "storage", [])
        new_storage = []
        deleted_count = 0
        for c in storage:
            c_source = getattr(c.metadata, "source", "")
            c_file_name = getattr(c.metadata, "file_name", "")
            c_custom = getattr(c.metadata, "custom", {}) or {}
            c_filename = c_custom.get("filename", "")
            
            if filename in [c_source, c_file_name, c_filename]:
                deleted_count += 1
                continue
            new_storage.append(c)
        db.storage = new_storage
        return {
            "status": "success",
            "message": f"Successfully deleted mock document '{filename}' ({deleted_count} chunks removed)."
        }

    try:
        db = orchestrator.vector_store
        client = db._get_client()
        collection_name = db._collection_name
        
        from qdrant_client.models import FilterSelector, Filter, FieldCondition, MatchValue
        
        for key in ["filename", "file_name"]:
            await client.delete(
                collection_name=collection_name,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[
                            FieldCondition(
                                key=key,
                                match=MatchValue(value=filename)
                            )
                        ]
                    )
                )
            )
            
        return {
            "status": "success",
            "message": f"Successfully deleted document '{filename}' from vector store."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@app.post("/api/parse-attachment")
async def parse_attachment(file: UploadFile = File(...)):
    global orchestrator, use_mock_mode
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Orchestrator not initialized."
        )
    
    # Create temp attachments directory inside workspace
    temp_dir = Path("data/temp_attachments")
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate safe temp filename
    file_extension = Path(file.filename).suffix
    temp_file_name = f"{uuid.uuid4()}{file_extension}"
    temp_file_path = temp_dir / temp_file_name
    
    try:
        # Save file to disk
        with open(temp_file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        is_image = (
            (file.content_type and file.content_type.startswith("image/")) or
            file_extension.lower() in [".png", ".jpg", ".jpeg", ".webp", ".gif"]
        )
        
        extracted_text = ""
        images_base64 = []
        
        if is_image:
            # For images, read raw bytes and encode to base64
            import base64
            with open(temp_file_path, "rb") as img_f:
                base64_str = base64.b64encode(img_f.read()).decode("utf-8")
            # Run layout parse on image to extract text if layout parser supports OCR
            try:
                documents = await orchestrator.parser.parse(str(temp_file_path), {"filename": file.filename})
                extracted_text = "\n\n".join([doc.content for doc in documents])
            except Exception:
                extracted_text = f"[Image Attached: {file.filename}]"
        else:
            base64_str = None
            # For non-images, run document parser
            documents = await orchestrator.parser.parse(str(temp_file_path), {"filename": file.filename})
            extracted_text = "\n\n".join([doc.content for doc in documents])
            
            # Extract any embedded images
            for doc in documents:
                custom = doc.metadata.custom if (doc.metadata and hasattr(doc.metadata, "custom")) else {}
                if isinstance(custom, dict):
                    img_b64 = custom.get("image_base64")
                    if img_b64:
                        images_base64.append(img_b64)
                    imgs = custom.get("images_base64", [])
                    if isinstance(imgs, list):
                        images_base64.extend(imgs)
        
        return {
            "filename": file.filename,
            "content": extracted_text,
            "file_type": "image" if is_image else file.content_type or "application/octet-stream",
            "base64": base64_str,
            "extracted_images": list(set(images_base64))
        }
        
    except Exception as e:
        # Fallback to plain text read if parsing fails
        try:
            if temp_file_path.exists():
                with open(temp_file_path, "r", encoding="utf-8", errors="ignore") as fallback_f:
                    text_content = fallback_f.read()
                return {
                    "filename": file.filename,
                    "content": text_content,
                    "file_type": "text/plain",
                    "base64": None,
                    "extracted_images": []
                }
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to parse attachment: {str(e)}")
        
    finally:
        # Clean up temp file
        if temp_file_path.exists():
            try:
                temp_file_path.unlink()
            except Exception:
                pass

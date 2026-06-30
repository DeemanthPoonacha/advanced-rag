import os
import shutil
import uuid
import asyncio
from pathlib import Path
from typing import Any, Optional, Dict, List, Literal
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
background_summarizer_task: Optional[asyncio.Task] = None
summarizer_trigger_event = asyncio.Event()

async def run_background_summarizer():
    """Background task loop that processes missing summaries and goes to sleep when done.
    
    Uses the (updated_count, remaining_count) tuple returned by
    update_missing_summaries() to avoid a redundant full-scan of the vector store.
    """
    await asyncio.sleep(5)  # Wait for startup and other initializations to stabilize
    
    # Run once on startup to resolve any historical missing summaries
    trigger_startup = True
    
    while True:
        try:
            if not trigger_startup:
                # Wait until triggered by a new upload or other updates
                await summarizer_trigger_event.wait()
                summarizer_trigger_event.clear()
            
            trigger_startup = False
            
            if orchestrator:
                num_updated, remaining = await orchestrator.update_missing_summaries()
                if num_updated > 0:
                    print(f"Background Summarizer: Successfully updated {num_updated} chunk summaries.")
                
                if remaining > 0:
                    # Some are still missing (probably LLM is offline). Sleep and retry.
                    await asyncio.sleep(15)
                    trigger_startup = True
                    
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in background summarizer task: {e}")
            await asyncio.sleep(15)
            trigger_startup = True

def init_orchestrator():
    global orchestrator, init_error
    try:
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
    global background_summarizer_task
    background_summarizer_task = asyncio.create_task(run_background_summarizer())
    yield
    if background_summarizer_task:
        background_summarizer_task.cancel()
        try:
            await background_summarizer_task
        except asyncio.CancelledError:
            pass
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

class ChatMessage(BaseModel):
    sender: Literal["user", "assistant"]
    text: str

class QueryRequest(BaseModel):
    query: str
    chat_history: Optional[List[ChatMessage]] = None
    ground_truth: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    attachments: Optional[List[Dict[str, Any]]] = None

class ConfigUpdateRequest(BaseModel):
    yaml_content: str

# ── API Endpoints ─────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    global orchestrator, init_error
    
    status_data = {
        "status": "active" if orchestrator is not None else "failed",
        "mock_mode": False,
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
        
        # Trigger background summarization check in case LLM configurations were updated
        summarizer_trigger_event.set()
        
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
        
        # Trigger background summarization check in case LLM configurations were updated
        summarizer_trigger_event.set()
        
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

# ── Preset Configuration Management ───────────────────────────────────

PRESETS_DIR = Path("presets")
PREDEFINED_PRESETS = {
    "local_sandbox": {
        "name": "local_sandbox",
        "label": "Lightweight Local Sandbox",
        "description": "Local CPU-based models (MiniLM) and local LLM configurations for prototyping.",
        "is_predefined": True
    },
    "enterprise_accuracy": {
        "name": "enterprise_accuracy",
        "label": "High-Accuracy Enterprise",
        "description": "Hierarchical chunking, hybrid search, Cohere reranking, safety guardrails, and quality evaluations.",
        "is_predefined": True
    },
    "multimodal_layout": {
        "name": "multimodal_layout",
        "label": "Multi-Modal Layout RAG",
        "description": "Extracts text, tables, and images with vision-supported models for rich document parsing.",
        "is_predefined": True
    },
    "strict_security": {
        "name": "strict_security",
        "label": "Strict Security & Safety",
        "description": "Strict content moderation checks with Llama Guard and safety-vetted prompts.",
        "is_predefined": True
    }
}

def check_active_preset():
    config_path = Path("config.yaml")
    if not config_path.exists():
        return None
    try:
        config_data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
        if not isinstance(config_data, dict):
            return None
            
        for name in PREDEFINED_PRESETS:
            preset_path = PRESETS_DIR / f"{name}.yaml"
            if preset_path.exists():
                preset_data = yaml.safe_load(preset_path.read_text(encoding="utf-8"))
                if preset_data == config_data:
                    return name
                    
        # Check custom presets
        for file in PRESETS_DIR.glob("*.yaml"):
            preset_name = file.stem
            if preset_name in PREDEFINED_PRESETS:
                continue
            preset_data = yaml.safe_load(file.read_text(encoding="utf-8"))
            if preset_data == config_data:
                return preset_name
    except Exception:
        pass
    return None

@app.get("/api/presets")
async def list_presets():
    """List predefined and custom presets."""
    PRESETS_DIR.mkdir(parents=True, exist_ok=True)
    presets_list = []
    
    # 1. Add predefined presets
    for key, val in PREDEFINED_PRESETS.items():
        presets_list.append(val)
        
    # 2. Add custom presets
    for file in PRESETS_DIR.glob("*.yaml"):
        name = file.stem
        if name in PREDEFINED_PRESETS:
            continue
        presets_list.append({
            "name": name,
            "label": name.replace("_", " ").title(),
            "description": "User-defined custom settings configuration.",
            "is_predefined": False
        })
        
    active = check_active_preset()
    return {
        "status": "success",
        "presets": presets_list,
        "active_preset": active
    }

@app.get("/api/presets/{name}")
async def get_preset(name: str):
    """Retrieve specific preset details."""
    preset_path = PRESETS_DIR / f"{name}.yaml"
    if not preset_path.exists():
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found.")
        
    try:
        raw_yaml = preset_path.read_text(encoding="utf-8")
        parsed_config = yaml.safe_load(raw_yaml)
        return {
            "name": name,
            "raw_yaml": raw_yaml,
            "parsed_config": parsed_config
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read preset: {str(e)}")

@app.post("/api/presets/{name}")
async def save_preset(name: str, req: ConfigUpdateRequest):
    """Create or update a custom preset."""
    if name in PREDEFINED_PRESETS:
        raise HTTPException(status_code=400, detail="Cannot modify predefined presets.")
        
    try:
        # Validate YAML content
        raw_data = yaml.safe_load(req.yaml_content)
        if not isinstance(raw_data, dict):
            raise HTTPException(status_code=400, detail="Preset configuration must be a dictionary.")
        # Dry-run validation through loader
        load_config_from_dict(raw_data)
        
        PRESETS_DIR.mkdir(parents=True, exist_ok=True)
        preset_path = PRESETS_DIR / f"{name}.yaml"
        preset_path.write_text(req.yaml_content, encoding="utf-8")
        
        return {
            "status": "success",
            "message": f"Preset '{name}' saved successfully."
        }
    except ValidationError as ve:
        raise HTTPException(
            status_code=422,
            detail={"message": "Pydantic validation failed", "errors": ve.errors()}
        )
    except yaml.YAMLError as ye:
        raise HTTPException(status_code=400, detail=f"Invalid YAML syntax: {str(ye)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save preset: {str(e)}")

@app.post("/api/presets/{name}/json")
async def save_preset_json(name: str, req: Dict[str, Any]):
    """Create or update a custom preset from JSON representation."""
    if name in PREDEFINED_PRESETS:
        raise HTTPException(status_code=400, detail="Cannot modify predefined presets.")
        
    try:
        # Validate configuration using loader
        load_config_from_dict(req)
        
        PRESETS_DIR.mkdir(parents=True, exist_ok=True)
        preset_path = PRESETS_DIR / f"{name}.yaml"
        yaml_content = yaml.dump(req, default_flow_style=False)
        preset_path.write_text(yaml_content, encoding="utf-8")
        
        return {
            "status": "success",
            "message": f"Preset '{name}' saved successfully from JSON."
        }
    except ValidationError as ve:
        raise HTTPException(
            status_code=422,
            detail={"message": "Pydantic validation failed", "errors": ve.errors()}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save preset: {str(e)}")

@app.post("/api/presets/{name}/activate")
async def activate_preset(name: str):
    """Activate preset: overwrite config.yaml and reload orchestrator."""
    preset_path = PRESETS_DIR / f"{name}.yaml"
    if not preset_path.exists():
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found.")
        
    global orchestrator, init_error
    try:
        raw_yaml = preset_path.read_text(encoding="utf-8")
        raw_data = yaml.safe_load(raw_yaml)
        validated_config = load_config_from_dict(raw_data)
        
        # Write to config.yaml
        config_path = Path("config.yaml")
        config_path.write_text(raw_yaml, encoding="utf-8")
        
        # Reload orchestrator
        if orchestrator:
            await orchestrator.close()
            
        orchestrator = RAGPipelineOrchestrator(validated_config)
        init_error = None
        
        return {
            "status": "success",
            "message": f"Preset '{name}' activated and pipeline reloaded successfully."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to activate preset: {str(e)}")

@app.delete("/api/presets/{name}")
async def delete_preset(name: str):
    """Delete a custom preset."""
    if name in PREDEFINED_PRESETS:
        raise HTTPException(status_code=400, detail="Cannot delete predefined presets.")
        
    preset_path = PRESETS_DIR / f"{name}.yaml"
    if not preset_path.exists():
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found.")
        
    try:
        preset_path.unlink()
        return {
            "status": "success",
            "message": f"Preset '{name}' deleted successfully."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete preset: {str(e)}")

@app.get("/api/chunks")
async def get_all_chunks(limit: int = 100, offset: int = 0):
    """List chunks with pagination (default 100 per page, not 10000)."""
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Orchestrator not initialized. Error: {init_error}"
        )
    
    try:
        await orchestrator.initialize()
        db = orchestrator.vector_store
        
        # Fetch one page of chunks with a reasonable default limit
        chunks = await db.list_chunks(limit=limit)
        
        chunks_list = []
        for c in chunks:
            meta_dict = c.metadata.model_dump() if hasattr(c.metadata, "model_dump") else c.metadata
            custom = meta_dict.get("custom", {}) or {}
            
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
                    "chunk_index": c.chunk_index,
                    **{k: v for k, v in meta_dict.items() if k not in ["source", "file_name", "file_type", "language", "page_number", "total_pages", "chunk_index", "custom"]},
                    **custom
                },
                "token_count": c.token_count
            })
            
        chunks_list.sort(
            key=lambda c: (
                c["metadata"].get("file_name") or "",
                c["metadata"].get("page_number") or 0,
                c.get("chunk_index") or 0
            )
        )
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
        history_dicts = [m.model_dump() for m in req.chat_history] if req.chat_history else None
        result = await orchestrator.query(
            user_query=req.query,
            ground_truth=req.ground_truth,
            metadata=req.metadata,
            attachments=req.attachments,
            chat_history=history_dicts
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
            retrieved_results = await orchestrator.reranker.rerank(
                query=q_ctx.original_query,
                results=retrieved_results,
                top_n=orchestrator.config.retrieval.reranker_top_n
            )
            
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
        
    history_dicts = [m.model_dump() for m in req.chat_history] if req.chat_history else None
    async def token_generator():
        try:
            async for token in orchestrator.query_stream(
                req.query, req.metadata, req.attachments, chat_history=history_dicts
            ):
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
    orchestrator.start_ingestion([str(file.filename) for file in files])

    # Create uploads directory inside workspace
    uploads_dir = Path("data/uploads")
    uploads_dir.mkdir(parents=True, exist_ok=True)
    
    total_chunk_ids = []
    ingested_files_log = []
    
    async def ingest_single_file(file: UploadFile):
        current_filename = file.filename
        uploads_file_path = None
        try:
            # Generate unique uploads filename to prevent conflict
            file_extension = Path(str(current_filename)).suffix
            uploads_file_name = f"{current_filename}{uuid.uuid4()}{file_extension}"
            # uploads_file_name = f"{uuid.uuid4()}{file_extension}"
            uploads_file_path = uploads_dir / uploads_file_name
            
            # Save file to uploads path via run_in_executor to avoid blocking the event loop
            loop = asyncio.get_running_loop()
            def write_file():
                with open(uploads_file_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
            await loop.run_in_executor(None, write_file)
                
            # Run ingestion metadata
            file_metadata = {**metadata, "filename": current_filename, "file_name": current_filename}
            
            # Call orchestrator ingest directly - status logic is now inside orchestrator!
            chunk_ids = await orchestrator.ingest_source(
                source=str(uploads_file_path),
                metadata=file_metadata
            )
            return current_filename, chunk_ids, None
        except Exception as file_err:
            orchestrator.set_ingestion_failed(str(current_filename), str(file_err))
            return current_filename, [], file_err
        finally:
            pass
            # Clean up temporary file
            # if uploads_file_path and uploads_file_path.exists():
            #     try:
            #         uploads_file_path.unlink()
            #     except Exception:
            #         pass

    try:
        tasks = [ingest_single_file(f) for f in files]
        results = await asyncio.gather(*tasks)
        
        failures = []
        for filename, chunk_ids, error in results:
            if error:
                failures.append({"filename": filename, "error": str(error)})
            else:
                total_chunk_ids.extend(chunk_ids)
                ingested_files_log.append({
                    "filename": filename,
                    "chunks_count": len(chunk_ids)
                })

        if failures and len(failures) == len(files):
            # All files failed, raise error
            raise HTTPException(
                status_code=500,
                detail=f"All file ingestions failed: {failures}"
            )
            
        # Trigger background summarization check
        summarizer_trigger_event.set()
        
        return {
            "status": "success",
            "message": f"Successfully ingested {len(ingested_files_log)} of {len(files)} files.",
            "files": ingested_files_log,
            "total_chunks_ingested": len(total_chunk_ids),
            "chunk_ids": total_chunk_ids,
            "failures": failures
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        pass
        # # Cleanup any remaining files in temp uploads
        # if uploads_dir.exists():
        #     for f in uploads_dir.glob("*"):
        #         try:
        #             f.unlink()
        #         except Exception:
        #             pass

@app.delete("/api/documents/{filename}")
async def delete_document(filename: str):
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Orchestrator not initialized."
        )

    try:
        await orchestrator.initialize()
        db = orchestrator.vector_store
        
        # Clean swappable deletion across any provider
        await db.delete_by_metadata("file_name", filename)
        
        return {
            "status": "success",
            "message": f"Successfully deleted document '{filename}' from vector store."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@app.get("/api/documents")
async def get_documents():
    """List documents using server-side metadata filtering instead of full scan."""
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Orchestrator not initialized."
        )
    
    try:
        await orchestrator.initialize()
        db = orchestrator.vector_store
        
        # Get unique filenames using lightweight server-side query
        unique_filenames = await db.get_unique_metadata_values("file_name")
        
        docs_list = []
        for raw_fname in unique_filenames:
            filename_clean = os.path.basename(raw_fname)
            
            # Fetch only chunks for this specific document via server-side filter
            file_chunks = await db.list_chunks_by_metadata("file_name", raw_fname)
            if not file_chunks:
                continue
            
            first_chunk = file_chunks[0]
            file_type = first_chunk.metadata.file_type
            if not file_type and "." in filename_clean:
                file_type = filename_clean.split(".")[-1]
            
            created_at = first_chunk.metadata.created_at
            created_str = "Database Ingested"
            if created_at:
                created_str = created_at.strftime("%b %d, %Y, %I:%M %p")
                
            total_tokens = sum(c.token_count for c in file_chunks)
            
            # Calculate summarized count vs elements that need summaries
            summarized_count = 0
            needs_summary_count = 0
            for c in file_chunks:
                custom = c.metadata.custom if (c.metadata and hasattr(c.metadata, "custom") and c.metadata.custom) else {}
                tables = custom.get("tables_html", [])
                images = custom.get("images_base64", [])
                if tables or images:
                    needs_summary_count += 1
                    summary_text = custom.get("summary_text", "")
                    if summary_text and "[Local LLM Offline Fallback]" not in summary_text:
                        summarized_count += 1

            docs_list.append({
                "name": filename_clean,
                "chunksCount": len(file_chunks),
                "totalTokens": total_tokens,
                "file_type": file_type,
                "uploadTime": created_str,
                "status": "completed",
                "isMock": False,
                "summarizedCount": summarized_count,
                "needsSummaryCount": needs_summary_count,
            })
            
        return {
            "status": "success",
            "documents": docs_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch documents: {str(e)}")

@app.get("/api/documents/{filename}/chunks")
async def get_document_chunks(filename: str):
    """Get chunks for a specific document using server-side filtering."""
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Orchestrator not initialized."
        )
        
    try:
        await orchestrator.initialize()
        db = orchestrator.vector_store
        
        # Server-side filtered query — no more loading all 10K chunks
        chunks = await db.list_chunks_by_metadata("file_name", filename)
        
        # Also try matching by basename in case stored filenames include paths
        if not chunks:
            # Fallback: get unique filenames and find the matching one
            unique_fnames = await db.get_unique_metadata_values("file_name")
            for raw_fname in unique_fnames:
                if os.path.basename(raw_fname).lower() == filename.lower():
                    chunks = await db.list_chunks_by_metadata("file_name", raw_fname)
                    break
        
        filtered = []
        for c in chunks:
            meta_dict = c.metadata.model_dump() if hasattr(c.metadata, "model_dump") else c.metadata
            custom = meta_dict.get("custom", {}) or {}
            
            c_type = "text"
            file_type = meta_dict.get("file_type", "")
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

            original_text = custom.get("raw_text", c.content)
            summary = custom.get("summary_text", "")

            
            filtered.append({
                "id": c.id,
                "page": meta_dict.get("page_number", 1) or 1,
                "type": c_type,
                "snippet": c.content[:120] + "..." if len(c.content) > 120 else c.content,
                "originalText": original_text,
                "summaryText": summary,
                "isRaw": not summary,
                "chunk_index": c.chunk_index,
                "metadata": meta_dict
            })
                
        filtered.sort(key=lambda x: (x.get("page") or 1, x.get("chunk_index") or 0, x.get("id")))
        
        return {
            "status": "success",
            "chunks": filtered
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch document chunks: {str(e)}")

@app.get("/api/documents/{filename}/raw")
async def get_raw_document(filename: str):
    """Retrieve the original uploaded file for a document using metadata stored in Qdrant."""
    from fastapi.responses import FileResponse
    global orchestrator
    if not orchestrator:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Orchestrator not initialized."
        )
        
    try:
        await orchestrator.initialize()
        db = orchestrator.vector_store
        
        # Get chunks for this specific document to find the source path on disk
        chunks = await db.list_chunks_by_metadata("file_name", filename)
        if not chunks:
            # Fallback: get unique filenames and find the matching one
            unique_fnames = await db.get_unique_metadata_values("file_name")
            for raw_fname in unique_fnames:
                if os.path.basename(raw_fname).lower() == filename.lower():
                    chunks = await db.list_chunks_by_metadata("file_name", raw_fname)
                    break
        
        if not chunks:
            raise HTTPException(status_code=404, detail="Document not found in vector store.")
            
        first_chunk = chunks[0]
        meta_dict = first_chunk.metadata.model_dump() if hasattr(first_chunk.metadata, "model_dump") else first_chunk.metadata
        source_path = meta_dict.get("source")
        
        if not source_path or not os.path.exists(source_path):
            raise HTTPException(status_code=404, detail="Original document file not found on disk.")
            
        return FileResponse(source_path, filename=filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch raw document: {str(e)}")

@app.post("/api/parse-attachment")
async def parse_attachment(file: UploadFile = File(...)):
    global orchestrator
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

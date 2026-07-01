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

import inngest
import inngest.fast_api
import structlog

# Initialize Inngest client
inngest_client = inngest.Inngest(
    app_id="advanced-rag-api",
    logger=structlog.get_logger("inngest")
)

@inngest_client.create_function(
    fn_id="ingest_document",
    trigger=inngest.TriggerEvent(event="document/uploaded"),
)
async def ingest_document_workflow(ctx: inngest.Context) -> dict:
    global orchestrator
    if not orchestrator:
        init_orchestrator()
    if not orchestrator:
        raise Exception("Orchestrator could not be initialized")

    file_path = ctx.event.data["file_path"]
    filename = ctx.event.data["filename"]
    metadata = ctx.event.data.get("metadata") or {}

    # Initialize status in-memory for progress compatibility
    orchestrator.ingestion_status[filename] = {
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

    # Step 1: Parse the file
    async def run_parse():
        import json
        docs = await orchestrator.parser.parse(file_path, metadata)
        return [json.loads(doc.model_dump_json()) for doc in docs]

    docs_json = await ctx.step.run("parse", run_parse)
    if not docs_json:
        orchestrator.ingestion_status[filename] = {
            "step": 3,
            "status": "completed",
            "details": "No elements found to parse.",
            "text_count": 0, "table_count": 0, "image_count": 0, "title_count": 0,
            "total_elements": 0, "chunks_count": 0, "chunks": []
        }
        return {"chunk_ids": []}

    from rag.core.types import Document, Chunk
    documents = [Document.model_validate(d) for d in docs_json]

    # Calculate and update elements statistics for UI
    text_count = 0
    table_count = 0
    image_count = 0
    title_count = 0
    for doc in documents:
        m_dict = doc.metadata.model_dump() if hasattr(doc.metadata, "model_dump") else doc.metadata
        custom = m_dict.get("custom", {})
        if not isinstance(custom, dict):
            custom = {}
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

    # Update status to step 3: chunking
    orchestrator.ingestion_status[filename] = {
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

    # Step 2: Chunking & AI Summarization
    async def run_chunking():
        import json
        chunks = await orchestrator._chunk_documents(documents)
        return [json.loads(chunk.model_dump_json()) for chunk in chunks]

    chunks_json = await ctx.step.run("chunking", run_chunking)
    if not chunks_json:
        orchestrator.ingestion_status[filename] = {
            "step": 3,
            "status": "completed",
            "details": "Layout partitioned, but 0 chunks created.",
            "text_count": text_count, "table_count": table_count, "image_count": image_count, "title_count": title_count,
            "total_elements": total_elements, "chunks_count": 0, "chunks": []
        }
        return {"chunk_ids": []}

    chunks = [Chunk.model_validate(c) for c in chunks_json]

    # Update status to indexing
    orchestrator.ingestion_status[filename] = {
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

    # Step 3: Embeddings
    async def run_embedding():
        import json
        texts = [chunk.content for chunk in chunks]
        embeddings = await orchestrator.embedding_model.embed(texts)
        
        sparse_embeddings = None
        try:
            if hasattr(orchestrator.embedding_model, "embed_sparse"):
                sparse_embeddings = await orchestrator.embedding_model.embed_sparse(texts)
        except Exception:
            pass

        # Attach embeddings to chunks
        for i, chunk in enumerate(chunks):
            chunk.embedding = embeddings[i]
            if sparse_embeddings:
                s_vec = sparse_embeddings[i]
                chunk.sparse_embedding = dict(zip(s_vec.indices, s_vec.values))
        return [json.loads(c.model_dump_json()) for c in chunks]

    chunks_with_embeddings_json = await ctx.step.run("embedding", run_embedding)
    chunks_with_embeddings = [Chunk.model_validate(c) for c in chunks_with_embeddings_json]

    # Step 4: Indexing in Vector Store
    async def run_indexing():
        chunk_ids = await orchestrator.vector_store.upsert(chunks_with_embeddings)
        return chunk_ids

    chunk_ids = await ctx.step.run("indexing", run_indexing)

    # Format chunks for UI compatibility
    formatted_chunks = []
    for c in chunks_with_embeddings:
        c_m = c.metadata.model_dump() if hasattr(c.metadata, "model_dump") else c.metadata
        file_type = c_m.get("file_type", "")
        custom = c_m.get("custom", {})
        if not isinstance(custom, dict):
            custom = {}
        element_type = custom.get("element_type", "text")
        
        formatted_chunks.append({
            "id": c.id,
            "document_id": c.document_id,
            "content": c.content,
            "metadata": {
                "source": c_m.get("source", ""),
                "file_name": c_m.get("file_name", ""),
                "file_type": file_type,
                "custom": {
                    "element_type": element_type,
                    "tables_html": custom.get("tables_html", []),
                    "images_base64": custom.get("images_base64", [])
                }
            }
        })

    # Update status to completed
    orchestrator.ingestion_status[filename] = {
        "step": 3,
        "status": "completed",
        "details": f"Successfully ingested {len(chunk_ids)} chunks into the vector store.",
        "text_count": text_count,
        "table_count": table_count,
        "image_count": image_count,
        "title_count": title_count,
        "total_elements": total_elements,
        "chunks_count": len(chunk_ids),
        "chunks": formatted_chunks
    }

    # Trigger background summarizer event
    await ctx.step.send_event(
        "trigger-summarizer",
        inngest.Event(name="document/summarize", data={})
    )

    return {"chunk_ids": chunk_ids}


@inngest_client.create_function(
    fn_id="summarize_missing_documents",
    trigger=inngest.TriggerEvent(event="document/summarize"),
)
async def summarize_missing_documents(ctx: inngest.Context) -> dict:
    global orchestrator
    if not orchestrator:
        init_orchestrator()
    if not orchestrator:
        return {"status": "skipped", "reason": "orchestrator not initialized"}

    # Run update_missing_summaries step
    async def run_summarization():
        num_updated, remaining = await orchestrator.update_missing_summaries()
        return {"num_updated": num_updated, "remaining": remaining}

    res = await ctx.step.run("update_summaries", run_summarization)
    num_updated = res["num_updated"]
    remaining = res["remaining"]

    if remaining > 0 and num_updated > 0:
        # Sleep for 15 seconds and trigger again
        await ctx.step.sleep("sleep-before-retry", 15.0)
        await ctx.step.send_event(
            "re-trigger-summarizer",
            inngest.Event(name="document/summarize", data={})
        )

    return {"num_updated": num_updated, "remaining": remaining}


@inngest_client.create_function(
    fn_id="scheduled_summarization_sweep",
    trigger=inngest.TriggerCron(cron="*/5 * * * *"),
)
async def scheduled_summarization_sweep(ctx: inngest.Context) -> dict:
    await ctx.step.send_event(
        "trigger-summarizer",
        inngest.Event(name="document/summarize", data={})
    )
    return {"triggered": True}

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
    # Trigger a startup sweep of missing summaries via Inngest client
    try:
        await inngest_client.send(inngest.Event(name="document/summarize", data={}))
    except Exception as e:
        print(f"Failed to send startup summarizer trigger: {e}")
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

# Serve Inngest endpoints
inngest.fast_api.serve(
    app,
    inngest_client,
    [ingest_document_workflow, summarize_missing_documents, scheduled_summarization_sweep],
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
        try:
            await inngest_client.send(inngest.Event(name="document/summarize", data={}))
        except Exception as e:
            print(f"Failed to send config update summarizer trigger: {e}")
        
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
        try:
            await inngest_client.send(inngest.Event(name="document/summarize", data={}))
        except Exception as e:
            print(f"Failed to send config update summarizer trigger: {e}")
        
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
    
    queued_files_log = []
    
    for file in files:
        current_filename = file.filename
        try:
            # Generate unique uploads filename to prevent conflict
            file_extension = Path(str(current_filename)).suffix
            uploads_file_name = f"{current_filename}{uuid.uuid4()}{file_extension}"
            uploads_file_path = uploads_dir / uploads_file_name
            
            # Save file to uploads path via run_in_executor to avoid blocking the event loop
            loop = asyncio.get_running_loop()
            def write_file():
                with open(uploads_file_path, "wb") as f:
                    shutil.copyfileobj(file.file, f)
            await loop.run_in_executor(None, write_file)
                
            # Run ingestion metadata
            file_metadata = {**metadata, "filename": current_filename, "file_name": current_filename}
            
            # Set status to uploading before dispatching the event
            orchestrator.ingestion_status[current_filename] = {
                "step": 1,
                "status": "uploading",
                "details": "Saving files locally and dispatching to background worker...",
                "text_count": 0,
                "table_count": 0,
                "image_count": 0,
                "title_count": 0,
                "total_elements": 0,
                "chunks_count": 0,
                "chunks": []
            }
            
            # Dispatch event to Inngest
            await inngest_client.send(
                inngest.Event(
                    name="document/uploaded",
                    data={
                        "file_path": str(uploads_file_path),
                        "filename": current_filename,
                        "metadata": file_metadata
                    }
                )
            )
            
            queued_files_log.append({
                "filename": current_filename,
                "status": "queued"
            })
        except Exception as file_err:
            orchestrator.set_ingestion_failed(str(current_filename), str(file_err))
            queued_files_log.append({
                "filename": current_filename,
                "status": "failed",
                "error": str(file_err)
            })

    return {
        "status": "success",
        "message": f"Successfully queued {len(queued_files_log)} files for ingestion.",
        "files": queued_files_log,
        "total_chunks_ingested": 0,
        "chunk_ids": [],
        "failures": [f for f in queued_files_log if f.get("status") == "failed"]
    }

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

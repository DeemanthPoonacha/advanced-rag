export interface Source {
  content: string;
  score: number;
  metadata?: {
    file_name?: string;
    source?: string;
    [key: string]: any;
  };
}

export interface Evaluation {
  metrics?: Record<string, number>;
  error?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  file_type: string;
  content?: string;
  base64?: string;
  extracted_images?: string[];
  status: "processing" | "ready" | "error";
  error?: string;
}

export interface Message {
  sender: "user" | "assistant";
  text: string;
  status: "loading" | "streaming" | "done";
  sources?: Source[] | null;
  evaluation?: Evaluation | null;
  latency?: number;
  attachments?: Attachment[] | null;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
}

export interface RAGStatus {
  status: "active" | "offline";
  parser_provider: string;
  chunker_provider: string;
  collection_name: string;
  vector_store_provider: string;
  environment: string;
  chunk_count: number;
}

export interface ChunkerConfig {
  target_chunk_size?: number;
  buffer_size?: number;
  [key: string]: any;
}

export interface ChunkerSettings {
  provider: string;
  config: ChunkerConfig;
}

export interface ParserSettings {
  provider: string;
  config: Record<string, any>;
}

export interface MultimodalEnricherConfig {
  provider: "primary" | "openai" | "anthropic" | "cohere" | "local";
  model_name: string;
  temperature: number;
  api_key?: string | null;
  base_url?: string | null;
  table_prompt?: string;
  image_prompt?: string;
  [key: string]: any;
}

export interface PyMuPDFConfig {
  extract_images?: boolean;
}

export interface DoclingConfig {
  export_format?: "markdown" | "json";
}

export interface GCPDocumentAIConfig {
  project_id?: string | null;
  location?: string;
  processor_id?: string | null;
}

export interface UnstructuredAPIConfig {
  api_url?: string;
  api_key?: string | null;
  strategy?: string;
}

export interface MarkdownHeaderConfig {
  max_chunk_size?: number;
  chunk_overlap?: number;
  prepend_headers?: boolean;
}

export interface IngestionSettings {
  batch_size?: number;
  chunker?: ChunkerSettings;
  parser?: ParserSettings;
  enable_multimodal_enrichment?: boolean;
  multimodal_enricher?: MultimodalEnricherConfig;
  pymupdf?: PyMuPDFConfig;
  docling?: DoclingConfig;
  gcp_documentai?: GCPDocumentAIConfig;
  unstructured_api?: UnstructuredAPIConfig;
  markdown_header?: MarkdownHeaderConfig;
}

export interface ProjectSettings {
  name: string;
  environment: string;
  version?: string;
}

export interface RerankerSettings {
  provider: string;
  config?: Record<string, any>;
}

export interface RetrievalSettings {
  strategy: string;
  top_k: number;
  similarity_threshold: number;
  config?: Record<string, any>;
  reranker?: RerankerSettings | null;
  reranker_top_n?: number;
}

export interface LLMConfig {
  model: string;
  temperature: number;
  [key: string]: any;
}

export interface LLMSettings {
  provider: string;
  config: LLMConfig;
}

export interface PipelineConfig {
  project?: ProjectSettings;
  ingestion?: IngestionSettings;
  retrieval?: RetrievalSettings;
  llm?: LLMSettings;
  [key: string]: any;
}

export interface ToastState {
  text: string;
  type: "success" | "error";
}

export interface UploadLog {
  filename: string;
  chunks_count: number;
  date: string;
  summarized_count?: number;
  needs_summary_count?: number;
}

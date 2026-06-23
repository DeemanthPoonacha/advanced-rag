export interface Source {
  content: string;
  score: number;
  metadata?: {
    filename?: string;
    source?: string;
    [key: string]: any;
  };
}

export interface Evaluation {
  metrics?: Record<string, number>;
  error?: string;
}

export interface Message {
  sender: "user" | "assistant";
  text: string;
  status: "loading" | "streaming" | "done";
  sources?: Source[] | null;
  evaluation?: Evaluation | null;
  latency?: number;
}

export interface RAGStatus {
  status: "active" | "offline";
  mock_mode: boolean;
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

export interface MultimodalSummarizerConfig {
  provider: "primary" | "openai" | "anthropic" | "cohere" | "local";
  model_name: string;
  temperature: number;
  api_key?: string | null;
  base_url?: string | null;
  [key: string]: any;
}

export interface IngestionSettings {
  batch_size?: number;
  chunker?: ChunkerSettings;
  parser?: ParserSettings;
  multimodal_summarizer?: MultimodalSummarizerConfig;
}

export interface ProjectSettings {
  name: string;
  environment: string;
  version?: string;
}

export interface RetrievalSettings {
  strategy: string;
  top_k: number;
  similarity_threshold: number;
  config?: Record<string, any>;
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
}

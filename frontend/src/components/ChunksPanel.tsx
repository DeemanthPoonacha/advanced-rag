import { useState, useEffect } from "react";
import {
  Search,
  FileText,
  RefreshCw,
  Copy,
  Check,
  Hash,
  Database,
  AlertCircle
} from "lucide-react";

interface ChunkMetadata {
  source: string;
  file_name?: string;
  file_type?: string;
  language?: string;
  [key: string]: any;
}

interface Chunk {
  id: string;
  content: string;
  document_id: string;
  chunk_index: number;
  metadata: ChunkMetadata;
  token_count: number;
}

const API_BASE = "http://localhost:8000";

export function ChunksPanel() {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);

  const fetchChunks = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/chunks?limit=250`);
      if (res.ok) {
        const data = await res.json();
        setChunks(data.chunks || []);
      } else {
        const errData = await res.json();
        setError(errData.detail || "Failed to fetch vector chunks.");
      }
    } catch (e) {
      setError("Connection error connecting to RAG backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChunks();
  }, []);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group chunks by document name
  const documentGroupMap: Record<string, Chunk[]> = {};
  chunks.forEach((chunk) => {
    const docName = chunk.metadata.file_name || chunk.metadata.source || "Unnamed Document";
    if (!documentGroupMap[docName]) {
      documentGroupMap[docName] = [];
    }
    documentGroupMap[docName].push(chunk);
  });

  // Sort chunks inside each document by chunk_index
  Object.keys(documentGroupMap).forEach((docName) => {
    documentGroupMap[docName].sort((a, b) => a.chunk_index - b.chunk_index);
  });

  const uniqueDocs = Object.keys(documentGroupMap).sort();

  // Filter documents based on query (by document name or content search)
  const filteredDocs = uniqueDocs.filter((docName) => {
    if (!searchQuery) return true;
    const matchesDocName = docName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesContent = documentGroupMap[docName].some((chunk) =>
      chunk.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return matchesDocName || matchesContent;
  });

  // Automatically select the first visible document if none is selected
  useEffect(() => {
    if (filteredDocs.length > 0 && (!selectedDoc || !filteredDocs.includes(selectedDoc))) {
      setSelectedDoc(filteredDocs[0]);
    } else if (filteredDocs.length === 0) {
      setSelectedDoc(null);
    }
  }, [filteredDocs, selectedDoc]);

  const selectedChunks = selectedDoc ? documentGroupMap[selectedDoc] || [] : [];

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-hidden max-w-7xl w-full mx-auto">
      {/* Title Bar */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold font-display flex items-center gap-2">
            <Database className="text-primary w-5 h-5" />
            Vector Chunk Visualizer
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Browse and inspect segmented paragraphs stored in the active vector index
          </p>
        </div>
        <button
          onClick={fetchChunks}
          disabled={loading}
          className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          <span>Refresh Database</span>
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
          <RefreshCw size={18} className="animate-spin text-primary mr-2.5" />
          <span>Scanning vector database...</span>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center p-6 border border-rose-200/50 dark:border-rose-900/30 bg-rose-50/20 dark:bg-rose-950/10 rounded-2xl">
          <div className="flex flex-col items-center max-w-md text-center gap-3">
            <AlertCircle size={32} className="text-rose-500" />
            <h4 className="font-bold text-sm">Failed to connect to Vector Store</h4>
            <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
            <button
              onClick={fetchChunks}
              className="mt-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/95 transition cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      ) : chunks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 border border-slate-200 dark:border-slate-800 border-dashed rounded-2xl">
          <div className="flex flex-col items-center max-w-sm text-center gap-3">
            <Database size={36} className="text-slate-300 dark:text-slate-700" />
            <h4 className="font-bold text-sm">Vector Collection Empty</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              No document chunks have been indexed yet. Head to the **Document Ingest** tab to upload and segment source files.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
          
          {/* Left Column: Documents Selector */}
          <div className="w-full md:w-80 flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 overflow-hidden shrink-0">
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Filter documents or content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2.5 mb-2">
                Active Sources ({filteredDocs.length})
              </div>
              
              {filteredDocs.map((docName) => {
                const isActive = docName === selectedDoc;
                const docChunks = documentGroupMap[docName] || [];
                return (
                  <button
                    key={docName}
                    onClick={() => setSelectedDoc(docName)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition cursor-pointer border ${
                      isActive
                        ? "bg-primary/5 dark:bg-primary/10 border-primary/20 text-slate-950 dark:text-white"
                        : "border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <FileText className={`w-4 h-4 shrink-0 ${isActive ? "text-primary" : "text-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate leading-tight">{docName}</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        {docChunks.length} {docChunks.length === 1 ? "chunk" : "chunks"}
                      </div>
                    </div>
                  </button>
                );
              })}

              {filteredDocs.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-400">
                  No documents match search query.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Chunks Viewer */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 overflow-hidden">
            {selectedDoc ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header info */}
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 shrink-0">
                  <h3 className="text-sm font-bold truncate text-slate-900 dark:text-white">
                    {selectedDoc}
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Viewing {selectedChunks.length} chunks ordered sequentially by index
                  </p>
                </div>

                {/* Timeline scroll area */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-thin">
                  {selectedChunks.map((chunk) => {
                    const charactersCount = chunk.content.length;
                    const isExpanded = expandedChunkId === chunk.id;
                    return (
                      <div
                        key={chunk.id}
                        className="group border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/30 dark:bg-slate-950/20 hover:border-slate-200 dark:hover:border-slate-700/80 transition-all p-4 space-y-3 relative"
                      >
                        {/* Action buttons (top right hover overlay) */}
                        <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200/55 dark:border-slate-800 p-1 rounded-lg shadow-sm">
                          <button
                            onClick={() => handleCopy(chunk.id, chunk.content)}
                            className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer rounded"
                            title="Copy chunk text"
                          >
                            {copiedId === chunk.id ? (
                              <Check size={13} className="text-emerald-500" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </div>

                        {/* Chunk Info Header bar */}
                        <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-lg">
                            <Hash size={10} />
                            Index {chunk.chunk_index}
                          </span>
                          <span className="bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-lg">
                            {charactersCount} chars
                          </span>
                          <span className="bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-lg">
                            {chunk.token_count} tokens
                          </span>
                          <span className="text-slate-400 dark:text-slate-500 font-mono text-[9px] truncate max-w-xs select-all">
                            ID: {chunk.id}
                          </span>
                        </div>

                        {/* Text Block content */}
                        <div className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-slate-50/60 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/50 rounded-xl p-3 select-text font-medium whitespace-pre-wrap">
                          {chunk.content}
                        </div>

                        {/* Raw Metadata panel */}
                        <div className="border-t border-slate-100 dark:border-slate-800/50 pt-2.5">
                          <button
                            onClick={() => setExpandedChunkId(isExpanded ? null : chunk.id)}
                            className="text-[10px] font-extrabold text-slate-400 hover:text-primary dark:hover:text-primary transition cursor-pointer flex items-center gap-1 uppercase tracking-wider"
                          >
                            {isExpanded ? "Hide Metadata Payload" : "View Metadata Payload"}
                          </button>

                          {isExpanded && (
                            <pre className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre leading-normal">
                              {JSON.stringify(chunk.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                Select a document from the left list to visualize its chunks.
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

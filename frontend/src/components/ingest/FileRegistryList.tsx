import { useState } from "react";
import {
  Search,
  X,
  Loader2,
  Info,
  Database,
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Trash2,
} from "lucide-react";

interface FileRegistryListProps {
  sortedGroupKeys: string[];
  groupedFiles: Record<string, any[]>;
  openRegistryFiles: Record<string, boolean>;
  toggleRegistryAccordion: (fileId: string) => void;
  realIngestStatus: Record<string, any>;
  onDeleteFileClick: (filename: string, isMock: boolean) => void;
  selectedChunk: any;
  setSelectedChunk: (chunk: any) => void;
  isRagSearching: boolean;
  ragSearchError: string | null;
  ragSearchResults: any;
  allFiles: any[];
  clearRagSearch: () => void;
  handleRagSearch: () => void;
  ragSearchQuery: string;
  setRagSearchQuery: (q: string) => void;
}

export function FileRegistryList({
  sortedGroupKeys,
  groupedFiles,
  openRegistryFiles,
  toggleRegistryAccordion,
  realIngestStatus,
  onDeleteFileClick,
  selectedChunk,
  setSelectedChunk,
  isRagSearching,
  ragSearchError,
  ragSearchResults,
  allFiles,
  clearRagSearch,
  handleRagSearch,
  ragSearchQuery,
  setRagSearchQuery,
}: FileRegistryListProps) {
  const [registryChunkFilters, setRegistryChunkFilters] = useState<
    Record<string, "all" | "text" | "table" | "image">
  >({});

  // Helper to color-code similarity scores dynamically
  const getScoreBadgeClass = (score: number) => {
    if (score >= 0.8) {
      return "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
    }
    if (score >= 0.5) {
      return "bg-amber-500/10 text-amber-500 border border-amber-500/20";
    }
    return "bg-slate-500/10 text-slate-500 border border-slate-500/20";
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex-1 flex flex-col min-h-[300px] overflow-hidden backdrop-blur-md bg-white/80 dark:bg-slate-900/80">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 shrink-0">
        <h3 className="text-md font-bold font-display">
          Ingested Files Registry
        </h3>

        {/* RAG Retrieval Search Bar */}
        <div className="relative w-full md:w-80 shrink-0">
          <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Retrieve matching document chunks (Press Enter)..."
            value={ragSearchQuery}
            onChange={(e) => setRagSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleRagSearch();
              }
            }}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-all duration-200"
          />
          {ragSearchQuery && (
            <button
              onClick={clearRagSearch}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer animate-fade-in"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {isRagSearching ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm font-semibold">Interrogating Vector Index...</p>
          <p className="text-xs text-slate-500">
            Retrieving most relevant document chunks and synthesizing answer
          </p>
        </div>
      ) : ragSearchError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 gap-2">
          <Info className="w-8 h-8 text-rose-500 animate-bounce" />
          <p className="text-sm font-bold text-rose-500">Search failed</p>
          <p className="text-xs text-slate-500">{ragSearchError}</p>
          <button
            onClick={clearRagSearch}
            className="mt-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold cursor-pointer transitionactive:scale-95"
          >
            Reset Registry View
          </button>
        </div>
      ) : ragSearchResults ? (
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
          {/* Retrieval Metadata and Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800/80 transition-colors">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Active Query Filter
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 italic">
                "{ragSearchQuery}"
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[9px] text-slate-400 dark:text-slate-500 font-mono flex items-center gap-2">
                <span>
                  Latency: {ragSearchResults.latency_ms?.toFixed(0)}ms
                </span>
                <span>•</span>
                <span>
                  Trace ID: {ragSearchResults.trace_id?.substring(0, 8)}...
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded font-sans text-[8px] font-bold ${
                  ragSearchResults.isSimulated
                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                }`}
              >
                {ragSearchResults.retrievalType || "Vector DB Search"}
              </span>
              <button
                onClick={clearRagSearch}
                className="text-[10px] text-rose-500 hover:text-rose-600 font-bold hover:underline cursor-pointer transition flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-3"
              >
                <X className="w-3 h-3" /> Clear Results
              </button>
            </div>
          </div>

          {/* Retrieved Sources */}
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
              Retrieved Source Chunks ({ragSearchResults.sources?.length || 0})
            </div>
            {ragSearchResults.sources && ragSearchResults.sources.length > 0 ? (
              <div className="space-y-3">
                {ragSearchResults.sources.map((source: any, idx: number) => {
                  const chunkObj = {
                    id: `retrieved-${idx}`,
                    page: source.metadata?.page_number || 1,
                    type:
                      source.metadata?.file_type === "image" ||
                      source.metadata?.image_extracted ||
                      source.metadata?.image_base64 ||
                      (Array.isArray(source.metadata?.images_base64) &&
                        source.metadata.images_base64.length > 0)
                        ? ("image" as const)
                        : source.metadata?.table_extracted ||
                            (Array.isArray(source.metadata?.tables_html) &&
                              source.metadata.tables_html.length > 0)
                          ? ("table" as const)
                          : ("text" as const),
                    snippet: source.content
                      ? source.content.length > 120
                        ? source.content.substring(0, 120) + "..."
                        : source.content
                      : "",
                    originalText: source.content || "",
                    summaryText: source.metadata?.summary_text || "",
                    isRaw: !source.metadata?.summary_text,
                    metadata: source.metadata || {},
                  };

                  const isSelected =
                    selectedChunk?.originalText === source.content;
                  const scorePercent = (source.score * 100).toFixed(0);

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedChunk(chunkObj)}
                      className={`p-3 rounded-lg border text-left cursor-pointer transition-all duration-200 hover:scale-[1.01] ${
                        isSelected
                          ? "bg-primary/5 border-primary/45 shadow-sm"
                          : "bg-slate-50/40 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/40 hover:bg-slate-100/50 dark:hover:bg-slate-800/20"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex gap-1.5 items-center">
                          <span className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-[8px] font-bold text-primary">
                            Rank #{idx + 1}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${getScoreBadgeClass(source.score)}`}
                          >
                            Score: {scorePercent}%
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[150px] font-semibold">
                            {source.metadata?.file_name ||
                              source.metadata?.source ||
                              "Unknown Document"}
                          </span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                          Page {source.metadata?.page_number || 1}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                        {source.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No sources returned for this query.
              </div>
            )}
          </div>
        </div>
      ) : allFiles.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
          <Database className="w-12 h-12 text-slate-300 dark:text-slate-800 mb-2 animate-pulse" />
          <p className="text-sm font-semibold">No files ingested yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Upload files above to compile the RAG registry.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-6 pr-1 scrollbar-thin">
          {sortedGroupKeys.map((groupKey) => {
            const groupFiles = groupedFiles[groupKey];
            return (
              <div key={groupKey} className="space-y-3">
                {/* Group Header */}
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 select-none">
                  <Database className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
                  <span>{groupKey}</span>
                  <span className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800/80 ml-2" />
                </div>

                {/* Files list under group */}
                <div className="space-y-3">
                  {groupFiles.map((file) => {
                    const isExpanded = !!openRegistryFiles[file.id];
                    return (
                      <div
                        key={file.id}
                        className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.005] hover:border-slate-350 dark:hover:border-slate-700/85 shadow-sm"
                      >
                        {/* File Card Header */}
                        <div
                          onClick={() => toggleRegistryAccordion(file.id)}
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/30 transition select-none"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <FileText className="w-4 h-4 text-primary shrink-0" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {file.name}
                              </div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                                Uploaded: {file.uploadTime}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-md">
                              {file.chunksCount} chunks
                            </span>
                            {file.size && file.size !== "N/A" && (
                              <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                {file.size}
                              </span>
                            )}

                            {/* Dynamic Ingest Status Badge */}
                            {(() => {
                              const detailedStatus =
                                !file.isMock && realIngestStatus[file.name]
                                  ? realIngestStatus[file.name].status
                                  : file.status;

                              return (
                                <>
                                  {detailedStatus === "uploading" && (
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-md flex items-center gap-1">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      Uploading
                                    </span>
                                  )}
                                  {detailedStatus === "partitioning" && (
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-center gap-1">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      Partitioning
                                    </span>
                                  )}
                                  {detailedStatus === "chunking" && (
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-purple-500 bg-purple-500/10 border border-purple-500/20 rounded-md flex items-center gap-1">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      Chunking
                                    </span>
                                  )}
                                  {detailedStatus === "indexing" && (
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-cyan-500 bg-cyan-500/10 border border-cyan-500/20 rounded-md flex items-center gap-1">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      Indexing
                                    </span>
                                  )}
                                  {detailedStatus === "processing" && (
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-center gap-1">
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      Processing
                                    </span>
                                  )}
                                  {detailedStatus === "failed" && (
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-md flex items-center gap-1">
                                      <X className="w-2.5 h-2.5 text-rose-500" />
                                      Failed
                                    </span>
                                  )}
                                  {detailedStatus === "completed" && (
                                    <span className="px-2 py-0.5 text-[9px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                                      Done
                                    </span>
                                  )}
                                </>
                              );
                            })()}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRegistryAccordion(file.id);
                              }}
                              className="ml-2 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/30 rounded-lg text-[10px] font-bold transition-all duration-200 active:scale-95 cursor-pointer"
                              title="Toggle Document Details"
                            >
                              {isExpanded ? "Hide Details" : "Details"}
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteFileClick(file.name, !!file.isMock);
                              }}
                              className="ml-1.5 p-1.5 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 rounded-lg transition-all duration-200 active:scale-90 cursor-pointer flex items-center justify-center shrink-0"
                              title="Delete document and all its chunks"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>{" "}
                        {/* Expanded Ingestion details panel */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/20 p-5 space-y-4 animate-fade-in">
                            {/* Chunks breakdown List */}
                            <div className="space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none">
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  Document Chunk Index Registry
                                </div>

                                {/* Filter Button Row */}
                                {file.chunks && file.chunks.length > 0 && (
                                  <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200/55 dark:border-slate-800/50 shrink-0">
                                    {[
                                      { key: "all", label: "All" },
                                      { key: "text", label: "Text" },
                                      { key: "table", label: "Tables" },
                                      { key: "image", label: "Images" },
                                    ].map((filter) => {
                                      const count =
                                        filter.key === "all"
                                          ? file.chunks.length
                                          : file.chunks.filter(
                                              (c: any) => c.type === filter.key,
                                            ).length;

                                      const activeFilter =
                                        registryChunkFilters[file.id] || "all";
                                      const isActive =
                                        activeFilter === filter.key;

                                      return (
                                        <button
                                          key={filter.key}
                                          onClick={() =>
                                            setRegistryChunkFilters((prev) => ({
                                              ...prev,
                                              [file.id]: filter.key as any,
                                            }))
                                          }
                                          className={`px-2.5 py-0.5 rounded-lg text-[9px] font-extrabold border transition-all duration-200 cursor-pointer ${
                                            isActive
                                              ? "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 shadow-sm"
                                              : "bg-transparent text-slate-500 border-transparent hover:text-slate-800 dark:hover:text-slate-200"
                                          }`}
                                        >
                                          {filter.label} ({count})
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {file.chunks && file.chunks.length > 0 ? (
                                (() => {
                                  const activeFilter =
                                    registryChunkFilters[file.id] || "all";
                                  const filteredChunks = file.chunks.filter(
                                    (chunk: any) => {
                                      if (activeFilter === "all") return true;
                                      return chunk.type === activeFilter;
                                    },
                                  );

                                  if (filteredChunks.length === 0) {
                                    return (
                                      <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500 bg-slate-50/20 dark:bg-slate-900/10 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl animate-fade-in">
                                        No chunks match the active filter "
                                        {activeFilter}".
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1.5 scrollbar-thin animate-fade-in">
                                      {filteredChunks.map((chunk: any) => {
                                        const isSelected =
                                          selectedChunk?.id === chunk.id;
                                        return (
                                          <div
                                            key={chunk.id}
                                            onClick={() =>
                                              setSelectedChunk(chunk)
                                            }
                                            className={`p-3 rounded-lg border text-left cursor-pointer transition-all duration-200 hover:scale-[1.005] ${
                                              isSelected
                                                ? "bg-primary/5 border-primary/45 shadow-sm"
                                                : "bg-slate-50/40 dark:bg-slate-900/20 border-slate-200/60 dark:border-slate-800/40 hover:bg-slate-100/50 dark:hover:bg-slate-800/20"
                                            }`}
                                          >
                                            <div className="flex justify-between items-center mb-1.5">
                                              <div className="flex gap-1.5 items-center">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[8px] font-extrabold text-slate-500 dark:text-slate-400 uppercase">
                                                  Page {chunk.page}
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/60 text-[8px] font-bold text-slate-500 dark:text-slate-400 capitalize">
                                                  {chunk.type}
                                                </span>
                                                {chunk.isRaw ? (
                                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-bold text-emerald-500">
                                                    raw
                                                  </span>
                                                ) : (
                                                  <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-[8px] font-bold text-yellow-600 dark:text-yellow-500">
                                                    summarized
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex gap-1.5 items-center">
                                                <span
                                                  className="text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate max-w-[120px]"
                                                  title={chunk.id}
                                                >
                                                  Chunk Index:{" "}
                                                  {chunk.chunk_index}
                                                </span>
                                                <span className="text-xs text-slate-300 dark:text-slate-600">|</span>
                                                <span
                                                  className="text-[9px] font-mono text-slate-400 dark:text-slate-500 truncate max-w-[120px]"
                                                  title={chunk.id}
                                                >
                                                  ID: {chunk.id}
                                                </span>
                                              </div>
                                            </div>
                                            <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                                              {chunk.originalText ||
                                                chunk.snippet}
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()
                              ) : (
                                <div className="text-center py-4 text-xs text-slate-400 dark:text-slate-500">
                                  No chunks generated or indexed for this
                                  document.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

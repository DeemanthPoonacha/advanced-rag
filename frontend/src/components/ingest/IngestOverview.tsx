import React, { useState } from "react";
import { UploadCloud, Sparkle } from "lucide-react";
import { RAGStatus } from "../../types";

interface IngestOverviewProps {
  status: RAGStatus | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  onFileSelectChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function IngestOverview({
  status,
  fileInputRef,
  isUploading,
  handleDragOver,
  handleDrop,
  onFileSelectChange,
}: IngestOverviewProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const onDropHandler = (e: React.DragEvent) => {
    setIsDragActive(false);
    handleDrop(e);
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto scrollbar-thin animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <h3 className="text-md font-bold mb-1 font-display">
          Ingest Documents
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Upload multiple documents. Layouts will be partitioned (extracting
          text, tables, and images), and summarized dynamically using Vision
          models. Plain text is treated raw and skipped from summaries.
        </p>

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDropHandler}
          className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 ${
            isDragActive
              ? "border-primary bg-primary/10 scale-[1.02] shadow-lg shadow-primary/10"
              : "border-slate-200 dark:border-slate-800 hover:border-primary dark:hover:border-primary bg-slate-50 dark:bg-slate-950/20 hover:bg-primary/5 hover:scale-[1.01]"
          }`}
        >
          <UploadCloud
            className={`w-12 h-12 text-primary ${isDragActive ? "animate-bounce" : "animate-pulse"}`}
          />
          <div className="text-sm font-semibold">
            Click or drag files to upload
          </div>
          <div className="text-xs text-slate-400 text-center max-w-[280px]">
            Supports PDF, DOCX, CSV, PPTX, TXT, or Markdown (Upload multiple
            files)
          </div>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={onFileSelectChange}
            className="hidden"
            disabled={isUploading}
          />
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800 pb-3 mb-1">
        <h3 className="text-xs font-bold text-slate-850 dark:text-slate-100 uppercase tracking-wider">
          Ingestion Engine Settings
        </h3>
      </div>

      <div className="space-y-4 text-xs">
        <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <span className="text-slate-500">Parser Model</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
            {status?.parser_provider || "unstructured"}
          </span>
        </div>
        <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <span className="text-slate-500">Chunking Strategy</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
            {status?.chunker_provider || "semantic"}
          </span>
        </div>
        <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
          <span className="text-slate-500">DB Schema Collection</span>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {status?.collection_name || "documents"}
          </span>
        </div>
        <div className="flex justify-between pb-1">
          <span className="text-slate-500">Indexing Engine</span>
          <span className="font-semibold text-accent capitalize">
            {status?.vector_store_provider || "qdrant"}
          </span>
        </div>
      </div>

      <div className="bg-gradient-to-br from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/5 border border-primary/10 dark:border-primary/20 rounded-xl p-5 shadow-sm mt-2 transition-all hover:scale-[1.01]">
        <h3 className="text-xs font-bold mb-2 font-display text-primary flex items-center gap-1.5">
          <Sparkle className="w-3.5 h-3.5 text-primary animate-pulse" />
          Multi-Modal RAG
        </h3>
        <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
          Hi-res partitioning processes document layouts to extract text blocks,
          tables, and images. Chunks with complex visuals are summarized using
          Vision LLMs, while text-only chunks remain raw. During answer
          synthesis, original high-fidelity layout data is loaded directly into
          the LLM context.
        </p>
      </div>
    </div>
  );
}

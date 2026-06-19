import React from "react";
import { UploadCloud, Database } from "lucide-react";
import { RAGStatus, UploadLog } from "../types";

interface IngestPanelProps {
  status: RAGStatus | null;
  isUploading: boolean;
  uploadLogs: UploadLog[];
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function IngestPanel({
  status,
  isUploading,
  uploadLogs,
  handleFileUpload,
  fileInputRef,
}: IngestPanelProps) {
  return (
    <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
      {/* Left Column: Drag & Drop Ingestion */}
      <div className="flex-1 flex flex-col gap-6 max-h-full overflow-y-auto">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-md font-bold mb-1 font-display">Ingest Documents</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
            Parse and compile files into mathematical vectors. Documents will be chunked semantically and stored in the database.
          </p>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-primary dark:hover:border-primary rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-slate-50 dark:bg-slate-950/20 hover:bg-primary/5 transition-all duration-300"
          >
            <UploadCloud className="w-10 h-10 text-primary animate-bounce" />
            <div className="text-sm font-semibold">Click or drag files to upload</div>
            <div className="text-xs text-slate-400">Supports PDF, DOCX, TXT, or Markdown (Max 25MB)</div>
            <input
              type="file"
              multiple
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex-1 flex flex-col min-h-[300px]">
          <h3 className="text-md font-bold mb-4 font-display">Ingested Files Registry</h3>
          {uploadLogs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
              <Database className="w-12 h-12 text-slate-300 dark:text-slate-800 mb-2" />
              <p className="text-sm">No files uploaded yet in this session</p>
              <p className="text-xs text-slate-400 mt-1">Upload files above to compile the RAG registry.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5">Document Filename</th>
                    <th className="py-2.5">Generated Chunks</th>
                    <th className="py-2.5">Uploaded Date</th>
                    <th className="py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uploadLogs.map((log, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                    >
                      <td className="py-3 font-medium max-w-[280px] truncate pr-4">{log.filename}</td>
                      <td className="py-3 font-semibold text-primary">{log.chunks_count} chunks</td>
                      <td className="py-3 text-slate-500">{log.date}</td>
                      <td className="py-3 text-right">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                          compiled
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Status Summary */}
      <div className="w-full md:w-80 flex flex-col gap-6 shrink-0 max-h-full overflow-y-auto">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-md font-bold mb-4 font-display">Ingestion Engine Settings</h3>
          <div className="space-y-4 text-sm">
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-slate-500">Parser Model</span>
              <span className="font-semibold">{status?.parser_provider || "unstructured"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-slate-500">Chunking Strategy</span>
              <span className="font-semibold">{status?.chunker_provider || "semantic"}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-slate-500">DB Schema Collection</span>
              <span className="font-semibold">{status?.collection_name || "documents"}</span>
            </div>
            <div className="flex justify-between pb-1">
              <span className="text-slate-500">Indexing Engine</span>
              <span className="font-semibold text-accent">{status?.vector_store_provider || "qdrant"}</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-md font-bold mb-2 font-display text-primary">Semantic Ingestion</h3>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            The Semantic Chunker uses dense embeddings to identify natural transitions in text. Rather than breaking text
            arbitrarily at character counts, it calculates embedding similarity across adjacent sentences to keep coherent
            topics intact.
          </p>
        </div>
      </div>
    </div>
  );
}

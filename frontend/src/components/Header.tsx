import React from "react";
import { RAGStatus } from "../types";

interface HeaderProps {
  activePage: "chat" | "ingest" | "config";
  status: RAGStatus | null;
}

export function Header({ activePage, status }: HeaderProps) {
  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-8 z-10 shrink-0">
      <div>
        <h1 className="text-lg font-bold font-display">
          {activePage === "chat" && "Assistant Chat Dashboard"}
          {activePage === "ingest" && "Knowledge Base Ingest"}
          {activePage === "config" && "Pipeline Configuration Settings"}
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {status?.mock_mode
            ? "Sandbox Mode Active — simulating RAG actions"
            : `Generic Engine Tier: ${status?.environment || "Development"}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold px-3 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-800 rounded-md shadow-sm">
          Vectors: {status?.chunk_count ?? 0} Chunks
        </span>
      </div>
    </header>
  );
}

import { Sliders, ChevronDown, ChevronUp } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface EmbeddingsConfigCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function EmbeddingsConfigCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: EmbeddingsConfigCardProps) {
  const isExpanded = !!expandedSections["embeddings-advanced"];
  const provider = configData.embeddings?.provider || "openai";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:shadow-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-sm font-display flex items-center gap-2">
            <Sliders size={16} className="text-primary" />
            Embedding Model
          </h3>
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">Embeddings</span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              Embeddings Provider
              <InfoTooltip text="Vector embeddings generation provider." />
            </label>
            <select
              value={provider}
              onChange={(e) => handleUpdateConfigValue(["embeddings", "provider"], e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            >
              <option value="openai">OpenAI Embedder</option>
              <option value="cohere">Cohere Embedder</option>
              <option value="local">Local sentence-transformers</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              Embedding Model Name
              <InfoTooltip text="Identifier representing the embedding model (e.g. text-embedding-3-small or sentence-transformers/all-MiniLM-L6-v2)." />
            </label>
            <input
              type="text"
              value={
                provider === "local"
                  ? configData.embeddings?.config?.model_name || ""
                  : configData.embeddings?.config?.model || ""
              }
              onChange={(e) => {
                const path = provider === "local" ? "model_name" : "model";
                handleUpdateConfigValue(["embeddings", "config", path], e.target.value);
              }}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Settings */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
        <button
          type="button"
          onClick={() => toggleSection("embeddings-advanced")}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
        >
          <span>Advanced Settings</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            {provider === "local" && (
              <div className="flex flex-col gap-1.5 animate-fade-in">
                <label className="text-[11px] font-semibold flex items-center gap-1">
                  Device Execution Target
                  <InfoTooltip text="Hardware device running the sentence transformer (cpu or cuda)." />
                </label>
                <select
                  value={configData.embeddings?.config?.device || "cpu"}
                  onChange={(e) => handleUpdateConfigValue(["embeddings", "config", "device"], e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                >
                  <option value="cpu">CPU Only</option>
                  <option value="cuda">CUDA GPU</option>
                  <option value="mps">MPS (Apple Silicon)</option>
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Embedding API Key
                <InfoTooltip text="API Authorization Key for embeddings models." />
              </label>
              <input
                type="password"
                placeholder="••••••••••••••••"
                value={configData.embeddings?.config?.api_key || ""}
                onChange={(e) => handleUpdateConfigValue(["embeddings", "config", "api_key"], e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

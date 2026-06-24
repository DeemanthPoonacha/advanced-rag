import { Sliders, ChevronDown, ChevronUp } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface RetrievalConfigCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function RetrievalConfigCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: RetrievalConfigCardProps) {
  const isExpanded = !!expandedSections["retrieval-advanced"];
  const strategy = configData.retrieval?.strategy || "simple";
  const topK = configData.retrieval?.top_k || 5;
  const similarityThreshold = configData.retrieval?.similarity_threshold || 0.0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:shadow-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-sm font-display flex items-center gap-2">
            <Sliders size={16} className="text-primary" />
            Search & Retrieval
          </h3>
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">
            Retrieval
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              Search Strategy
              <InfoTooltip text="Retrieval logic. Simple queries dense index; Multi-Query expands with LLM prompts." />
            </label>
            <select
              value={strategy}
              onChange={(e) =>
                handleUpdateConfigValue(
                  ["retrieval", "strategy"],
                  e.target.value,
                )
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            >
              <option value="simple">Simple Dense Search</option>
              <option value="multi_query">Multi-Query Expansion</option>
              <option value="contextual_compression">
                Contextual Compression
              </option>
              <option value="auto_merging">Auto-Merging Retrieval</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1">
                Top K Chunks
                <InfoTooltip text="Maximum number of matched document vectors retrieved to inject into prompt context." />
              </span>
              <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                {topK}
              </span>
            </label>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={topK}
              onChange={(e) =>
                handleUpdateConfigValue(
                  ["retrieval", "top_k"],
                  parseInt(e.target.value),
                )
              }
              className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Settings */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
        <button
          type="button"
          onClick={() => toggleSection("retrieval-advanced")}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
        >
          <span>Advanced Settings</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1">
                  Similarity Threshold
                  <InfoTooltip text="Minimum cosine similarity score required for chunks to be retrieved." />
                </span>
                <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                  {similarityThreshold.toFixed(2)}
                </span>
              </label>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={similarityThreshold}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["retrieval", "similarity_threshold"],
                    parseFloat(e.target.value),
                  )
                }
                className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

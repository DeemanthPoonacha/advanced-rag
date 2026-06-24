import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface GenerationConfigCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function GenerationConfigCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: GenerationConfigCardProps) {
  const isExpanded = !!expandedSections["generation-advanced"];
  const systemPrompt = configData.generation?.system_prompt || "";
  const promptTemplate = configData.generation?.prompt_template || "";
  const maxContextChunks = configData.generation?.max_context_chunks ?? 5;
  const includeSources = configData.generation?.include_sources ?? true;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:shadow-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-sm font-display flex items-center gap-2">
            <Sparkles size={16} className="text-primary animate-pulse" />
            Answer Generation
          </h3>
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">
            Synthesis
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              System Prompt Override
              <InfoTooltip text="System instructions fed to the LLM prior to generating answers." />
            </label>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) =>
                handleUpdateConfigValue(
                  ["generation", "system_prompt"],
                  e.target.value,
                )
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 resize-none font-sans transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Settings */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
        <button
          type="button"
          onClick={() => toggleSection("generation-advanced")}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
        >
          <span>Advanced Settings</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Prompt Template
                <InfoTooltip text="Formatting template injecting context and query variables into the user completion prompt." />
              </label>
              <textarea
                rows={3}
                value={promptTemplate}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["generation", "prompt_template"],
                    e.target.value,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-[10px] font-mono focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 resize-none transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1">
                  Max Context Chunks
                  <InfoTooltip text="Maximum number of context chunks fed to the LLM." />
                </span>
                <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                  {maxContextChunks}
                </span>
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={maxContextChunks}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["generation", "max_context_chunks"],
                    parseInt(e.target.value),
                  )
                }
                className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold">
                  Include Sources
                </span>
                <span className="text-[8px] text-slate-400 dark:text-slate-500">
                  Inject reference metadata into response models
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSources}
                  onChange={(e) =>
                    handleUpdateConfigValue(
                      ["generation", "include_sources"],
                      e.target.checked,
                    )
                  }
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-all"></div>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

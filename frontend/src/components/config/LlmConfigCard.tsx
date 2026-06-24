import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface LlmConfigCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function LlmConfigCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: LlmConfigCardProps) {
  const isExpanded = !!expandedSections["llm-advanced"];
  const temp = configData.llm?.config?.temperature ?? 0.1;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:shadow-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-sm font-display flex items-center gap-2">
            <Sparkles size={16} className="text-primary animate-pulse" />
            LLM & Completions
          </h3>
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">
            LLM
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              LLM Provider
              <InfoTooltip text="Large Language Model hosting API endpoint provider." />
            </label>
            <select
              value={configData.llm?.provider || "openai"}
              onChange={(e) =>
                handleUpdateConfigValue(["llm", "provider"], e.target.value)
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            >
              <option value="openai">OpenAI GPT</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="cohere">Cohere Command</option>
              <option value="local">Local Transformer / Ollama</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              Model Identifier
              <InfoTooltip text="Specific model tag running completions (e.g. gpt-4o-mini, llama3.2:1b)." />
            </label>
            <input
              type="text"
              value={configData.llm?.config?.model || ""}
              onChange={(e) =>
                handleUpdateConfigValue(
                  ["llm", "config", "model"],
                  e.target.value,
                )
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Settings */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
        <button
          type="button"
          onClick={() => toggleSection("llm-advanced")}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
        >
          <span>Advanced Settings</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1">
                  Temperature (Creativity)
                  <InfoTooltip text="Creativity controller. 0.0 is deterministic; 1.0 is creative." />
                </span>
                <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                  {temp.toFixed(2)}
                </span>
              </label>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={temp}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["llm", "config", "temperature"],
                    parseFloat(e.target.value),
                  )
                }
                className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer hover:bg-slate-350 dark:hover:bg-slate-700 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                LLM Base URL
                <InfoTooltip text="The API base endpoint URL (required for local/Ollama setups)." />
              </label>
              <input
                type="text"
                placeholder={
                  configData.llm?.provider === "local"
                    ? "http://localhost:11434/v1"
                    : "https://api.openai.com/v1"
                }
                value={configData.llm?.config?.base_url || ""}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["llm", "config", "base_url"],
                    e.target.value,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                API Authorization Key
                <InfoTooltip text="Secret token key used to authorize API generation calls." />
              </label>
              <input
                type="password"
                placeholder="••••••••••••••••"
                value={configData.llm?.config?.api_key || ""}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["llm", "config", "api_key"],
                    e.target.value,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface SafetyConfigCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function SafetyConfigCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: SafetyConfigCardProps) {
  const isExpanded = !!expandedSections["safety-advanced"];
  const guardrailsEnabled = configData.guardrails?.enabled ?? true;
  const evaluationEnabled = configData.evaluation?.enabled ?? false;
  const inputProvider = configData.guardrails?.input?.provider || "llama_guard";
  const outputProvider =
    configData.guardrails?.output?.provider || "llama_guard";
  const evalProvider = configData.evaluation?.provider || "ragas";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:shadow-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-sm font-display flex items-center gap-2">
            <ShieldAlert size={16} className="text-primary" />
            Guardrails & Evaluation
          </h3>
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">
            Safety
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold">
                Enable Guardrails
              </span>
              <span className="text-[8px] text-slate-400 dark:text-slate-500">
                Filter queries and answers against safety policies
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={guardrailsEnabled}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["guardrails", "enabled"],
                    e.target.checked,
                  )
                }
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-all"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold">
                Enable Evaluation
              </span>
              <span className="text-[8px] text-slate-400 dark:text-slate-500">
                Compute faithfulness/relevance metrics
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={evaluationEnabled}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["evaluation", "enabled"],
                    e.target.checked,
                  )
                }
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-all"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Settings */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
        <button
          type="button"
          onClick={() => toggleSection("safety-advanced")}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
        >
          <span>Advanced Settings</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Input Guardrail Provider
                <InfoTooltip text="Checks user input queries for unsafe prompts." />
              </label>
              <select
                value={inputProvider}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["guardrails", "input", "provider"],
                    e.target.value,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              >
                <option value="llama_guard">Llama Guard Classifier</option>
                <option value="nemo">NVIDIA NeMo Guardrails</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Output Guardrail Provider
                <InfoTooltip text="Checks synthesized answers prior to output." />
              </label>
              <select
                value={outputProvider}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["guardrails", "output", "provider"],
                    e.target.value,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              >
                <option value="llama_guard">Llama Guard Classifier</option>
                <option value="nemo">NVIDIA NeMo Guardrails</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Evaluation Framework Provider
                <InfoTooltip text="Automated evaluation framework engine." />
              </label>
              <select
                value={evalProvider}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["evaluation", "provider"],
                    e.target.value,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              >
                <option value="ragas">Ragas framework</option>
                <option value="trulens">TruLens toolchain</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

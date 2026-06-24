import { Settings as SettingsIcon, ChevronDown, ChevronUp } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface GeneralSettingsCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function GeneralSettingsCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: GeneralSettingsCardProps) {
  const isExpanded = !!expandedSections["project-advanced"];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:shadow-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-sm font-display flex items-center gap-2">
            <SettingsIcon
              size={16}
              className="text-primary animate-spin-slow"
            />
            General & Project Settings
          </h3>
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">
            Project
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              Pipeline Project Name
              <InfoTooltip text="Unique name identifying this RAG pipeline in logs and metrics." />
            </label>
            <input
              type="text"
              value={configData.project?.name || ""}
              onChange={(e) =>
                handleUpdateConfigValue(["project", "name"], e.target.value)
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              Environment Tier
              <InfoTooltip text="System runtime environment tier (determines tracing levels)." />
            </label>
            <select
              value={configData.project?.environment || "development"}
              onChange={(e) =>
                handleUpdateConfigValue(
                  ["project", "environment"],
                  e.target.value,
                )
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            >
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Settings */}
      <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
        <button
          type="button"
          onClick={() => toggleSection("project-advanced")}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
        >
          <span>Advanced Settings</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Project Version
                <InfoTooltip text="Project version identifier." />
              </label>
              <input
                type="text"
                value={configData.project?.version || ""}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["project", "version"],
                    e.target.value,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Ingestion Batch Size
                <InfoTooltip text="Number of chunks embedded concurrently in a single forward pass batch." />
              </label>
              <input
                type="number"
                value={configData.ingestion?.batch_size ?? 10}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["ingestion", "batch_size"],
                    parseInt(e.target.value) || 10,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Document Parser Provider
                <InfoTooltip text="Raw file parser algorithm (unstructured handles local; llamaparse is cloud-based; multimodal_unstructured extracts layout elements/tables/images)." />
              </label>
              <select
                value={configData.ingestion?.parser?.provider || "unstructured"}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["ingestion", "parser", "provider"],
                    e.target.value,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              >
                <option value="unstructured">Unstructured.io Parser</option>
                <option value="llamaparse">LlamaParse Cloud API</option>
                <option value="multimodal_unstructured">
                  Multimodal Unstructured Parser
                </option>
              </select>
            </div>

            {/* Conditional Parser Config */}
            {(configData.ingestion?.parser?.provider === "unstructured" ||
              configData.ingestion?.parser?.provider ===
                "multimodal_unstructured") && (
              <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Parser Config
                </h4>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold flex items-center gap-1">
                    Parsing Strategy
                    <InfoTooltip text="Parsing strategy. hi_res parses structures like tables/images; fast is simple text; ocr_only runs OCR." />
                  </label>
                  <select
                    value={
                      configData.ingestion?.parser?.config?.strategy || "hi_res"
                    }
                    onChange={(e) =>
                      handleUpdateConfigValue(
                        ["ingestion", "parser", "config", "strategy"],
                        e.target.value,
                      )
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                  >
                    <option value="hi_res">Hi-Res Structure Extract</option>
                    <option value="fast">Fast Raw Text</option>
                    <option value="ocr_only">OCR Only (Scans)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold">
                      Extract Images
                    </span>
                    <span className="text-[8px] text-slate-400 dark:text-slate-500">
                      Attempt to partition and extract inline images
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        configData.ingestion?.parser?.config?.extract_images ??
                        configData.ingestion?.parser?.provider ===
                          "multimodal_unstructured"
                      }
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["ingestion", "parser", "config", "extract_images"],
                          e.target.checked,
                        )
                      }
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-all"></div>
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold flex items-center gap-1">
                    Languages (ISO codes, comma-separated)
                    <InfoTooltip text="Languages to use for OCR text extraction (e.g. en,de)." />
                  </label>
                  <input
                    type="text"
                    value={(
                      configData.ingestion?.parser?.config?.languages || ["en"]
                    ).join(", ")}
                    onChange={(e) => {
                      const list = e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean);
                      handleUpdateConfigValue(
                        ["ingestion", "parser", "config", "languages"],
                        list,
                      );
                    }}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                  />
                </div>
              </div>
            )}

            {configData.ingestion?.parser?.provider === "llamaparse" && (
              <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  LlamaParse Config
                </h4>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold flex items-center gap-1">
                    Llama Cloud API Key
                    <InfoTooltip text="Your personal Llama Cloud/LlamaParse token key." />
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••••••"
                    value={configData.ingestion?.parser?.config?.api_key || ""}
                    onChange={(e) =>
                      handleUpdateConfigValue(
                        ["ingestion", "parser", "config", "api_key"],
                        e.target.value,
                      )
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                  />
                </div>

                <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-semibold">
                      Premium Mode
                    </span>
                    <span className="text-[8px] text-slate-400 dark:text-slate-500">
                      Run premium parsing algorithms for highest quality
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        configData.ingestion?.parser?.config?.premium_mode ??
                        false
                      }
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["ingestion", "parser", "config", "premium_mode"],
                          e.target.checked,
                        )
                      }
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-all"></div>
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold flex items-center gap-1">
                    Natural Language Instructions
                    <InfoTooltip text="Custom instructions directing the LLM parser on formatting or specific element extraction." />
                  </label>
                  <textarea
                    rows={2}
                    value={
                      configData.ingestion?.parser?.config
                        ?.parsing_instruction || ""
                    }
                    onChange={(e) =>
                      handleUpdateConfigValue(
                        [
                          "ingestion",
                          "parser",
                          "config",
                          "parsing_instruction",
                        ],
                        e.target.value,
                      )
                    }
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 resize-none font-sans transition-colors"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

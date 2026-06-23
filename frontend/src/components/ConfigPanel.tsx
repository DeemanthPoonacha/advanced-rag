import { useState } from "react";
import { InfoTooltip } from "./ui/Tooltip";
import { PipelineConfig } from "../types";
import { ChevronDown, ChevronUp, Sliders, Eye, ShieldAlert, Sparkles, Settings as SettingsIcon, Database } from "lucide-react";

interface ConfigPanelProps {
  configData: PipelineConfig | null;
  rawYaml: string;
  setRawYaml: (val: string) => void;
  editMode: "visual" | "yaml";
  setEditMode: (mode: "visual" | "yaml") => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
  handleSaveConfig: () => Promise<void>;
  fetchConfig: () => Promise<void>;
}

export function ConfigPanel({
  configData,
  rawYaml,
  setRawYaml,
  editMode,
  setEditMode,
  handleUpdateConfigValue,
  handleSaveConfig,
  fetchConfig,
}: ConfigPanelProps) {
  // State to track expanded sections for advanced config keys
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-7xl w-full mx-auto overflow-hidden">
      {/* Editor Switcher (Form vs YAML) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
        <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-sm self-start">
          <button
            onClick={() => setEditMode("visual")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              editMode === "visual"
                ? "bg-primary text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-250 dark:hover:bg-slate-800"
            }`}
          >
            Visual Config Grid
          </button>
          <button
            onClick={() => setEditMode("yaml")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              editMode === "yaml"
                ? "bg-primary text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-250 dark:hover:bg-slate-800"
            }`}
          >
            Raw YAML Block
          </button>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={fetchConfig}
            className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Reset Changes
          </button>
          <button
            onClick={handleSaveConfig}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/95 text-white shadow-md shadow-primary/20 transition cursor-pointer"
          >
            Apply & Rebuild Pipeline
          </button>
        </div>
      </div>

      {/* Sub-window */}
      <div className="flex-1 overflow-hidden">
        {editMode === "visual" ? (
          configData ? (
            <div className="h-full overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6 scrollbar-thin">
              
              {/* Card 1: Project & General Settings */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm font-display flex items-center gap-2">
                      <SettingsIcon size={16} className="text-primary" />
                      General & Project Settings
                    </h3>
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">Project</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Pipeline Project Name
                        <InfoTooltip text="Unique name identifying this RAG pipeline in logs and metrics." />
                      </label>
                      <input
                        type="text"
                        value={configData.project?.name || ""}
                        onChange={(e) => handleUpdateConfigValue(["project", "name"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Environment Tier
                        <InfoTooltip text="System runtime environment tier (determines tracing levels)." />
                      </label>
                      <select
                        value={configData.project?.environment || "development"}
                        onChange={(e) => handleUpdateConfigValue(["project", "environment"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
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
                    {expandedSections["project-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["project-advanced"] && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Project Version
                          <InfoTooltip text="Project version identifier." />
                        </label>
                        <input
                          type="text"
                          value={configData.project?.version || ""}
                          onChange={(e) => handleUpdateConfigValue(["project", "version"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Ingestion Batch Size
                          <InfoTooltip text="Number of chunks embedded concurrently in a single forward pass batch." />
                        </label>
                        <input
                          type="number"
                          value={configData.ingestion?.batch_size ?? 10}
                          onChange={(e) => handleUpdateConfigValue(["ingestion", "batch_size"], parseInt(e.target.value) || 10)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Document Parser Provider
                          <InfoTooltip text="Raw file parser algorithm (unstructured handles local; llamaparse is cloud-based; multimodal_unstructured extracts layout elements/tables/images)." />
                        </label>
                        <select
                          value={configData.ingestion?.parser?.provider || "unstructured"}
                          onChange={(e) => handleUpdateConfigValue(["ingestion", "parser", "provider"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        >
                          <option value="unstructured">Unstructured.io Parser</option>
                          <option value="llamaparse">LlamaParse Cloud API</option>
                          <option value="multimodal_unstructured">Multimodal Unstructured Parser</option>
                        </select>
                      </div>

                      {/* Conditional Parser Config */}
                      {(configData.ingestion?.parser?.provider === "unstructured" ||
                        configData.ingestion?.parser?.provider === "multimodal_unstructured") && (
                        <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Parser Config</h4>
                          
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center">
                              Parsing Strategy
                              <InfoTooltip text="Parsing strategy. hi_res parses structures like tables/images; fast is simple text; ocr_only runs OCR." />
                            </label>
                            <select
                              value={configData.ingestion?.parser?.config?.strategy || "hi_res"}
                              onChange={(e) => handleUpdateConfigValue(["ingestion", "parser", "config", "strategy"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                            >
                              <option value="hi_res">Hi-Res Structure Extract</option>
                              <option value="fast">Fast Raw Text</option>
                              <option value="ocr_only">OCR Only (Scans)</option>
                            </select>
                          </div>

                          <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-semibold">Extract Images</span>
                              <span className="text-[8px] text-slate-400 dark:text-slate-500">Attempt to partition and extract inline images</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={configData.ingestion?.parser?.config?.extract_images ?? (configData.ingestion?.parser?.provider === "multimodal_unstructured")}
                                onChange={(e) => handleUpdateConfigValue(["ingestion", "parser", "config", "extract_images"], e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center">
                              Languages (ISO codes, comma-separated)
                              <InfoTooltip text="Languages to use for OCR text extraction (e.g. en,de)." />
                            </label>
                            <input
                              type="text"
                              value={(configData.ingestion?.parser?.config?.languages || ["en"]).join(", ")}
                              onChange={(e) => {
                                const list = e.target.value.split(",").map(x => x.trim()).filter(Boolean);
                                handleUpdateConfigValue(["ingestion", "parser", "config", "languages"], list);
                              }}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        </div>
                      )}

                      {configData.ingestion?.parser?.provider === "llamaparse" && (
                        <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">LlamaParse Config</h4>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center">
                              Llama Cloud API Key
                              <InfoTooltip text="Your personal Llama Cloud/LlamaParse token key." />
                            </label>
                            <input
                              type="password"
                              placeholder="••••••••••••••••"
                              value={configData.ingestion?.parser?.config?.api_key || ""}
                              onChange={(e) => handleUpdateConfigValue(["ingestion", "parser", "config", "api_key"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-semibold">Premium Mode</span>
                              <span className="text-[8px] text-slate-400 dark:text-slate-500">Run premium parsing algorithms for highest quality</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={configData.ingestion?.parser?.config?.premium_mode ?? false}
                                onChange={(e) => handleUpdateConfigValue(["ingestion", "parser", "config", "premium_mode"], e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center">
                              Natural Language Instructions
                              <InfoTooltip text="Custom instructions directing the LLM parser on formatting or specific element extraction." />
                            </label>
                            <textarea
                              rows={2}
                              value={configData.ingestion?.parser?.config?.parsing_instruction || ""}
                              onChange={(e) => handleUpdateConfigValue(["ingestion", "parser", "config", "parsing_instruction"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 resize-none font-sans"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: LLM Configuration */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm font-display flex items-center gap-2">
                      <Sparkles size={16} className="text-primary" />
                      LLM & Completions
                    </h3>
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">LLM</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        LLM Provider
                        <InfoTooltip text="Large Language Model hosting API endpoint provider." />
                      </label>
                      <select
                        value={configData.llm?.provider || "openai"}
                        onChange={(e) => handleUpdateConfigValue(["llm", "provider"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      >
                        <option value="openai">OpenAI GPT</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="cohere">Cohere Command</option>
                        <option value="local">Local Transformer / Ollama</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        LLM Base URL
                        <InfoTooltip text="The API base endpoint URL (required for local/Ollama setups)." />
                      </label>
                      <input
                        type="text"
                        placeholder={configData.llm?.provider === "local" ? "http://localhost:11434/v1" : "https://api.openai.com/v1"}
                        value={configData.llm?.config?.base_url || ""}
                        onChange={(e) => handleUpdateConfigValue(["llm", "config", "base_url"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Model Identifier
                        <InfoTooltip text="Specific model tag running completions (e.g. gpt-4o-mini, llama3.2:1b)." />
                      </label>
                      <input
                        type="text"
                        value={configData.llm?.config?.model || ""}
                        onChange={(e) => handleUpdateConfigValue(["llm", "config", "model"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center justify-between">
                        <span className="flex items-center">
                          Temperature (Creativity)
                          <InfoTooltip text="Creativity controller. 0.0 is deterministic; 1.0 is creative." />
                        </span>
                        <span className="font-mono text-[11px] font-bold text-primary">
                          {(configData.llm?.config?.temperature ?? 0.1).toFixed(2)}
                        </span>
                      </label>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={configData.llm?.config?.temperature ?? 0.1}
                        onChange={(e) =>
                          handleUpdateConfigValue(["llm", "config", "temperature"], parseFloat(e.target.value))
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
                    onClick={() => toggleSection("llm-advanced")}
                    className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
                  >
                    <span>Advanced Settings</span>
                    {expandedSections["llm-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["llm-advanced"] && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          API Authorization Key
                          <InfoTooltip text="Secret token key used to authorize API generation calls." />
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••••••••••"
                          value={configData.llm?.config?.api_key || ""}
                          onChange={(e) => handleUpdateConfigValue(["llm", "config", "api_key"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Ingestion Splitter / Chunker */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm font-display flex items-center gap-2">
                      <Sliders size={16} className="text-primary" />
                      Ingestion Splitter
                    </h3>
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">Chunker</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Splitting Strategy
                        <InfoTooltip text="Splitting algorithm. Semantic uses sentence differences; Recursive uses character counters; Multimodal Summarizer uses vision models." />
                      </label>
                      <select
                        value={configData.ingestion?.chunker?.provider || "semantic"}
                        onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "provider"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      >
                        <option value="semantic">Semantic Chunker</option>
                        <option value="recursive">Recursive Character</option>
                        <option value="hierarchical">Hierarchical Parent-Child</option>
                        <option value="multimodal_summarizer">Multimodal Summarizer Chunker</option>
                      </select>
                    </div>

                    {/* Conditional Chunker Config (Main Controls) */}
                    {configData.ingestion?.chunker?.provider === "semantic" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Max Chunk Size (Chars)
                              <InfoTooltip text="Maximum character size limit for a single semantic chunk." />
                            </span>
                            <span className="font-mono text-[11px] font-bold text-primary">
                              {configData.ingestion?.chunker?.config?.max_chunk_size ?? 1024}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="100"
                            max="2048"
                            step="64"
                            value={configData.ingestion?.chunker?.config?.max_chunk_size ?? 1024}
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "chunker", "config", "max_chunk_size"],
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Breakpoint Threshold
                              <InfoTooltip text="Distance threshold for semantic splits (higher = more chunks)." />
                            </span>
                            <span className="font-mono text-[11px] font-bold text-primary">
                              {(configData.ingestion?.chunker?.config?.breakpoint_threshold ?? 0.7).toFixed(2)}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={configData.ingestion?.chunker?.config?.breakpoint_threshold ?? 0.7}
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "chunker", "config", "breakpoint_threshold"],
                                parseFloat(e.target.value)
                              )
                            }
                            className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </>
                    )}

                    {configData.ingestion?.chunker?.provider === "recursive" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Max Chunk Size (Chars)
                              <InfoTooltip text="Maximum characters per chunk." />
                            </span>
                            <span className="font-mono text-[11px] font-bold text-primary">
                              {configData.ingestion?.chunker?.config?.max_chunk_size ?? 1024}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="100"
                            max="2048"
                            step="64"
                            value={configData.ingestion?.chunker?.config?.max_chunk_size ?? 1024}
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "chunker", "config", "max_chunk_size"],
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Chunk Overlap (Chars)
                              <InfoTooltip text="Overlap characters between successive chunks to keep context." />
                            </span>
                            <span className="font-mono text-[11px] font-bold text-primary">
                              {configData.ingestion?.chunker?.config?.chunk_overlap ?? 200}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1000"
                            step="20"
                            value={configData.ingestion?.chunker?.config?.chunk_overlap ?? 200}
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "chunker", "config", "chunk_overlap"],
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </>
                    )}

                    {configData.ingestion?.chunker?.provider === "hierarchical" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Parent Chunk Size
                              <InfoTooltip text="Maximum character size of parent chunks." />
                            </span>
                            <span className="font-mono text-[11px] font-bold text-primary">
                              {configData.ingestion?.chunker?.config?.parent_chunk_size ?? 2048}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="200"
                            max="4096"
                            step="128"
                            value={configData.ingestion?.chunker?.config?.parent_chunk_size ?? 2048}
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "chunker", "config", "parent_chunk_size"],
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Child Chunk Size
                              <InfoTooltip text="Maximum character size of child chunks." />
                            </span>
                            <span className="font-mono text-[11px] font-bold text-primary">
                              {configData.ingestion?.chunker?.config?.child_chunk_size ?? 512}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="50"
                            max="1024"
                            step="32"
                            value={configData.ingestion?.chunker?.config?.child_chunk_size ?? 512}
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "chunker", "config", "child_chunk_size"],
                                parseInt(e.target.value)
                              )
                            }
                            className="w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </>
                    )}

                    {configData.ingestion?.chunker?.provider === "multimodal_summarizer" && (
                      <p className="text-xs text-slate-500 leading-normal border border-dashed border-slate-200 dark:border-slate-800 p-2.5 rounded-lg">
                        You have selected the Multimodal Summarizer directly. This chunker will summarize all document elements using vision language models. Configure parameters in the multimodal section below.
                      </p>
                    )}
                  </div>
                </div>

                {/* Collapsible Advanced Settings */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
                  <button
                    type="button"
                    onClick={() => toggleSection("chunker-advanced")}
                    className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
                  >
                    <span>Advanced & Multimodal Chunker Settings</span>
                    {expandedSections["chunker-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["chunker-advanced"] && (
                    <div className="space-y-4 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      {/* Chunker-specific advanced fields */}
                      {configData.ingestion?.chunker?.provider === "semantic" && (
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center justify-between">
                              <span className="flex items-center">
                                Min Chunk Size (Chars)
                                <InfoTooltip text="Minimum character size of a semantic chunk." />
                              </span>
                              <span className="font-mono text-[11px] font-bold text-primary">
                                {configData.ingestion?.chunker?.config?.min_chunk_size ?? 128}
                              </span>
                            </label>
                            <input
                              type="range"
                              min="10"
                              max="512"
                              step="10"
                              value={configData.ingestion?.chunker?.config?.min_chunk_size ?? 128}
                              onChange={(e) =>
                                handleUpdateConfigValue(
                                  ["ingestion", "chunker", "config", "min_chunk_size"],
                                  parseInt(e.target.value)
                                )
                              }
                              className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center justify-between">
                              <span className="flex items-center">
                                Semantic Buffer Size
                                <InfoTooltip text="Number of sentence lookaheads to evaluate semantic boundary splits." />
                              </span>
                              <span className="font-mono text-[11px] font-bold text-primary">
                                {configData.ingestion?.chunker?.config?.buffer_size ?? 1}
                              </span>
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="5"
                              step="1"
                              value={configData.ingestion?.chunker?.config?.buffer_size ?? 1}
                              onChange={(e) =>
                                handleUpdateConfigValue(
                                  ["ingestion", "chunker", "config", "buffer_size"],
                                  parseInt(e.target.value)
                                )
                              }
                              className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      )}

                      {configData.ingestion?.chunker?.provider === "recursive" && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                          Recursive character chunker recursively splits using a hierarchy of separators (paragraphs, sentences, words, etc.) to keep semantic blocks together.
                        </p>
                      )}

                      {configData.ingestion?.chunker?.provider === "hierarchical" && (
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center justify-between">
                              <span className="flex items-center">
                                Parent Overlap
                              </span>
                              <span className="font-mono text-[10px] font-bold text-primary">
                                {configData.ingestion?.chunker?.config?.parent_overlap ?? 256}
                              </span>
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="1024"
                              step="32"
                              value={configData.ingestion?.chunker?.config?.parent_overlap ?? 256}
                              onChange={(e) =>
                                handleUpdateConfigValue(
                                  ["ingestion", "chunker", "config", "parent_overlap"],
                                  parseInt(e.target.value)
                                )
                              }
                              className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center justify-between">
                              <span className="flex items-center">
                                Child Overlap
                              </span>
                              <span className="font-mono text-[10px] font-bold text-primary">
                                {configData.ingestion?.chunker?.config?.child_overlap ?? 64}
                              </span>
                            </label>
                            <input
                              type="range"
                              min="0"
                              max="256"
                              step="8"
                              value={configData.ingestion?.chunker?.config?.child_overlap ?? 64}
                              onChange={(e) =>
                                handleUpdateConfigValue(
                                  ["ingestion", "chunker", "config", "child_overlap"],
                                  parseInt(e.target.value)
                                )
                              }
                              className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>
                      )}

                      {/* Multimodal Vision Summarizer Global Section */}
                      <div className="space-y-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Multimodal Summarizer Config</h4>
                          <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-extrabold tracking-widest uppercase">Vision</span>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center">
                            LLM Model Name
                            <InfoTooltip text="Vision Model identifier used to summarize tables and images (e.g. gpt-4o, gpt-4o-mini)." />
                          </label>
                          <input
                            type="text"
                            value={configData.ingestion?.multimodal_summarizer?.model_name || "gpt-4o"}
                            onChange={(e) => handleUpdateConfigValue(["ingestion", "multimodal_summarizer", "model_name"], e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Temperature
                              <InfoTooltip text="Generation temperature settings for Vision summaries." />
                            </span>
                            <span className="font-mono text-[10px] font-bold text-primary">
                              {(configData.ingestion?.multimodal_summarizer?.temperature ?? 0.0).toFixed(2)}
                            </span>
                          </label>
                          <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.05"
                            value={configData.ingestion?.multimodal_summarizer?.temperature ?? 0.0}
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "multimodal_summarizer", "temperature"],
                                parseFloat(e.target.value)
                              )
                            }
                            className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center">
                            API authorization Key (optional)
                            <InfoTooltip text="Vision Model authorization API Key. Overrides global keys." />
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••••••••••"
                            value={configData.ingestion?.multimodal_summarizer?.api_key || ""}
                            onChange={(e) => handleUpdateConfigValue(["ingestion", "multimodal_summarizer", "api_key"], e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center">
                            API Base URL (optional)
                            <InfoTooltip text="Vision Model connection endpoint URL base." />
                          </label>
                          <input
                            type="text"
                            placeholder="https://api.openai.com/v1"
                            value={configData.ingestion?.multimodal_summarizer?.base_url || ""}
                            onChange={(e) => handleUpdateConfigValue(["ingestion", "multimodal_summarizer", "base_url"], e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 4: Embedding Model Settings */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
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
                      <label className="text-xs font-semibold flex items-center">
                        Embeddings Provider
                        <InfoTooltip text="Vector embeddings generation provider." />
                      </label>
                      <select
                        value={configData.embeddings?.provider || "openai"}
                        onChange={(e) => handleUpdateConfigValue(["embeddings", "provider"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      >
                        <option value="openai">OpenAI Embedder</option>
                        <option value="cohere">Cohere Embedder</option>
                        <option value="local">Local sentence-transformers</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Embedding Model Name
                        <InfoTooltip text="Identifier representing the embedding model (e.g. text-embedding-3-small or sentence-transformers/all-MiniLM-L6-v2)." />
                      </label>
                      <input
                        type="text"
                        value={
                          configData.embeddings?.provider === "local"
                            ? configData.embeddings?.config?.model_name || ""
                            : configData.embeddings?.config?.model || ""
                        }
                        onChange={(e) => {
                          const path = configData.embeddings?.provider === "local" ? "model_name" : "model";
                          handleUpdateConfigValue(["embeddings", "config", path], e.target.value);
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
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
                    {expandedSections["embeddings-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["embeddings-advanced"] && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      {configData.embeddings?.provider === "local" && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center">
                            Device Execution Target
                            <InfoTooltip text="Hardware device running the sentence transformer (cpu or cuda)." />
                          </label>
                          <select
                            value={configData.embeddings?.config?.device || "cpu"}
                            onChange={(e) => handleUpdateConfigValue(["embeddings", "config", "device"], e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                          >
                            <option value="cpu">CPU Only</option>
                            <option value="cuda">CUDA GPU</option>
                            <option value="mps">MPS (Apple Silicon)</option>
                          </select>
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Embedding API Key
                          <InfoTooltip text="API Authorization Key for embeddings models." />
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••••••••••"
                          value={configData.embeddings?.config?.api_key || ""}
                          onChange={(e) => handleUpdateConfigValue(["embeddings", "config", "api_key"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 5: Vector Database Configuration */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm font-display flex items-center gap-2">
                      <Database size={16} className="text-primary" />
                      Vector Database
                    </h3>
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">Database</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Vector Store Provider
                        <InfoTooltip text="Vector storage database provider." />
                      </label>
                      <select
                        value={configData.vector_store?.provider || "qdrant"}
                        onChange={(e) => handleUpdateConfigValue(["vector_store", "provider"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      >
                        <option value="qdrant">Qdrant Vector DB</option>
                        <option value="pinecone">Pinecone Cloud DB</option>
                        <option value="milvus">Milvus Database</option>
                        <option value="pgvector">PostgreSQL (pgvector)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Database Connection URL
                        <InfoTooltip text="Connection string / URL endpoint for the database client (e.g. http://localhost:6333)." />
                      </label>
                      <input
                        type="text"
                        placeholder="http://localhost:6333"
                        value={configData.vector_store?.config?.url || ""}
                        onChange={(e) => handleUpdateConfigValue(["vector_store", "config", "url"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Collection / Index Name
                        <InfoTooltip text="Database namespace collection or index name (synchronizes index_name and collection_name)." />
                      </label>
                      <input
                        type="text"
                        value={configData.vector_store?.config?.collection_name || configData.vector_store?.config?.index_name || ""}
                        onChange={(e) => {
                          handleUpdateConfigValue(["vector_store", "config", "collection_name"], e.target.value);
                          handleUpdateConfigValue(["vector_store", "config", "index_name"], e.target.value);
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>

                {/* Collapsible Advanced Settings */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
                  <button
                    type="button"
                    onClick={() => toggleSection("database-advanced")}
                    className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
                  >
                    <span>Advanced Settings</span>
                    {expandedSections["database-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["database-advanced"] && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Vector Dimensions Size
                          <InfoTooltip text="Size of the dense embedding vectors (must match output of selected embeddings model, e.g. 384 or 1536)." />
                        </label>
                        <input
                          type="number"
                          value={configData.vector_store?.config?.vector_size ?? 384}
                          onChange={(e) => handleUpdateConfigValue(["vector_store", "config", "vector_size"], parseInt(e.target.value) || 384)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      {configData.vector_store?.provider === "qdrant" && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-semibold">Prefer gRPC Protocol</span>
                            <span className="text-[8px] text-slate-400 dark:text-slate-500">Use gRPC port 6334 instead of HTTP</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={configData.vector_store?.config?.prefer_grpc ?? true}
                              onChange={(e) => handleUpdateConfigValue(["vector_store", "config", "prefer_grpc"], e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                          </label>
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Database Connection Key
                          <InfoTooltip text="API Authorization Key for cloud databases." />
                        </label>
                        <input
                          type="password"
                          placeholder="••••••••••••••••"
                          value={configData.vector_store?.config?.api_key || ""}
                          onChange={(e) => handleUpdateConfigValue(["vector_store", "config", "api_key"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 6: Search & Retrieval Engine */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm font-display flex items-center gap-2">
                      <Sliders size={16} className="text-primary" />
                      Search & Retrieval
                    </h3>
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">Retrieval</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Search Strategy
                        <InfoTooltip text="Retrieval logic. Simple queries dense index; Multi-Query expands with LLM prompts." />
                      </label>
                      <select
                        value={configData.retrieval?.strategy || "simple"}
                        onChange={(e) => handleUpdateConfigValue(["retrieval", "strategy"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      >
                        <option value="simple">Simple Dense Search</option>
                        <option value="multi_query">Multi-Query Expansion</option>
                        <option value="contextual_compression">Contextual Compression</option>
                        <option value="auto_merging">Auto-Merging Retrieval</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center justify-between">
                        <span className="flex items-center">
                          Top K Chunks
                          <InfoTooltip text="Maximum number of matched document vectors retrieved to inject into prompt context." />
                        </span>
                        <span className="font-mono text-[11px] font-bold text-primary">
                          {configData.retrieval?.top_k || 5}
                        </span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        value={configData.retrieval?.top_k || 5}
                        onChange={(e) => handleUpdateConfigValue(["retrieval", "top_k"], parseInt(e.target.value))}
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
                    {expandedSections["retrieval-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["retrieval-advanced"] && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center justify-between">
                          <span className="flex items-center">
                            Similarity Threshold
                            <InfoTooltip text="Minimum cosine similarity score required for chunks to be retrieved." />
                          </span>
                          <span className="font-mono text-[11px] font-bold text-primary">
                            {(configData.retrieval?.similarity_threshold || 0.0).toFixed(2)}
                          </span>
                        </label>
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.05"
                          value={configData.retrieval?.similarity_threshold || 0.0}
                          onChange={(e) =>
                            handleUpdateConfigValue(["retrieval", "similarity_threshold"], parseFloat(e.target.value))
                          }
                          className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 7: Answer Generation Settings */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm font-display flex items-center gap-2">
                      <Sparkles size={16} className="text-primary" />
                      Answer Generation
                    </h3>
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">Synthesis</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        System Prompt Override
                        <InfoTooltip text="System instructions fed to the LLM prior to generating answers." />
                      </label>
                      <textarea
                        rows={3}
                        value={configData.generation?.system_prompt || ""}
                        onChange={(e) => handleUpdateConfigValue(["generation", "system_prompt"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 resize-none font-sans"
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
                    {expandedSections["generation-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["generation-advanced"] && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Prompt Template
                          <InfoTooltip text="Formatting template injecting context and query variables into the user completion prompt." />
                        </label>
                        <textarea
                          rows={3}
                          value={configData.generation?.prompt_template || ""}
                          onChange={(e) => handleUpdateConfigValue(["generation", "prompt_template"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-[10px] font-mono focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 resize-none"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center justify-between">
                          <span className="flex items-center">
                            Max Context Chunks
                            <InfoTooltip text="Maximum number of context chunks fed to the LLM." />
                          </span>
                          <span className="font-mono text-[10px] font-bold text-primary">
                            {configData.generation?.max_context_chunks ?? 5}
                          </span>
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          step="1"
                          value={configData.generation?.max_context_chunks ?? 5}
                          onChange={(e) => handleUpdateConfigValue(["generation", "max_context_chunks"], parseInt(e.target.value))}
                          className="w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>

                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold">Include Sources</span>
                          <span className="text-[8px] text-slate-400 dark:text-slate-500">Inject reference metadata into response models</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={configData.generation?.include_sources ?? true}
                            onChange={(e) => handleUpdateConfigValue(["generation", "include_sources"], e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 8: Observability Settings */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm font-display flex items-center gap-2">
                      <Eye size={16} className="text-primary" />
                      Observability & Telemetry
                    </h3>
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">Metrics</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center">
                        Logging Severity Level
                        <InfoTooltip text="Determines the minimum severity level log messages must reach to be generated." />
                      </label>
                      <select
                        value={configData.observability?.logging?.level || "INFO"}
                        onChange={(e) => handleUpdateConfigValue(["observability", "logging", "level"], e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                      >
                        <option value="DEBUG">DEBUG</option>
                        <option value="INFO">INFO</option>
                        <option value="WARNING">WARNING</option>
                        <option value="ERROR">ERROR</option>
                        <option value="CRITICAL">CRITICAL</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold">Enable OTEL Tracing</span>
                        <span className="text-[8px] text-slate-400 dark:text-slate-500">Record structured traces across pipeline stages</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configData.observability?.tracing?.enabled ?? true}
                          onChange={(e) => handleUpdateConfigValue(["observability", "tracing", "enabled"], e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Collapsible Advanced Settings */}
                <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 mt-3">
                  <button
                    type="button"
                    onClick={() => toggleSection("observability-advanced")}
                    className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
                  >
                    <span>Advanced Settings</span>
                    {expandedSections["observability-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["observability-advanced"] && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Log Print Format
                          <InfoTooltip text="Log printing schema type." />
                        </label>
                        <select
                          value={configData.observability?.logging?.format || "json"}
                          onChange={(e) => handleUpdateConfigValue(["observability", "logging", "format"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        >
                          <option value="json">Structured JSON</option>
                          <option value="text">Human-Readable Text</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Logging Export Target
                          <InfoTooltip text="Destination target representing where generated logs are emitted." />
                        </label>
                        <select
                          value={configData.observability?.logging?.output || "stdout"}
                          onChange={(e) => handleUpdateConfigValue(["observability", "logging", "output"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        >
                          <option value="stdout">Standard Out (Console)</option>
                          <option value="file">Local Log File Target</option>
                        </select>
                      </div>

                      {configData.observability?.logging?.output === "file" && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center">
                            Log File Path
                            <InfoTooltip text="Absolute or relative file path target to output files." />
                          </label>
                          <input
                            type="text"
                            placeholder="logs/rag.log"
                            value={configData.observability?.logging?.file_path || ""}
                            onChange={(e) => handleUpdateConfigValue(["observability", "logging", "file_path"], e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Tracing Provider
                          <InfoTooltip text="Target telemetry pipeline receiver." />
                        </label>
                        <select
                          value={configData.observability?.tracing?.provider || "opentelemetry"}
                          onChange={(e) => handleUpdateConfigValue(["observability", "tracing", "provider"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        >
                          <option value="opentelemetry">OpenTelemetry Collector</option>
                          <option value="langsmith">LangSmith Endpoint</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Tracing Endpoint URL
                          <InfoTooltip text="HTTP/gRPC collector target url." />
                        </label>
                        <input
                          type="text"
                          value={configData.observability?.tracing?.endpoint || "http://localhost:4317"}
                          onChange={(e) => handleUpdateConfigValue(["observability", "tracing", "endpoint"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-semibold">Prometheus Metrics</span>
                          <span className="text-[8px] text-slate-400 dark:text-slate-500">Expose scraping endpoint for performance queries</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={configData.observability?.metrics?.enabled ?? true}
                            onChange={(e) => handleUpdateConfigValue(["observability", "metrics", "enabled"], e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Metrics Export Port
                          <InfoTooltip text="Listening port for scraper metrics (e.g. 9090)." />
                        </label>
                        <input
                          type="number"
                          value={configData.observability?.metrics?.port ?? 9090}
                          onChange={(e) => handleUpdateConfigValue(["observability", "metrics", "port"], parseInt(e.target.value) || 9090)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 9: Guardrails & Evaluation Settings */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm font-display flex items-center gap-2">
                      <ShieldAlert size={16} className="text-primary" />
                      Guardrails & Evaluation
                    </h3>
                    <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">Safety</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold">Enable Guardrails</span>
                        <span className="text-[8px] text-slate-400 dark:text-slate-500">Filter queries and answers against safety policies</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configData.guardrails?.enabled ?? true}
                          onChange={(e) => handleUpdateConfigValue(["guardrails", "enabled"], e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold">Enable Evaluation</span>
                        <span className="text-[8px] text-slate-400 dark:text-slate-500">Compute faithfulness/relevance metrics</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={configData.evaluation?.enabled ?? false}
                          onChange={(e) => handleUpdateConfigValue(["evaluation", "enabled"], e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
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
                    {expandedSections["safety-advanced"] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {expandedSections["safety-advanced"] && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Input Guardrail Provider
                          <InfoTooltip text="Checks user input queries for unsafe prompts." />
                        </label>
                        <select
                          value={configData.guardrails?.input?.provider || "llama_guard"}
                          onChange={(e) => handleUpdateConfigValue(["guardrails", "input", "provider"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        >
                          <option value="llama_guard">Llama Guard Classifier</option>
                          <option value="nemo">NVIDIA NeMo Guardrails</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Output Guardrail Provider
                          <InfoTooltip text="Checks synthesized answers prior to output." />
                        </label>
                        <select
                          value={configData.guardrails?.output?.provider || "llama_guard"}
                          onChange={(e) => handleUpdateConfigValue(["guardrails", "output", "provider"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        >
                          <option value="llama_guard">Llama Guard Classifier</option>
                          <option value="nemo">NVIDIA NeMo Guardrails</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center">
                          Evaluation Framework Provider
                          <InfoTooltip text="Automated evaluation framework engine." />
                        </label>
                        <select
                          value={configData.evaluation?.provider || "ragas"}
                          onChange={(e) => handleUpdateConfigValue(["evaluation", "provider"], e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100"
                        >
                          <option value="ragas">Ragas framework</option>
                          <option value="trulens">TruLens toolchain</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Loading configuration settings...
            </div>
          )
        ) : (
          <div className="h-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <textarea
              value={rawYaml}
              onChange={(e) => setRawYaml(e.target.value)}
              className="flex-1 w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs font-mono focus:outline-none focus:border-primary resize-none leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
}

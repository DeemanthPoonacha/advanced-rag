import React from "react";
import { InfoTooltip } from "./ui/Tooltip";
import { PipelineConfig } from "../types";

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
  return (
    <div className="flex-1 flex flex-col gap-6 max-w-5xl w-full mx-auto overflow-hidden">
      {/* Editor Switcher (Form vs YAML) */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-sm">
          <button
            onClick={() => setEditMode("visual")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              editMode === "visual"
                ? "bg-primary text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Visual Config Grid
          </button>
          <button
            onClick={() => setEditMode("yaml")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              editMode === "yaml"
                ? "bg-primary text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            Raw YAML Block
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={fetchConfig}
            className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Reset Changes
          </button>
          <button
            onClick={handleSaveConfig}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/20 transition"
          >
            Apply & Rebuild Pipeline
          </button>
        </div>
      </div>

      {/* Sub-window */}
      <div className="flex-1 overflow-hidden">
        {editMode === "visual" ? (
          configData ? (
            <div className="h-full overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
              {/* Card 1: General & Ingestion */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="font-bold text-md font-display">General & Project settings</h3>
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Project</span>
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
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center">
                      Environment Environment
                      <InfoTooltip text="System runtime environment tier (determines tracing levels)." />
                    </label>
                    <select
                      value={configData.project?.environment || "development"}
                      onChange={(e) => handleUpdateConfigValue(["project", "environment"], e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="production">Production</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Card 2: Chunker Splitter Settings */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="font-bold text-md font-display">Ingestion Splitter Settings</h3>
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Chunker</span>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center">
                      Splitting Strategy
                      <InfoTooltip text="Splitting algorithm. Semantic uses sentence differences; Recursive uses character counters." />
                    </label>
                    <select
                      value={configData.ingestion?.chunker?.provider || "semantic"}
                      onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "provider"], e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="semantic">Semantic Chunker</option>
                      <option value="recursive">Recursive Character</option>
                      <option value="hierarchical">Hierarchical Parent-Child</option>
                      <option value="fixed_size">Fixed Size Splitter</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center justify-between">
                      <span className="flex items-center">
                        Target Chunk Size (Chars)
                        <InfoTooltip text="Maximum number of characters per document vector chunk." />
                      </span>
                      <span className="font-mono text-[11px] font-bold text-primary">
                        {configData.ingestion?.chunker?.config?.target_chunk_size || 500}
                      </span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="1500"
                      step="50"
                      value={configData.ingestion?.chunker?.config?.target_chunk_size || 500}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["ingestion", "chunker", "config", "target_chunk_size"],
                          parseInt(e.target.value)
                        )
                      }
                      className="w-full accent-primary"
                    />
                  </div>

                  {configData.ingestion?.chunker?.provider === "semantic" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center justify-between">
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
                        className="w-full accent-primary"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Retrieval & Matching */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="font-bold text-md font-display">Search & Retrieval Engine</h3>
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Retrieval</span>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center">
                      Search Strategy
                      <InfoTooltip text="Retrieval logic. Simple queries dense index; Multi-Query expands with LLM prompts." />
                    </label>
                    <select
                      value={configData.retrieval?.strategy || "simple"}
                      onChange={(e) => handleUpdateConfigValue(["retrieval", "strategy"], e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
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
                      className="w-full accent-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center justify-between">
                      <span className="flex items-center">
                        Similarity Threshold
                        <InfoTooltip text="Minimum cosine similarity score required for chunks to be retrieved." />
                      </span>
                      <span className="font-mono text-[11px] font-bold text-primary">
                        {(configData.retrieval?.similarity_threshold || 0.7).toFixed(2)}
                      </span>
                    </label>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={configData.retrieval?.similarity_threshold || 0.7}
                      onChange={(e) =>
                        handleUpdateConfigValue(["retrieval", "similarity_threshold"], parseFloat(e.target.value))
                      }
                      className="w-full accent-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Card 4: LLM Generation Settings */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="font-bold text-md font-display">LLM & completions settings</h3>
                  <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">LLM</span>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center">
                      LLM Provider API
                      <InfoTooltip text="Large Language Model hosting API endpoint provider." />
                    </label>
                    <select
                      value={configData.llm?.provider || "openai"}
                      onChange={(e) => handleUpdateConfigValue(["llm", "provider"], e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                    >
                      <option value="openai">OpenAI GPT</option>
                      <option value="anthropic">Anthropic Claude</option>
                      <option value="cohere">Cohere Command</option>
                      <option value="local">Local Transformer</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center">
                      Model Identifier
                      <InfoTooltip text="Specific model tag running completions (e.g. gpt-4o-mini)." />
                    </label>
                    <input
                      type="text"
                      value={configData.llm?.config?.model || ""}
                      onChange={(e) => handleUpdateConfigValue(["llm", "config", "model"], e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center justify-between">
                      <span className="flex items-center">
                        Temperature (Creativity)
                        <InfoTooltip text="Creativity controller. 0.0 is deterministic and focused; 1.0 is highly creative." />
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
                      className="w-full accent-primary"
                    />
                  </div>
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

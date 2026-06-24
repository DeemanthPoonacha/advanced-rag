import { Sliders, ChevronDown, ChevronUp, Sparkle } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface SplitterConfigCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function SplitterConfigCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: SplitterConfigCardProps) {
  const isExpanded = !!expandedSections["chunker-advanced"];
  const provider = configData.ingestion?.chunker?.provider || "semantic";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:shadow-md">
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
            <label className="text-xs font-semibold flex items-center gap-1">
              Splitting Strategy
              <InfoTooltip text="Splitting algorithm. Semantic uses sentence differences; Recursive uses character counters; Multimodal Summarizer uses vision models." />
            </label>
            <select
              value={provider}
              onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "provider"], e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            >
              <option value="semantic">Semantic Chunker</option>
              <option value="recursive">Recursive Character</option>
              <option value="hierarchical">Hierarchical Parent-Child</option>
              <option value="by_title">By Title Chunker</option>
              <option value="multimodal_summarizer">Multimodal Summarizer Chunker</option>
            </select>
          </div>

          {/* Conditional Chunker Config (Main Controls) */}
          {provider === "semantic" && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    Max Chunk Size (Chars)
                    <InfoTooltip text="Maximum character size limit for a single semantic chunk." />
                  </span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
                  <span className="flex items-center gap-1">
                    Breakpoint Threshold
                    <InfoTooltip text="Distance threshold for semantic splits (higher = more chunks)." />
                  </span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
            </div>
          )}

          {provider === "recursive" && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    Max Chunk Size (Chars)
                    <InfoTooltip text="Maximum characters per chunk." />
                  </span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
                  <span className="flex items-center gap-1">
                    Chunk Overlap (Chars)
                    <InfoTooltip text="Overlap characters between successive chunks to keep context." />
                  </span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
            </div>
          )}

          {provider === "hierarchical" && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    Parent Chunk Size
                    <InfoTooltip text="Maximum character size of parent chunks." />
                  </span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
                  <span className="flex items-center gap-1">
                    Child Chunk Size
                    <InfoTooltip text="Maximum character size of child chunks." />
                  </span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
            </div>
          )}

          {provider === "by_title" && (
            <div className="space-y-3 animate-fade-in">
              <p className="text-xs text-slate-505 dark:text-slate-400 leading-normal border border-dashed border-slate-200 dark:border-slate-800 p-2.5 rounded-lg bg-slate-50/50 dark:bg-slate-950/20">
                Splits documents semantically under layout-parsed titles and headers. Sub-chunks exceeding limits will split recursively, prepending the section name.
              </p>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    Max Section Size (Chars)
                    <InfoTooltip text="Maximum characters allowed in a single chunk for layout sections." />
                  </span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
                  <span className="flex items-center gap-1">
                    Chunk Overlap (Chars)
                    <InfoTooltip text="Character overlap between successive splits of the same section." />
                  </span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
            </div>
          )}

          {provider === "multimodal_summarizer" && (
            <p className="text-xs text-slate-500 leading-normal border border-dashed border-slate-200 dark:border-slate-800 p-2.5 rounded-lg animate-fade-in bg-slate-50/50 dark:bg-slate-950/20">
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
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-4 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            {/* Chunker-specific advanced fields */}
            {provider === "semantic" && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      Min Chunk Size (Chars)
                      <InfoTooltip text="Minimum character size of a semantic chunk." />
                    </span>
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
                    <span className="flex items-center gap-1">
                      Semantic Buffer Size
                      <InfoTooltip text="Number of sentence lookaheads to evaluate semantic boundary splits." />
                    </span>
                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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

            {provider === "recursive" && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                Recursive character chunker recursively splits using a hierarchy of separators (paragraphs, sentences, words, etc.) to keep semantic blocks together.
              </p>
            )}

            {provider === "hierarchical" && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold flex items-center justify-between">
                    <span className="flex items-center">
                      Parent Overlap
                    </span>
                    <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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
                    <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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

            {/* Multimodal Settings Section (Card 3 Inner Advanced) */}
            <div className="border-t border-dashed border-slate-250 dark:border-slate-800/80 pt-3 space-y-3">
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Sparkle size={10} className="text-primary animate-pulse" />
                Vision summarizer settings
              </h4>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold flex items-center gap-1">
                  LLM Provider
                  <InfoTooltip text="LLM client provider for the vision summarizer. Select 'Use Primary LLM' to reuse the main completions model config." />
                </label>
                <select
                  value={configData.ingestion?.multimodal_summarizer?.provider || "primary"}
                  onChange={(e) => handleUpdateConfigValue(["ingestion", "multimodal_summarizer", "provider"], e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                >
                  <option value="primary">Use Primary LLM</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="cohere">Cohere Command</option>
                  <option value="local">Local LLM / Ollama</option>
                </select>
              </div>

              {configData.ingestion?.multimodal_summarizer?.provider !== "primary" && (
                <div className="flex flex-col gap-1.5 animate-fade-in">
                  <label className="text-[11px] font-semibold flex items-center gap-1">
                    LLM Model Name
                    <InfoTooltip text="Vision Model identifier used to summarize tables and images (e.g. gpt-4o, gpt-4o-mini)." />
                  </label>
                  <input
                    type="text"
                    value={configData.ingestion?.multimodal_summarizer?.model_name || "gpt-4o"}
                    onChange={(e) => handleUpdateConfigValue(["ingestion", "multimodal_summarizer", "model_name"], e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    Temperature
                    <InfoTooltip text="Generation temperature settings for Vision summaries." />
                  </span>
                  <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
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

              {configData.ingestion?.multimodal_summarizer?.provider !== "primary" && (
                <div className="space-y-3 animate-fade-in">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold flex items-center gap-1">
                      API authorization Key (optional)
                      <InfoTooltip text="Vision Model authorization API Key. Overrides global keys." />
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={configData.ingestion?.multimodal_summarizer?.api_key || ""}
                      onChange={(e) => handleUpdateConfigValue(["ingestion", "multimodal_summarizer", "api_key"], e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold flex items-center gap-1">
                      API Base URL (optional)
                      <InfoTooltip text="Vision Model connection endpoint URL base." />
                    </label>
                    <input
                      type="text"
                      placeholder="https://api.openai.com/v1"
                      value={configData.ingestion?.multimodal_summarizer?.base_url || ""}
                      onChange={(e) => handleUpdateConfigValue(["ingestion", "multimodal_summarizer", "base_url"], e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

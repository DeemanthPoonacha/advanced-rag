import { useState, useEffect } from "react";
import { PipelineConfig } from "../types";
import { usePipelineConfig, useUpdateConfig } from "../api/queries";
import {
  ConfigSection,
  AdvancedToggle,
  Subsection,
} from "./config/ConfigSection";
import { InfoTooltip } from "./ui/Tooltip";
import {
  Sparkles,
  Sliders,
  Search,
  Database,
  FileText,
  Sparkle,
  Eye,
  ShieldAlert,
  Settings as SettingsIcon,
  Loader2,
  Bookmark,
  BookmarkPlus,
  Plus,
  Trash2,
  Cpu,
  Layers,
  ShieldCheck,
} from "lucide-react";

function jsonToYaml(obj: any, indent = 0): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") {
    if (typeof obj === "string") {
      if (obj.includes("\n")) {
        const lines = obj.split("\n");
        const spaces = " ".repeat(indent + 2);
        return "|\n" + lines.map((line) => spaces + line).join("\n");
      }
      const hasSpecial =
        /[:#\?\{\}\[\]\s,\|&\*!%@`"']/.test(obj) ||
        obj === "true" ||
        obj === "false" ||
        obj === "null" ||
        !isNaN(Number(obj));
      if (hasSpecial) {
        return `"${obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      }
      return obj;
    }
    return String(obj);
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const spaces = " ".repeat(indent);
    return obj
      .map((item) => `\n${spaces}- ${jsonToYaml(item, indent + 2)}`)
      .join("");
  }

  let yamlStr = "";
  const keys = Object.keys(obj);
  keys.forEach((key, idx) => {
    const val = obj[key];
    const spaces = " ".repeat(indent);

    if (val === null || val === undefined) {
      yamlStr += `${spaces}${key}: null`;
    } else if (
      typeof val === "object" &&
      !Array.isArray(val) &&
      Object.keys(val).length === 0
    ) {
      yamlStr += `${spaces}${key}: {}`;
    } else if (typeof val === "object") {
      yamlStr += `${spaces}${key}:\n${jsonToYaml(val, indent + 2)}`;
    } else {
      yamlStr += `${spaces}${key}: ${jsonToYaml(val, indent)}`;
    }

    if (idx < keys.length - 1) {
      yamlStr += "\n";
    }
  });
  return yamlStr;
}

// Shared field class names
const inputCls =
  "w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors";
const inputSmCls =
  "w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors";
const rangeBaseCls =
  "w-full accent-primary h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer";
const rangeThinCls =
  "w-full accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer";
const toggleBg =
  "w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-all";

function RangeValue({ value }: { value: string | number }) {
  return (
    <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
      {value}
    </span>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors">
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold">{label}</span>
        <span className="text-[8px] text-slate-400 dark:text-slate-500">
          {description}
        </span>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className={toggleBg}></div>
      </label>
    </div>
  );
}

export function ConfigPanel() {
  const { data: queryData, refetch: fetchConfig } = usePipelineConfig();
  const configDataQuery = queryData?.resolved_config || null;
  const rawYamlQuery = queryData?.raw_yaml || "";

  const [configData, setConfigData] = useState<PipelineConfig | null>(null);
  const [rawYaml, setRawYaml] = useState("");
  const [editMode, setEditMode] = useState<"visual" | "yaml">("visual");

  // Sync draft states when fresh config is loaded from the backend
  useEffect(() => {
    if (configDataQuery && !configData) {
      setConfigData(configDataQuery);
    }
    if (rawYamlQuery && !rawYaml) {
      setRawYaml(rawYamlQuery);
    }
  }, [configDataQuery, rawYamlQuery]);

  const handleUpdateConfigValue = (path: string[], value: any) => {
    setConfigData((prev) => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev));
      let current = copy;
      for (let i = 0; i < path.length - 1; i++) {
        if (current[path[i]] === undefined || current[path[i]] === null) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return copy;
    });
  };

  const handleSetEditMode = async (mode: "visual" | "yaml") => {
    if (mode === "yaml" && editMode === "visual" && configData) {
      try {
        const yamlStr = jsonToYaml(configData);
        setRawYaml(yamlStr);
      } catch (e) {
        console.error("Failed to serialize visual config to YAML", e);
      }
    } else if (mode === "visual" && editMode === "yaml" && rawYaml) {
      try {
        const res = await fetch("http://localhost:8000/api/config/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml_content: rawYaml }),
        });
        if (res.ok) {
          const data = await res.json();
          setConfigData(data.resolved_config);
        } else {
          const data = await res.json();
          const detail = data.detail;
          let errMsg =
            typeof detail === "string"
              ? detail
              : detail.message || "Invalid YAML";
          if (detail.errors) {
            errMsg +=
              ": " +
              detail.errors
                .map((err: any) => `${err.loc.join(".")}: ${err.msg}`)
                .join(", ");
          }
          alert(`YAML parsing failed: ${errMsg}`);
          return;
        }
      } catch (e) {
        alert("Error connecting to parser endpoint");
        return;
      }
    }
    setEditMode(mode);
  };

  const updateConfigMutation = useUpdateConfig();
  const handleSaveConfig = async () => {
    updateConfigMutation.mutate({ editMode, rawYaml, configData });
  };

  const handleResetConfig = async () => {
    const fresh = await fetchConfig();
    if (fresh.data) {
      setConfigData(fresh.data.resolved_config);
      setRawYaml(fresh.data.raw_yaml);
    }
  };

  // State to track expanded sections for advanced config keys
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});

  // Preset management states
  const [presets, setPresets] = useState<any[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isActivating, setIsActivating] = useState<string | null>(null);

  const fetchPresets = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/presets");
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
        setActivePreset(data.active_preset || null);
      }
    } catch (e) {
      console.error("Failed to fetch presets", e);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, [configData, rawYaml]);

  const handleActivatePreset = async (name: string) => {
    setIsActivating(name);
    try {
      const res = await fetch(
        `http://localhost:8000/api/presets/${name}/activate`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        await fetchConfig();
        await fetchPresets();
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to activate preset.");
      }
    } catch (e) {
      alert("Failed to activate preset due to network error.");
    } finally {
      setIsActivating(null);
    }
  };

  const handleCreatePreset = async () => {
    if (!newPresetName.trim()) {
      alert("Please enter a valid preset name.");
      return;
    }
    const cleanName = newPresetName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
    setIsSavingPreset(true);
    try {
      let res;
      if (editMode === "yaml") {
        res = await fetch(`http://localhost:8000/api/presets/${cleanName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml_content: rawYaml }),
        });
      } else {
        res = await fetch(
          `http://localhost:8000/api/presets/${cleanName}/json`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(configData),
          },
        );
      }
      if (res.ok) {
        setNewPresetName("");
        setShowSaveModal(false);
        await fetchPresets();
      } else {
        const data = await res.json();
        alert(data.detail?.message || data.detail || "Failed to save preset.");
      }
    } catch (e) {
      alert("Connection error when saving preset.");
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleDeletePreset = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete preset '${name}'?`)) {
      return;
    }
    try {
      const res = await fetch(`http://localhost:8000/api/presets/${name}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchPresets();
      }
    } catch (e) {
      console.error("Failed to delete preset", e);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Extracted config values for convenience
  const chunkerProvider =
    configData?.ingestion?.chunker?.provider || "semantic";
  const llmTemp = configData?.llm?.config?.temperature ?? 0.1;
  const retrievalStrategy = configData?.retrieval?.strategy || "simple";
  const topK = configData?.retrieval?.top_k || 5;
  const similarityThreshold =
    configData?.retrieval?.similarity_threshold || 0.0;
  const embeddingsProvider = configData?.embeddings?.provider || "openai";
  const vectorProvider = configData?.vector_store?.provider || "qdrant";

  return (
    <div className="flex-1 flex flex-col gap-6 max-w-7xl w-full mx-auto overflow-hidden">
      {/* ── Project Settings ── */}
      {!!configData && (
        <Subsection title="Project Settings" icon={<SettingsIcon size={10} />}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                className={inputCls}
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
                className={inputCls}
              >
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>
        </Subsection>
      )}
      {/* Editor Switcher (Form vs YAML) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shrink-0">
        <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-sm self-start">
          <button
            onClick={handleSetEditMode.bind(null, "visual")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              editMode === "visual"
                ? "bg-primary text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-250 dark:hover:bg-slate-800"
            }`}
          >
            Visual Config Grid
          </button>
          <button
            onClick={handleSetEditMode.bind(null, "yaml")}
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
            onClick={handleResetConfig}
            className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95 cursor-pointer"
          >
            Reset Changes
          </button>
          <button
            onClick={handleSaveConfig}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/95 text-white shadow-md shadow-primary/20 transition hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            Apply &amp; Rebuild Pipeline
          </button>
        </div>
      </div>

      {/* Sub-window */}
      <div className="flex-1 overflow-hidden">
        {editMode === "visual" ? (
          configData ? (
            <div className="h-full overflow-y-auto pr-2 space-y-4 pb-6 scrollbar-thin">
              {/* ───────────────── 1. INGESTION ───────────────── */}
              <ConfigSection
                icon={<FileText size={18} />}
                title="Ingestion Pipeline"
                badge="Ingest"
                description="Document parsing, chunking strategy, embeddings, and vector storage"
                defaultOpen={true}
                accentColor="sky-500"
              >
                {/* ── Parser ── */}
                <Subsection
                  title="Document Parser"
                  icon={<FileText size={10} />}
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Parser Provider
                      <InfoTooltip text="Raw file parser algorithm (unstructured handles local; llamaparse is cloud-based; multimodal_unstructured extracts layout elements/tables/images)." />
                    </label>
                    <select
                      value={
                        configData.ingestion?.parser?.provider || "unstructured"
                      }
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["ingestion", "parser", "provider"],
                          e.target.value,
                        )
                      }
                      className={inputCls}
                    >
                      <option value="unstructured">
                        Unstructured.io Parser
                      </option>
                      <option value="llamaparse">LlamaParse Cloud API</option>
                      <option value="multimodal_unstructured">
                        Multimodal Unstructured Parser
                      </option>
                    </select>
                  </div>

                  <AdvancedToggle
                    label="Parser Advanced"
                    sectionKey="parser-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    {/* Unstructured / Multimodal parser config */}
                    {(configData.ingestion?.parser?.provider ===
                      "unstructured" ||
                      configData.ingestion?.parser?.provider ===
                        "multimodal_unstructured") && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center gap-1">
                            Parsing Strategy
                            <InfoTooltip text="hi_res parses structures like tables/images; fast is simple text; ocr_only runs OCR." />
                          </label>
                          <select
                            value={
                              configData.ingestion?.parser?.config?.strategy ||
                              "hi_res"
                            }
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "parser", "config", "strategy"],
                                e.target.value,
                              )
                            }
                            className={inputSmCls}
                          >
                            <option value="hi_res">
                              Hi-Res Structure Extract
                            </option>
                            <option value="fast">Fast Raw Text</option>
                            <option value="ocr_only">OCR Only (Scans)</option>
                          </select>
                        </div>

                        <Toggle
                          label="Extract Images"
                          description="Attempt to partition and extract inline images"
                          checked={
                            configData.ingestion?.parser?.config
                              ?.extract_images ??
                            configData.ingestion?.parser?.provider ===
                              "multimodal_unstructured"
                          }
                          onChange={(v) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "parser",
                                "config",
                                "extract_images",
                              ],
                              v,
                            )
                          }
                        />

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center gap-1">
                            Languages (ISO codes, comma-separated)
                            <InfoTooltip text="Languages to use for OCR text extraction (e.g. en,de)." />
                          </label>
                          <input
                            type="text"
                            value={(
                              configData.ingestion?.parser?.config
                                ?.languages || ["en"]
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
                            className={inputSmCls}
                          />
                        </div>
                      </>
                    )}

                    {/* LlamaParse config */}
                    {configData.ingestion?.parser?.provider ===
                      "llamaparse" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center gap-1">
                            Llama Cloud API Key
                            <InfoTooltip text="Your personal Llama Cloud/LlamaParse token key." />
                          </label>
                          <input
                            type="password"
                            placeholder="••••••••••••••••"
                            value={
                              configData.ingestion?.parser?.config?.api_key ||
                              ""
                            }
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                ["ingestion", "parser", "config", "api_key"],
                                e.target.value,
                              )
                            }
                            className={inputSmCls}
                          />
                        </div>

                        <Toggle
                          label="Premium Mode"
                          description="Run premium parsing algorithms for highest quality"
                          checked={
                            configData.ingestion?.parser?.config
                              ?.premium_mode ?? false
                          }
                          onChange={(v) =>
                            handleUpdateConfigValue(
                              ["ingestion", "parser", "config", "premium_mode"],
                              v,
                            )
                          }
                        />

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
                            className={`${inputSmCls} resize-none font-sans`}
                          />
                        </div>
                      </>
                    )}
                  </AdvancedToggle>
                </Subsection>

                {/* <div className="border-t border-slate-100 dark:border-slate-800/50" /> */}

                {/* ── Chunker ── */}
                <Subsection
                  title="Chunking Strategy"
                  icon={<Sliders size={10} />}
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Splitting Strategy
                      <InfoTooltip text="Splitting algorithm. Semantic uses sentence differences; Recursive uses character counters; Multimodal Summarizer uses vision models." />
                    </label>
                    <select
                      value={chunkerProvider}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["ingestion", "chunker", "provider"],
                          e.target.value,
                        )
                      }
                      className={inputCls}
                    >
                      <option value="semantic">Semantic Chunker</option>
                      <option value="recursive">Recursive Character</option>
                      <option value="hierarchical">
                        Hierarchical Parent-Child
                      </option>
                      <option value="by_title">By Title Chunker</option>
                      <option value="multimodal_summarizer">
                        Multimodal Summarizer Chunker
                      </option>
                    </select>
                  </div>

                  {/* Semantic chunker main controls */}
                  {chunkerProvider === "semantic" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Max Chunk Size (Chars)
                            <InfoTooltip text="Maximum character size limit for a single semantic chunk." />
                          </span>
                          <RangeValue
                            value={
                              configData.ingestion?.chunker?.config
                                ?.max_chunk_size ?? 1024
                            }
                          />
                        </label>
                        <input
                          type="range"
                          min="100"
                          max="2048"
                          step="64"
                          value={
                            configData.ingestion?.chunker?.config
                              ?.max_chunk_size ?? 1024
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "chunker",
                                "config",
                                "max_chunk_size",
                              ],
                              parseInt(e.target.value),
                            )
                          }
                          className={rangeBaseCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Breakpoint Threshold
                            <InfoTooltip text="Distance threshold for semantic splits (higher = more chunks)." />
                          </span>
                          <RangeValue
                            value={(
                              configData.ingestion?.chunker?.config
                                ?.breakpoint_threshold ?? 0.7
                            ).toFixed(2)}
                          />
                        </label>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.05"
                          value={
                            configData.ingestion?.chunker?.config
                              ?.breakpoint_threshold ?? 0.7
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "chunker",
                                "config",
                                "breakpoint_threshold",
                              ],
                              parseFloat(e.target.value),
                            )
                          }
                          className={rangeBaseCls}
                        />
                      </div>
                    </>
                  )}

                  {/* Recursive chunker main controls */}
                  {chunkerProvider === "recursive" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Max Chunk Size (Chars)
                            <InfoTooltip text="Maximum characters per chunk." />
                          </span>
                          <RangeValue
                            value={
                              configData.ingestion?.chunker?.config
                                ?.max_chunk_size ?? 1024
                            }
                          />
                        </label>
                        <input
                          type="range"
                          min="100"
                          max="2048"
                          step="64"
                          value={
                            configData.ingestion?.chunker?.config
                              ?.max_chunk_size ?? 1024
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "chunker",
                                "config",
                                "max_chunk_size",
                              ],
                              parseInt(e.target.value),
                            )
                          }
                          className={rangeBaseCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Chunk Overlap (Chars)
                            <InfoTooltip text="Overlap characters between successive chunks to keep context." />
                          </span>
                          <RangeValue
                            value={
                              configData.ingestion?.chunker?.config
                                ?.chunk_overlap ?? 200
                            }
                          />
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1000"
                          step="20"
                          value={
                            configData.ingestion?.chunker?.config
                              ?.chunk_overlap ?? 200
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "chunker",
                                "config",
                                "chunk_overlap",
                              ],
                              parseInt(e.target.value),
                            )
                          }
                          className={rangeBaseCls}
                        />
                      </div>
                    </>
                  )}

                  {/* Hierarchical chunker main controls */}
                  {chunkerProvider === "hierarchical" && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Parent Chunk Size
                            <InfoTooltip text="Maximum character size of parent chunks." />
                          </span>
                          <RangeValue
                            value={
                              configData.ingestion?.chunker?.config
                                ?.parent_chunk_size ?? 2048
                            }
                          />
                        </label>
                        <input
                          type="range"
                          min="200"
                          max="4096"
                          step="128"
                          value={
                            configData.ingestion?.chunker?.config
                              ?.parent_chunk_size ?? 2048
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "chunker",
                                "config",
                                "parent_chunk_size",
                              ],
                              parseInt(e.target.value),
                            )
                          }
                          className={rangeBaseCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Child Chunk Size
                            <InfoTooltip text="Maximum character size of child chunks." />
                          </span>
                          <RangeValue
                            value={
                              configData.ingestion?.chunker?.config
                                ?.child_chunk_size ?? 512
                            }
                          />
                        </label>
                        <input
                          type="range"
                          min="50"
                          max="1024"
                          step="32"
                          value={
                            configData.ingestion?.chunker?.config
                              ?.child_chunk_size ?? 512
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "chunker",
                                "config",
                                "child_chunk_size",
                              ],
                              parseInt(e.target.value),
                            )
                          }
                          className={rangeBaseCls}
                        />
                      </div>
                    </>
                  )}

                  {/* By Title main controls */}
                  {chunkerProvider === "by_title" && (
                    <>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-normal border border-dashed border-slate-200 dark:border-slate-800 p-2.5 rounded-lg bg-slate-50/50 dark:bg-slate-950/20">
                        Splits documents semantically under layout-parsed titles
                        and headers. Sub-chunks exceeding limits will split
                        recursively, prepending the section name.
                      </p>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Max Section Size (Chars)
                            <InfoTooltip text="Maximum characters allowed in a single chunk for layout sections." />
                          </span>
                          <RangeValue
                            value={
                              configData.ingestion?.chunker?.config
                                ?.max_chunk_size ?? 1024
                            }
                          />
                        </label>
                        <input
                          type="range"
                          min="100"
                          max="2048"
                          step="64"
                          value={
                            configData.ingestion?.chunker?.config
                              ?.max_chunk_size ?? 1024
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "chunker",
                                "config",
                                "max_chunk_size",
                              ],
                              parseInt(e.target.value),
                            )
                          }
                          className={rangeBaseCls}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Chunk Overlap (Chars)
                            <InfoTooltip text="Character overlap between successive splits of the same section." />
                          </span>
                          <RangeValue
                            value={
                              configData.ingestion?.chunker?.config
                                ?.chunk_overlap ?? 200
                            }
                          />
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1000"
                          step="20"
                          value={
                            configData.ingestion?.chunker?.config
                              ?.chunk_overlap ?? 200
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "chunker",
                                "config",
                                "chunk_overlap",
                              ],
                              parseInt(e.target.value),
                            )
                          }
                          className={rangeBaseCls}
                        />
                      </div>
                    </>
                  )}

                  {chunkerProvider === "multimodal_summarizer" && (
                    <p className="text-xs text-slate-500 leading-normal border border-dashed border-slate-200 dark:border-slate-800 p-2.5 rounded-lg bg-slate-50/50 dark:bg-slate-950/20">
                      Summarizes all document elements using vision language
                      models. Configure the multimodal LLM in the advanced
                      section below.
                    </p>
                  )}

                  <AdvancedToggle
                    label="Chunker & Multimodal Advanced"
                    sectionKey="chunker-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    {/* Semantic advanced */}
                    {chunkerProvider === "semantic" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              Min Chunk Size (Chars)
                              <InfoTooltip text="Minimum character size of a semantic chunk." />
                            </span>
                            <RangeValue
                              value={
                                configData.ingestion?.chunker?.config
                                  ?.min_chunk_size ?? 128
                              }
                            />
                          </label>
                          <input
                            type="range"
                            min="10"
                            max="512"
                            step="10"
                            value={
                              configData.ingestion?.chunker?.config
                                ?.min_chunk_size ?? 128
                            }
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                [
                                  "ingestion",
                                  "chunker",
                                  "config",
                                  "min_chunk_size",
                                ],
                                parseInt(e.target.value),
                              )
                            }
                            className={rangeThinCls}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              Semantic Buffer Size
                              <InfoTooltip text="Number of sentence lookaheads to evaluate semantic boundary splits." />
                            </span>
                            <RangeValue
                              value={
                                configData.ingestion?.chunker?.config
                                  ?.buffer_size ?? 1
                              }
                            />
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="5"
                            step="1"
                            value={
                              configData.ingestion?.chunker?.config
                                ?.buffer_size ?? 1
                            }
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                [
                                  "ingestion",
                                  "chunker",
                                  "config",
                                  "buffer_size",
                                ],
                                parseInt(e.target.value),
                              )
                            }
                            className={rangeThinCls}
                          />
                        </div>
                      </>
                    )}

                    {chunkerProvider === "recursive" && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                        Recursive character chunker recursively splits using a
                        hierarchy of separators (paragraphs, sentences, words,
                        etc.) to keep semantic blocks together.
                      </p>
                    )}

                    {/* Hierarchical advanced */}
                    {chunkerProvider === "hierarchical" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Parent Overlap
                            </span>
                            <RangeValue
                              value={
                                configData.ingestion?.chunker?.config
                                  ?.parent_overlap ?? 256
                              }
                            />
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1024"
                            step="32"
                            value={
                              configData.ingestion?.chunker?.config
                                ?.parent_overlap ?? 256
                            }
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                [
                                  "ingestion",
                                  "chunker",
                                  "config",
                                  "parent_overlap",
                                ],
                                parseInt(e.target.value),
                              )
                            }
                            className={rangeThinCls}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center justify-between">
                            <span className="flex items-center">
                              Child Overlap
                            </span>
                            <RangeValue
                              value={
                                configData.ingestion?.chunker?.config
                                  ?.child_overlap ?? 64
                              }
                            />
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="256"
                            step="8"
                            value={
                              configData.ingestion?.chunker?.config
                                ?.child_overlap ?? 64
                            }
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                [
                                  "ingestion",
                                  "chunker",
                                  "config",
                                  "child_overlap",
                                ],
                                parseInt(e.target.value),
                              )
                            }
                            className={rangeThinCls}
                          />
                        </div>
                      </>
                    )}

                    {/* Multimodal summarizer settings */}
                    <div className="border-t border-dashed border-slate-250 dark:border-slate-800/80 pt-3 space-y-3">
                      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Sparkle
                          size={10}
                          className="text-primary animate-pulse"
                        />
                        Vision summarizer settings
                      </h4>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center gap-1">
                          LLM Provider
                          <InfoTooltip text="LLM client provider for the vision summarizer. Select 'Use Primary LLM' to reuse the main completions model config." />
                        </label>
                        <select
                          value={
                            configData.ingestion?.multimodal_summarizer
                              ?.provider || "primary"
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "multimodal_summarizer",
                                "provider",
                              ],
                              e.target.value,
                            )
                          }
                          className={inputSmCls}
                        >
                          <option value="primary">Use Primary LLM</option>
                          <option value="openai">OpenAI GPT</option>
                          <option value="anthropic">Anthropic Claude</option>
                          <option value="cohere">Cohere Command</option>
                          <option value="local">Local LLM / Ollama</option>
                        </select>
                      </div>

                      {configData.ingestion?.multimodal_summarizer?.provider !==
                        "primary" && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold flex items-center gap-1">
                            LLM Model Name
                            <InfoTooltip text="Vision Model identifier used to summarize tables and images." />
                          </label>
                          <input
                            type="text"
                            value={
                              configData.ingestion?.multimodal_summarizer
                                ?.model_name || "gpt-4o"
                            }
                            onChange={(e) =>
                              handleUpdateConfigValue(
                                [
                                  "ingestion",
                                  "multimodal_summarizer",
                                  "model_name",
                                ],
                                e.target.value,
                              )
                            }
                            className={inputSmCls}
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            Temperature
                            <InfoTooltip text="Generation temperature settings for Vision summaries." />
                          </span>
                          <RangeValue
                            value={(
                              configData.ingestion?.multimodal_summarizer
                                ?.temperature ?? 0.0
                            ).toFixed(2)}
                          />
                        </label>
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.05"
                          value={
                            configData.ingestion?.multimodal_summarizer
                              ?.temperature ?? 0.0
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              [
                                "ingestion",
                                "multimodal_summarizer",
                                "temperature",
                              ],
                              parseFloat(e.target.value),
                            )
                          }
                          className={rangeThinCls}
                        />
                      </div>

                      {configData.ingestion?.multimodal_summarizer?.provider !==
                        "primary" && (
                        <>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-semibold flex items-center gap-1">
                              API Key (optional)
                              <InfoTooltip text="Vision Model authorization API Key." />
                            </label>
                            <input
                              type="password"
                              placeholder="••••••••••••••••"
                              value={
                                configData.ingestion?.multimodal_summarizer
                                  ?.api_key || ""
                              }
                              onChange={(e) =>
                                handleUpdateConfigValue(
                                  [
                                    "ingestion",
                                    "multimodal_summarizer",
                                    "api_key",
                                  ],
                                  e.target.value,
                                )
                              }
                              className={inputSmCls}
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
                              value={
                                configData.ingestion?.multimodal_summarizer
                                  ?.base_url || ""
                              }
                              onChange={(e) =>
                                handleUpdateConfigValue(
                                  [
                                    "ingestion",
                                    "multimodal_summarizer",
                                    "base_url",
                                  ],
                                  e.target.value,
                                )
                              }
                              className={inputSmCls}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Batch size (was in GeneralSettingsCard advanced) */}
                    <div className="border-t border-dashed border-slate-250 dark:border-slate-800/80 pt-3">
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
                          className={inputSmCls}
                        />
                      </div>
                    </div>
                  </AdvancedToggle>
                </Subsection>

                {/* <div className="border-t border-slate-100 dark:border-slate-800/50" /> */}

                {/* ── Embeddings ── */}
                <Subsection
                  title="Embedding Model"
                  icon={<Sliders size={10} />}
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Embeddings Provider
                      <InfoTooltip text="Vector embeddings generation provider." />
                    </label>
                    <select
                      value={embeddingsProvider}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["embeddings", "provider"],
                          e.target.value,
                        )
                      }
                      className={inputCls}
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
                        embeddingsProvider === "local"
                          ? configData.embeddings?.config?.model_name || ""
                          : configData.embeddings?.config?.model || ""
                      }
                      onChange={(e) => {
                        const path =
                          embeddingsProvider === "local"
                            ? "model_name"
                            : "model";
                        handleUpdateConfigValue(
                          ["embeddings", "config", path],
                          e.target.value,
                        );
                      }}
                      className={inputCls}
                    />
                  </div>

                  <AdvancedToggle
                    sectionKey="embeddings-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    {embeddingsProvider === "local" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center gap-1">
                          Device Execution Target
                          <InfoTooltip text="Hardware device running the sentence transformer (cpu or cuda)." />
                        </label>
                        <select
                          value={configData.embeddings?.config?.device || "cpu"}
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              ["embeddings", "config", "device"],
                              e.target.value,
                            )
                          }
                          className={inputSmCls}
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
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["embeddings", "config", "api_key"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      />
                    </div>
                  </AdvancedToggle>
                </Subsection>

                {/* <div className="border-t border-slate-100 dark:border-slate-800/50" /> */}

                {/* ── Vector Database ── */}
                <Subsection
                  title="Vector Database"
                  icon={<Database size={10} />}
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Vector Store Provider
                      <InfoTooltip text="Vector storage database provider." />
                    </label>
                    <select
                      value={vectorProvider}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["vector_store", "provider"],
                          e.target.value,
                        )
                      }
                      className={inputCls}
                    >
                      <option value="qdrant">Qdrant Vector DB</option>
                      <option value="pinecone">Pinecone Cloud DB</option>
                      <option value="milvus">Milvus Database</option>
                      <option value="pgvector">PostgreSQL (pgvector)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Database Connection URL
                      <InfoTooltip text="Connection string / URL endpoint for the database client (e.g. http://localhost:6333)." />
                    </label>
                    <input
                      type="text"
                      placeholder="http://localhost:6333"
                      value={configData.vector_store?.config?.url || ""}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["vector_store", "config", "url"],
                          e.target.value,
                        )
                      }
                      className={inputCls}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Collection / Index Name
                      <InfoTooltip text="Database namespace collection or index name." />
                    </label>
                    <input
                      type="text"
                      value={
                        configData.vector_store?.config?.collection_name ||
                        configData.vector_store?.config?.index_name ||
                        ""
                      }
                      onChange={(e) => {
                        handleUpdateConfigValue(
                          ["vector_store", "config", "collection_name"],
                          e.target.value,
                        );
                        handleUpdateConfigValue(
                          ["vector_store", "config", "index_name"],
                          e.target.value,
                        );
                      }}
                      className={inputCls}
                    />
                  </div>

                  <AdvancedToggle
                    sectionKey="database-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Vector Dimensions Size
                        <InfoTooltip text="Size of the dense embedding vectors (must match output of selected embeddings model, e.g. 384 or 1536)." />
                      </label>
                      <input
                        type="number"
                        value={
                          configData.vector_store?.config?.vector_size ?? 384
                        }
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["vector_store", "config", "vector_size"],
                            parseInt(e.target.value) || 384,
                          )
                        }
                        className={inputSmCls}
                      />
                    </div>

                    {vectorProvider === "qdrant" && (
                      <Toggle
                        label="Prefer gRPC Protocol"
                        description="Use gRPC port 6334 instead of HTTP"
                        checked={
                          configData.vector_store?.config?.prefer_grpc ?? true
                        }
                        onChange={(v) =>
                          handleUpdateConfigValue(
                            ["vector_store", "config", "prefer_grpc"],
                            v,
                          )
                        }
                      />
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Database Connection Key
                        <InfoTooltip text="API Authorization Key for cloud databases." />
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••"
                        value={configData.vector_store?.config?.api_key || ""}
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["vector_store", "config", "api_key"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      />
                    </div>
                  </AdvancedToggle>
                </Subsection>
              </ConfigSection>

              {/* ───────────────── 2. RETRIEVAL & SEARCH ───────────────── */}
              <ConfigSection
                icon={<Search size={18} />}
                title="Retrieval & Search"
                badge="Retrieval"
                description="Search strategy, scoring thresholds, observability, and project settings"
                defaultOpen={false}
                accentColor="emerald-500"
              >
                {/* ── Search & Retrieval ── */}
                <Subsection title="Search Strategy" icon={<Search size={10} />}>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Search Strategy
                      <InfoTooltip text="Retrieval logic. Simple queries dense index; Multi-Query expands with LLM prompts." />
                    </label>
                    <select
                      value={retrievalStrategy}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["retrieval", "strategy"],
                          e.target.value,
                        )
                      }
                      className={inputCls}
                    >
                      <option value="simple">Simple Dense Search</option>
                      <option value="multi_query">Multi-Query Expansion</option>
                      <option value="contextual_compression">
                        Contextual Compression
                      </option>
                      <option value="auto_merging">
                        Auto-Merging Retrieval
                      </option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        Top K Chunks
                        <InfoTooltip text="Maximum number of matched document vectors retrieved to inject into prompt context." />
                      </span>
                      <RangeValue value={topK} />
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
                      className={rangeBaseCls}
                    />
                  </div>

                  <AdvancedToggle
                    sectionKey="retrieval-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          Similarity Threshold
                          <InfoTooltip text="Minimum cosine similarity score required for chunks to be retrieved." />
                        </span>
                        <RangeValue value={similarityThreshold.toFixed(2)} />
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
                        className={rangeThinCls}
                      />
                    </div>
                  </AdvancedToggle>
                </Subsection>

                {/* <div className="border-t border-slate-100 dark:border-slate-800/50" /> */}

                {/* ── Observability & Telemetry ── */}
                <Subsection
                  title="Observability & Telemetry"
                  icon={<Eye size={10} />}
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      Logging Severity Level
                      <InfoTooltip text="Determines the minimum severity level log messages must reach to be generated." />
                    </label>
                    <select
                      value={configData.observability?.logging?.level || "INFO"}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["observability", "logging", "level"],
                          e.target.value,
                        )
                      }
                      className={inputCls}
                    >
                      <option value="DEBUG">DEBUG</option>
                      <option value="INFO">INFO</option>
                      <option value="WARNING">WARNING</option>
                      <option value="ERROR">ERROR</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>

                  <AdvancedToggle
                    sectionKey="observability-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    <Toggle
                      label="Enable OTEL Tracing"
                      description="Record structured traces across pipeline stages"
                      checked={
                        configData.observability?.tracing?.enabled ?? true
                      }
                      onChange={(v) =>
                        handleUpdateConfigValue(
                          ["observability", "tracing", "enabled"],
                          v,
                        )
                      }
                    />

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Log Print Format
                        <InfoTooltip text="Log printing schema type." />
                      </label>
                      <select
                        value={
                          configData.observability?.logging?.format || "json"
                        }
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["observability", "logging", "format"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      >
                        <option value="json">Structured JSON</option>
                        <option value="text">Human-Readable Text</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Logging Export Target
                        <InfoTooltip text="Destination target representing where generated logs are emitted." />
                      </label>
                      <select
                        value={
                          configData.observability?.logging?.output || "stdout"
                        }
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["observability", "logging", "output"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      >
                        <option value="stdout">Standard Out (Console)</option>
                        <option value="file">Local Log File Target</option>
                      </select>
                    </div>

                    {(configData.observability?.logging?.output || "stdout") ===
                      "file" && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold flex items-center gap-1">
                          Log File Path
                          <InfoTooltip text="Absolute or relative file path target to output files." />
                        </label>
                        <input
                          type="text"
                          placeholder="logs/rag.log"
                          value={
                            configData.observability?.logging?.file_path || ""
                          }
                          onChange={(e) =>
                            handleUpdateConfigValue(
                              ["observability", "logging", "file_path"],
                              e.target.value,
                            )
                          }
                          className={inputSmCls}
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Tracing Provider
                        <InfoTooltip text="Target telemetry pipeline receiver." />
                      </label>
                      <select
                        value={
                          configData.observability?.tracing?.provider ||
                          "opentelemetry"
                        }
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["observability", "tracing", "provider"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      >
                        <option value="opentelemetry">
                          OpenTelemetry Collector
                        </option>
                        <option value="langsmith">LangSmith Endpoint</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Tracing Endpoint URL
                        <InfoTooltip text="HTTP/gRPC collector target url." />
                      </label>
                      <input
                        type="text"
                        value={
                          configData.observability?.tracing?.endpoint ||
                          "http://localhost:4317"
                        }
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["observability", "tracing", "endpoint"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      />
                    </div>

                    <Toggle
                      label="Prometheus Metrics"
                      description="Expose scraping endpoint for performance queries"
                      checked={
                        configData.observability?.metrics?.enabled ?? true
                      }
                      onChange={(v) =>
                        handleUpdateConfigValue(
                          ["observability", "metrics", "enabled"],
                          v,
                        )
                      }
                    />

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Metrics Export Port
                        <InfoTooltip text="Listening port for scraper metrics (e.g. 9090)." />
                      </label>
                      <input
                        type="number"
                        value={configData.observability?.metrics?.port ?? 9090}
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["observability", "metrics", "port"],
                            parseInt(e.target.value) || 9090,
                          )
                        }
                        className={inputSmCls}
                      />
                    </div>
                  </AdvancedToggle>
                </Subsection>

                {/* <div className="border-t border-slate-100 dark:border-slate-800/50" /> */}
              </ConfigSection>

              {/* ───────────────── 3. LLM & GENERATION ───────────────── */}
              <ConfigSection
                icon={<Sparkles size={18} />}
                title="LLM & Generation"
                badge="LLM"
                description="Language model, answer synthesis, prompting, and guardrails"
                defaultOpen={false}
                accentColor="violet-500"
              >
                {/* ── LLM Provider ── */}
                <Subsection
                  title="Language Model"
                  icon={<Sparkles size={10} />}
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      LLM Provider
                      <InfoTooltip text="Large Language Model hosting API endpoint provider." />
                    </label>
                    <select
                      value={configData.llm?.provider || "openai"}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["llm", "provider"],
                          e.target.value,
                        )
                      }
                      className={inputCls}
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
                      className={inputCls}
                    />
                  </div>

                  <AdvancedToggle
                    sectionKey="llm-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          Temperature (Creativity)
                          <InfoTooltip text="Creativity controller. 0.0 is deterministic; 1.0 is creative." />
                        </span>
                        <RangeValue value={llmTemp.toFixed(2)} />
                      </label>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={llmTemp}
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["llm", "config", "temperature"],
                            parseFloat(e.target.value),
                          )
                        }
                        className={rangeBaseCls}
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
                        className={inputSmCls}
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
                        className={inputSmCls}
                      />
                    </div>
                  </AdvancedToggle>
                </Subsection>

                {/* <div className="border-t border-slate-100 dark:border-slate-800/50" /> */}

                {/* ── Answer Generation ── */}
                <Subsection
                  title="Answer Generation"
                  icon={<Sparkles size={10} />}
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold flex items-center gap-1">
                      System Prompt Override
                      <InfoTooltip text="System instructions fed to the LLM prior to generating answers." />
                    </label>
                    <textarea
                      rows={3}
                      value={configData.generation?.system_prompt || ""}
                      onChange={(e) =>
                        handleUpdateConfigValue(
                          ["generation", "system_prompt"],
                          e.target.value,
                        )
                      }
                      className={`${inputSmCls} resize-none font-sans`}
                    />
                  </div>

                  <AdvancedToggle
                    sectionKey="generation-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Prompt Template
                        <InfoTooltip text="Formatting template injecting context and query variables into the user completion prompt." />
                      </label>
                      <textarea
                        rows={3}
                        value={configData.generation?.prompt_template || ""}
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["generation", "prompt_template"],
                            e.target.value,
                          )
                        }
                        className={`${inputSmCls} resize-none font-mono text-[10px]`}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          Max Context Chunks
                          <InfoTooltip text="Maximum number of context chunks fed to the LLM." />
                        </span>
                        <RangeValue
                          value={configData.generation?.max_context_chunks ?? 5}
                        />
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="1"
                        value={configData.generation?.max_context_chunks ?? 5}
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["generation", "max_context_chunks"],
                            parseInt(e.target.value),
                          )
                        }
                        className={rangeThinCls}
                      />
                    </div>

                    <Toggle
                      label="Include Sources"
                      description="Inject reference metadata into response models"
                      checked={configData.generation?.include_sources ?? true}
                      onChange={(v) =>
                        handleUpdateConfigValue(
                          ["generation", "include_sources"],
                          v,
                        )
                      }
                    />
                  </AdvancedToggle>
                </Subsection>

                {/* <div className="border-t border-slate-100 dark:border-slate-800/50" /> */}

                {/* ── Guardrails & Evaluation ── */}
                <Subsection
                  title="Guardrails & Evaluation"
                  icon={<ShieldAlert size={10} />}
                >
                  <Toggle
                    label="Enable Guardrails"
                    description="Filter queries and answers against safety policies"
                    checked={configData.guardrails?.enabled ?? true}
                    onChange={(v) =>
                      handleUpdateConfigValue(["guardrails", "enabled"], v)
                    }
                  />

                  <Toggle
                    label="Enable Evaluation"
                    description="Compute faithfulness/relevance metrics"
                    checked={configData.evaluation?.enabled ?? false}
                    onChange={(v) =>
                      handleUpdateConfigValue(["evaluation", "enabled"], v)
                    }
                  />

                  <AdvancedToggle
                    sectionKey="safety-advanced"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Input Guardrail Provider
                        <InfoTooltip text="Checks user input queries for unsafe prompts." />
                      </label>
                      <select
                        value={
                          configData.guardrails?.input?.provider ||
                          "llama_guard"
                        }
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["guardrails", "input", "provider"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      >
                        <option value="llama_guard">
                          Llama Guard Classifier
                        </option>
                        <option value="nemo">NVIDIA NeMo Guardrails</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Output Guardrail Provider
                        <InfoTooltip text="Checks synthesized answers prior to output." />
                      </label>
                      <select
                        value={
                          configData.guardrails?.output?.provider ||
                          "llama_guard"
                        }
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["guardrails", "output", "provider"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      >
                        <option value="llama_guard">
                          Llama Guard Classifier
                        </option>
                        <option value="nemo">NVIDIA NeMo Guardrails</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold flex items-center gap-1">
                        Evaluation Framework
                        <InfoTooltip text="Automated evaluation framework engine." />
                      </label>
                      <select
                        value={configData.evaluation?.provider || "ragas"}
                        onChange={(e) =>
                          handleUpdateConfigValue(
                            ["evaluation", "provider"],
                            e.target.value,
                          )
                        }
                        className={inputSmCls}
                      >
                        <option value="ragas">Ragas framework</option>
                        <option value="trulens">TruLens toolchain</option>
                      </select>
                    </div>
                  </AdvancedToggle>
                </Subsection>
              </ConfigSection>
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

      {/* Save Preset Dialog Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl w-96 p-6 shadow-xl space-y-4 text-left">
            <div className="flex items-center gap-2 text-slate-850 dark:text-slate-100">
              <BookmarkPlus className="w-5 h-5 text-primary" />
              <h3 className="text-sm font-bold font-display">
                Save Custom Settings Configuration
              </h3>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Name your configuration preset. It will copy the current visual
              grid or raw YAML parameters to a reusable custom preset file.
            </p>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Preset Name
              </label>
              <input
                type="text"
                placeholder="e.g. production_gpu_v1"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-950 dark:text-slate-50 focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setNewPresetName("");
                }}
                className="px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-900 transition active:scale-95 cursor-pointer text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePreset}
                disabled={isSavingPreset}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary/95 text-white shadow-md shadow-primary/20 transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingPreset ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Configuration"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

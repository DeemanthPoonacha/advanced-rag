import { useState, useEffect } from "react";
import { PipelineConfig } from "../types";
import { usePipelineConfig, useUpdateConfig } from "../api/queries";
import { GeneralSettingsCard } from "./config/GeneralSettingsCard";
import { LlmConfigCard } from "./config/LlmConfigCard";
import { SplitterConfigCard } from "./config/SplitterConfigCard";
import { EmbeddingsConfigCard } from "./config/EmbeddingsConfigCard";
import { VectorDbConfigCard } from "./config/VectorDbConfigCard";
import { RetrievalConfigCard } from "./config/RetrievalConfigCard";
import { GenerationConfigCard } from "./config/GenerationConfigCard";
import { ObservabilityConfigCard } from "./config/ObservabilityConfigCard";
import { SafetyConfigCard } from "./config/SafetyConfigCard";
import {
  Sparkles,
  ShieldCheck,
  Layers,
  Cpu,
  Bookmark,
  Trash2,
  Plus,
  Loader2,
  BookmarkPlus,
} from "lucide-react";

function jsonToYaml(obj: any, indent = 0): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") {
    if (typeof obj === "string") {
      if (obj.includes("\n")) {
        const lines = obj.split("\n");
        const spaces = " ".repeat(indent + 2);
        return "|\n" + lines.map(line => spaces + line).join("\n");
      }
      const hasSpecial = /[:#\?\{\}\[\]\s,\|&\*!%@`"']/.test(obj) || obj === "true" || obj === "false" || obj === "null" || !isNaN(Number(obj));
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
    return obj.map(item => `\n${spaces}- ${jsonToYaml(item, indent + 2)}`).join("");
  }
  
  let yamlStr = "";
  const keys = Object.keys(obj);
  keys.forEach((key, idx) => {
    const val = obj[key];
    const spaces = " ".repeat(indent);
    
    if (val === null || val === undefined) {
      yamlStr += `${spaces}${key}: null`;
    } else if (typeof val === "object" && !Array.isArray(val) && Object.keys(val).length === 0) {
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
          let errMsg = typeof detail === "string" ? detail : detail.message || "Invalid YAML";
          if (detail.errors) {
            errMsg += ": " + detail.errors.map((err: any) => `${err.loc.join(".")}: ${err.msg}`).join(", ");
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

  const getPresetIcon = (name: string) => {
    switch (name) {
      case "local_sandbox":
        return <Cpu className="w-5 h-5 text-sky-500" />;
      case "enterprise_accuracy":
        return <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />;
      case "multimodal_layout":
        return <Layers className="w-5 h-5 text-purple-500" />;
      case "strict_security":
        return <ShieldCheck className="w-5 h-5 text-emerald-500" />;
      default:
        return <Bookmark className="w-5 h-5 text-rose-500" />;
    }
  };

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
            Apply & Rebuild Pipeline
          </button>
        </div>
      </div>

      {/* Settings Presets & Templates Grid */}
      <div className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-primary animate-pulse" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Pipeline Configurations & Presets
            </h3>
          </div>
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold cursor-pointer transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Save Current as Preset
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {presets.map((preset) => {
            const isActive = activePreset === preset.name;
            const isPending = isActivating === preset.name;
            return (
              <div
                key={preset.name}
                onClick={() =>
                  !isActive && !isPending && handleActivatePreset(preset.name)
                }
                className={`p-4 rounded-xl border transition-all duration-300 flex flex-col justify-between text-left cursor-pointer group hover:scale-[1.01] relative overflow-hidden ${
                  isActive
                    ? "bg-primary/5 border-primary/50 shadow-sm"
                    : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800/80 hover:border-slate-350 dark:hover:border-slate-700/80 hover:bg-slate-50/30 dark:hover:bg-slate-900/10"
                }`}
              >
                {/* Visual indicator lines/gradients */}
                {isActive && (
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getPresetIcon(preset.name)}
                      <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate max-w-[130px]">
                        {preset.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[8px] font-bold text-emerald-500 uppercase tracking-wider">
                          Active
                        </span>
                      )}
                      {!preset.is_predefined && (
                        <button
                          onClick={(e) => handleDeletePreset(e, preset.name)}
                          className="p-1 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded-md transition active:scale-90"
                          title="Delete Custom Preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed line-clamp-2">
                    {preset.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-900/60 flex items-center justify-between text-[9px] font-bold text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                  <span>
                    {preset.is_predefined
                      ? "Predefined Preset"
                      : "Custom Settings"}
                  </span>
                  {!isActive && (
                    <span className="text-primary opacity-0 group-hover:opacity-100 transition duration-200">
                      {isPending ? "Activating..." : "Use Preset →"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-window */}
      <div className="flex-1 overflow-hidden">
        {editMode === "visual" ? (
          configData ? (
            <div className="h-full overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6 scrollbar-thin">
              <GeneralSettingsCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />

              <LlmConfigCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />

              <SplitterConfigCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />

              <EmbeddingsConfigCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />

              <VectorDbConfigCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />

              <RetrievalConfigCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />

              <GenerationConfigCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />

              <ObservabilityConfigCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />

              <SafetyConfigCard
                configData={configData}
                expandedSections={expandedSections}
                toggleSection={toggleSection}
                handleUpdateConfigValue={handleUpdateConfigValue}
              />
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

import { useState } from "react";
import { PipelineConfig } from "../types";
import { GeneralSettingsCard } from "./config/GeneralSettingsCard";
import { LlmConfigCard } from "./config/LlmConfigCard";
import { SplitterConfigCard } from "./config/SplitterConfigCard";
import { EmbeddingsConfigCard } from "./config/EmbeddingsConfigCard";
import { VectorDbConfigCard } from "./config/VectorDbConfigCard";
import { RetrievalConfigCard } from "./config/RetrievalConfigCard";
import { GenerationConfigCard } from "./config/GenerationConfigCard";
import { ObservabilityConfigCard } from "./config/ObservabilityConfigCard";
import { SafetyConfigCard } from "./config/SafetyConfigCard";

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
    </div>
  );
}

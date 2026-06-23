import { Eye, ChevronDown, ChevronUp } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface ObservabilityConfigCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function ObservabilityConfigCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: ObservabilityConfigCardProps) {
  const isExpanded = !!expandedSections["observability-advanced"];
  const logLevel = configData.observability?.logging?.level || "INFO";
  const tracingEnabled = configData.observability?.tracing?.enabled ?? true;
  const loggingFormat = configData.observability?.logging?.format || "json";
  const loggingOutput = configData.observability?.logging?.output || "stdout";
  const filePath = configData.observability?.logging?.file_path || "";
  const tracingProvider = configData.observability?.tracing?.provider || "opentelemetry";
  const tracingEndpoint = configData.observability?.tracing?.endpoint || "http://localhost:4317";
  const metricsEnabled = configData.observability?.metrics?.enabled ?? true;
  const metricsPort = configData.observability?.metrics?.port ?? 9090;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:shadow-md">
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
            <label className="text-xs font-semibold flex items-center gap-1">
              Logging Severity Level
              <InfoTooltip text="Determines the minimum severity level log messages must reach to be generated." />
            </label>
            <select
              value={logLevel}
              onChange={(e) => handleUpdateConfigValue(["observability", "logging", "level"], e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            >
              <option value="DEBUG">DEBUG</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors animate-fade-in">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold">Enable OTEL Tracing</span>
              <span className="text-[8px] text-slate-400 dark:text-slate-500">Record structured traces across pipeline stages</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={tracingEnabled}
                onChange={(e) => handleUpdateConfigValue(["observability", "tracing", "enabled"], e.target.checked)}
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
          onClick={() => toggleSection("observability-advanced")}
          className="flex items-center justify-between w-full text-xs font-bold text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition cursor-pointer"
        >
          <span>Advanced Settings</span>
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Log Print Format
                <InfoTooltip text="Log printing schema type." />
              </label>
              <select
                value={loggingFormat}
                onChange={(e) => handleUpdateConfigValue(["observability", "logging", "format"], e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
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
                value={loggingOutput}
                onChange={(e) => handleUpdateConfigValue(["observability", "logging", "output"], e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              >
                <option value="stdout">Standard Out (Console)</option>
                <option value="file">Local Log File Target</option>
              </select>
            </div>

            {loggingOutput === "file" && (
              <div className="flex flex-col gap-1.5 animate-fade-in">
                <label className="text-[11px] font-semibold flex items-center gap-1">
                  Log File Path
                  <InfoTooltip text="Absolute or relative file path target to output files." />
                </label>
                <input
                  type="text"
                  placeholder="logs/rag.log"
                  value={filePath}
                  onChange={(e) => handleUpdateConfigValue(["observability", "logging", "file_path"], e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Tracing Provider
                <InfoTooltip text="Target telemetry pipeline receiver." />
              </label>
              <select
                value={tracingProvider}
                onChange={(e) => handleUpdateConfigValue(["observability", "tracing", "provider"], e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              >
                <option value="opentelemetry">OpenTelemetry Collector</option>
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
                value={tracingEndpoint}
                onChange={(e) => handleUpdateConfigValue(["observability", "tracing", "endpoint"], e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>

            <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors animate-fade-in">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold">Prometheus Metrics</span>
                <span className="text-[8px] text-slate-400 dark:text-slate-500">Expose scraping endpoint for performance queries</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={metricsEnabled}
                  onChange={(e) => handleUpdateConfigValue(["observability", "metrics", "enabled"], e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-all"></div>
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Metrics Export Port
                <InfoTooltip text="Listening port for scraper metrics (e.g. 9090)." />
              </label>
              <input
                type="number"
                value={metricsPort}
                onChange={(e) => handleUpdateConfigValue(["observability", "metrics", "port"], parseInt(e.target.value) || 9090)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

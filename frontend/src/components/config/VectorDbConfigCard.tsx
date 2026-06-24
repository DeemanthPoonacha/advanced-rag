import { Database, ChevronDown, ChevronUp } from "lucide-react";
import { InfoTooltip } from "../ui/Tooltip";
import { PipelineConfig } from "../../types";

interface VectorDbConfigCardProps {
  configData: PipelineConfig;
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  handleUpdateConfigValue: (path: string[], value: any) => void;
}

export function VectorDbConfigCard({
  configData,
  expandedSections,
  toggleSection,
  handleUpdateConfigValue,
}: VectorDbConfigCardProps) {
  const isExpanded = !!expandedSections["database-advanced"];
  const provider = configData.vector_store?.provider || "qdrant";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition-all duration-300 hover:shadow-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-sm font-display flex items-center gap-2">
            <Database size={16} className="text-primary" />
            Vector Database
          </h3>
          <span className="text-[9px] uppercase font-extrabold tracking-widest text-slate-400">
            Database
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              Vector Store Provider
              <InfoTooltip text="Vector storage database provider." />
            </label>
            <select
              value={provider}
              onChange={(e) =>
                handleUpdateConfigValue(
                  ["vector_store", "provider"],
                  e.target.value,
                )
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
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
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold flex items-center gap-1">
              Collection / Index Name
              <InfoTooltip text="Database namespace collection or index name (synchronizes index_name and collection_name)." />
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
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
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
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {isExpanded && (
          <div className="space-y-3 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800/50 animate-fade-in">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold flex items-center gap-1">
                Vector Dimensions Size
                <InfoTooltip text="Size of the dense embedding vectors (must match output of selected embeddings model, e.g. 384 or 1536)." />
              </label>
              <input
                type="number"
                value={configData.vector_store?.config?.vector_size ?? 384}
                onChange={(e) =>
                  handleUpdateConfigValue(
                    ["vector_store", "config", "vector_size"],
                    parseInt(e.target.value) || 384,
                  )
                }
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>

            {provider === "qdrant" && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/50 transition-colors animate-fade-in">
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold">
                    Prefer gRPC Protocol
                  </span>
                  <span className="text-[8px] text-slate-400 dark:text-slate-500">
                    Use gRPC port 6334 instead of HTTP
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      configData.vector_store?.config?.prefer_grpc ?? true
                    }
                    onChange={(e) =>
                      handleUpdateConfigValue(
                        ["vector_store", "config", "prefer_grpc"],
                        e.target.checked,
                      )
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-all"></div>
                </label>
              </div>
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
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-slate-100 transition-colors"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { Database, X } from "lucide-react";

interface FileMetricsInspectorProps {
  selectedFile: {
    id: string;
    name: string;
    size: string;
    status: string;
    uploadTime: string;
    textCount: number;
    tableCount: number;
    imageCount: number;
    titleCount: number;
    otherCount: number;
    totalElements: number;
    totalChunks: number;
    summarizedChunks: number;
    chunks: any[];
    isMock: boolean;
  };
  setSelectedFileId: (id: string | null) => void;
  setOpenRegistryFiles: (
    updater: (prev: Record<string, boolean>) => Record<string, boolean>,
  ) => void;
}

export function FileMetricsInspector({
  selectedFile,
  setSelectedFileId,
  setOpenRegistryFiles,
}: FileMetricsInspectorProps) {
  const text = selectedFile.textCount || 0;
  const title = selectedFile.titleCount || 0;
  const table = selectedFile.tableCount || 0;
  const image = selectedFile.imageCount || 0;
  const total = text + title + table + image || 1;

  // Percentage calculations for dynamic visual meters
  const textPercent = Math.round((text / total) * 100);
  const titlePercent = Math.round((title / total) * 100);
  const tablePercent = Math.round((table / total) * 100);
  const imagePercent = Math.round((image / total) * 100);

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 flex justify-between items-center bg-slate-50 dark:bg-slate-950/20">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs font-bold text-slate-850 dark:text-slate-100 tracking-wide uppercase">
            File Ingestion Metrics
          </span>
        </div>
        <button
          onClick={() => {
            setSelectedFileId(null);
            setOpenRegistryFiles((prev) => ({
              ...prev,
              [selectedFile.id]: false,
            }));
          }}
          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-855 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-all duration-200 active:scale-90 cursor-pointer"
          title="Close Details"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
        {/* File Overview Info */}
        <div className="space-y-1">
          <div className="text-xs font-bold text-slate-850 dark:text-slate-100 truncate">
            {selectedFile.name}
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
            Uploaded: {selectedFile.uploadTime}
          </div>
        </div>

        {/* Detailed layout metrics stats block */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-xl p-4 shadow-sm space-y-4">
          <div className="text-[10px] font-bold text-primary uppercase tracking-wide">
            Ingestion Performance metrics
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/40 rounded-lg">
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                Partitioned Elements
              </div>
              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                {selectedFile.totalElements || 0}
              </div>
            </div>
            <div className="p-2.5 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/40 rounded-lg">
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                Semantic Chunks
              </div>
              <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                {selectedFile.totalChunks || 0}
              </div>
            </div>
            <div className="p-2.5 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/40 rounded-lg">
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                AI Summaries
              </div>
              <div className="text-sm font-extrabold text-yellow-600 dark:text-yellow-500 mt-0.5">
                {selectedFile.summarizedChunks || 0}
              </div>
            </div>
            <div className="p-2.5 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/40 rounded-lg">
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                Raw Text Chunks
              </div>
              <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-500 mt-0.5">
                {(selectedFile.totalChunks || 0) -
                  (selectedFile.summarizedChunks || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Partition Breakdown statistics with progress visual bars */}
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60 rounded-xl p-4 shadow-sm space-y-4">
          <div className="text-[10px] font-bold text-primary uppercase tracking-wide">
            Layout Partition Breakdown
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="text-slate-600 dark:text-slate-350">
                  Text elements
                </span>
                <span className="text-slate-850 dark:text-slate-200 font-bold">
                  {text} ({textPercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-850 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-500"
                  style={{ width: `${textPercent}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="text-slate-600 dark:text-slate-350">
                  Title / Header elements
                </span>
                <span className="text-slate-850 dark:text-slate-200 font-bold">
                  {title} ({titlePercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-855 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-sky-500 h-full transition-all duration-500"
                  style={{ width: `${titlePercent}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="text-slate-600 dark:text-slate-350">
                  Table elements
                </span>
                <span className="text-slate-850 dark:text-slate-200 font-bold">
                  {table} ({tablePercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-860 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-500"
                  style={{ width: `${tablePercent}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-semibold">
                <span className="text-slate-600 dark:text-slate-350">
                  Image elements
                </span>
                <span className="text-slate-850 dark:text-slate-200 font-bold">
                  {image} ({imagePercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-865 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-purple-500 h-full transition-all duration-500"
                  style={{ width: `${imagePercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

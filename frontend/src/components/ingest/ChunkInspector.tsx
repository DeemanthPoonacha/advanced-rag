import { Eye, X, Info } from "lucide-react";

interface ChunkInspectorProps {
  selectedChunk: {
    id: string;
    page: number;
    type: "text" | "image" | "table";
    snippet: string;
    originalText: string;
    summaryText: string;
    isRaw: boolean;
    metadata: Record<string, any>;
  };
  setSelectedChunk: (chunk: any) => void;
  inspectorTab: "original" | "summary" | "metadata";
  setInspectorTab: (tab: "original" | "summary" | "metadata") => void;
}

export function ChunkInspector({
  selectedChunk,
  setSelectedChunk,
  inspectorTab,
  setInspectorTab,
}: ChunkInspectorProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 flex justify-between items-center bg-slate-50 dark:bg-slate-950/20">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs font-bold text-slate-850 dark:text-slate-100 tracking-wide uppercase">Detail Inspector</span>
        </div>
        <button
          onClick={() => setSelectedChunk(null)}
          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-850 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-all duration-200 active:scale-90 cursor-pointer"
          title="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Selector tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 py-2 shrink-0 gap-1.5 bg-slate-50/50 dark:bg-slate-950/10">
        {[
          { key: "original", label: "Original Text" },
          { key: "summary", label: "AI Summary" },
          { key: "metadata", label: "Metadata" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setInspectorTab(tab.key as any)}
            className={`flex-1 py-1.5 px-2 text-center rounded-lg text-[10px] font-bold border transition-all duration-300 cursor-pointer ${
              inspectorTab === tab.key
                ? "bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 shadow-sm"
                : "bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-850 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Inspector view content */}
      <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4 scrollbar-thin">
        {/* ORIGINAL TEXT VIEW */}
        {inspectorTab === "original" && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wide">
                Original Content
              </div>
              <div className="bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl leading-relaxed text-slate-700 dark:text-slate-300 font-mono text-[11px] whitespace-pre-wrap select-text overflow-auto shadow-inner">
                {selectedChunk.originalText}
              </div>
            </div>

            {selectedChunk.type === "image" && (
              <div className="animate-fade-in">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wide">
                  Images (1)
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col gap-2 items-center justify-center">
                  {/* Transformer Architecture Diagram representation */}
                  <div className="w-full aspect-[4/3] bg-white dark:bg-[#0c111e] rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col p-2 text-[9px] font-semibold text-slate-500 dark:text-slate-400 shadow-inner">
                    <div className="text-center font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">Transformer Encoder-Decoder</div>
                    <div className="flex-1 flex gap-2 justify-center py-2">
                      <div className="w-20 bg-primary/10 border border-primary/20 rounded-md p-1 flex flex-col justify-between transition-all duration-300 hover:bg-primary/15">
                        <div className="text-center font-bold text-primary">Encoder</div>
                        <div className="bg-white dark:bg-[#10192e] border border-slate-200 dark:border-slate-800 text-center p-0.5 rounded shadow-sm text-[8px] truncate">Feed Forward</div>
                        <div className="bg-white dark:bg-[#10192e] border border-slate-200 dark:border-slate-800 text-center p-0.5 rounded shadow-sm text-[8px] truncate">Multi-Head Attn</div>
                      </div>
                      <div className="w-20 bg-accent/10 border border-accent/20 rounded-md p-1 flex flex-col justify-between transition-all duration-300 hover:bg-accent/15">
                        <div className="text-center font-bold text-accent">Decoder</div>
                        <div className="bg-white dark:bg-[#141020] border border-slate-200 dark:border-slate-850 text-center p-0.5 rounded shadow-sm text-[8px] truncate">Feed Forward</div>
                        <div className="bg-white dark:bg-[#141020] border border-slate-200 dark:border-slate-855 text-center p-0.5 rounded shadow-sm text-[8px] truncate">Masked Attn</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI SUMMARY VIEW */}
        {inspectorTab === "summary" && (
          <div className="space-y-3 animate-fade-in">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Searchable Summary (Vision LLM)
            </div>
            {selectedChunk.isRaw ? (
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400 text-[11px] leading-relaxed flex gap-2">
                <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <span className="font-semibold block mb-1">No AI Summary needed</span>
                  This chunk contains plain text, which is parsed and indexed directly in raw form to optimize latency, save token costs, and maintain high-fidelity accuracy.
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl leading-relaxed text-slate-700 dark:text-slate-300 font-mono text-[11px] whitespace-pre-wrap select-text shadow-inner">
                {selectedChunk.summaryText}
              </div>
            )}
          </div>
        )}

        {/* METADATA VIEW */}
        {inspectorTab === "metadata" && (
          <div className="space-y-3 animate-fade-in">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Chunk Metadata Parameters
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-inner">
              <table className="w-full text-left text-[11px] border-collapse">
                <tbody>
                  {Object.entries(selectedChunk.metadata).map(([key, value]) => (
                    <tr key={key} className="border-b border-slate-200 dark:border-slate-800/40 hover:bg-slate-100/30 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="p-2.5 font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-[#0d1220] select-none capitalize">
                        {key.replace(/_/g, " ")}
                      </td>
                      <td className="p-2.5 text-slate-700 dark:text-slate-200 break-all select-text font-mono">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

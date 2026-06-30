import { useMemo } from "react";
import { Eye, X, Info, Loader2 } from "lucide-react";
import { useStore } from "../../store/useStore";
import "./ChunkInspector.css";
import Markdown from "react-markdown";

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
  const setPreviewImageUrl = useStore((s) => s.setPreviewImageUrl);

  const parseMarkdownTable = (markdown: string): string | null => {
    const lines = markdown.trim().split("\n");
    const tableLines = lines.filter(
      (l) => l.trim().startsWith("|") && l.trim().endsWith("|"),
    );
    if (tableLines.length < 2) return null;

    const hasSeparator = tableLines[1].includes("-");
    if (!hasSeparator) return null;

    let html = "<table>";
    tableLines.forEach((line, idx) => {
      if (idx === 1) return;
      const cols = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      html += "<tr>";
      cols.forEach((col) => {
        const tag = idx === 0 ? "th" : "td";
        html += `<${tag}>${col}</${tag}>`;
      });
      html += "</tr>";
    });
    html += "</table>";
    return html;
  };

  const getImages = () => {
    const imgs: string[] = [];
    if (selectedChunk.metadata?.custom?.image_base64) {
      imgs.push(selectedChunk.metadata.custom.image_base64);
    }
    if (Array.isArray(selectedChunk.metadata?.custom?.images_base64)) {
      imgs.push(...selectedChunk.metadata.custom.images_base64);
    }
    return imgs.filter(Boolean);
  };
  const imagesList = useMemo(() => getImages(), [selectedChunk]);

  const getTables = () => {
    const tbls: string[] = [];
    if (
      selectedChunk.type === "table" &&
      selectedChunk.originalText.includes("<table")
    ) {
      tbls.push(selectedChunk.originalText);
    }
    if (Array.isArray(selectedChunk.metadata?.custom?.tables_html)) {
      tbls.push(...selectedChunk.metadata.custom.tables_html);
    }
    if (tbls.length === 0 && selectedChunk.type === "table") {
      const mdTable = parseMarkdownTable(selectedChunk.originalText);
      if (mdTable) {
        tbls.push(mdTable);
      }
    }
    return tbls.filter(Boolean);
  };
  const tablesList = useMemo(() => getTables(), [selectedChunk]);

  const formatImageSrc = (b64: string) => {
    if (b64.startsWith("data:image/")) {
      return b64;
    }
    return `data:image/png;base64,${b64}`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 flex justify-between items-center bg-slate-50 dark:bg-slate-950/20">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs font-bold text-slate-850 dark:text-slate-100 tracking-wide uppercase">
            Detail Inspector
          </span>
        </div>
        <button
          onClick={() => setSelectedChunk(null)}
          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-855 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 transition-all duration-200 active:scale-90 cursor-pointer"
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

            {/* REAL IMAGES VIEW */}
            {imagesList.length > 0 && (
              <div className="animate-fade-in space-y-2">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  Images ({imagesList.length})
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {imagesList.map((imgB64, idx) => (
                    <div
                      key={idx}
                      className="bg-white dark:bg-[#0c111e] p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col items-center justify-center shadow-sm"
                    >
                      <img
                        src={formatImageSrc(imgB64)}
                        alt={`Extracted Layout Image ${idx + 1}`}
                        className="max-w-full max-h-87.5 object-contain rounded-lg border border-slate-100 dark:border-slate-900 shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity"
                        onClick={() => setPreviewImageUrl(formatImageSrc(imgB64))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* REAL TABLES VIEW */}
            {tablesList.length > 0 && (
              <div className="animate-fade-in space-y-2">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  Tables ({tablesList.length})
                </div>
                <div className="space-y-3">
                  {tablesList.map((tableHtml, idx) => (
                    <div
                      key={idx}
                      className="bg-white dark:bg-[#0c111e] p-4 border border-slate-200 dark:border-slate-800 rounded-xl overflow-auto max-w-full text-slate-800 dark:text-slate-200 shadow-sm table-render-container"
                    >
                      <div dangerouslySetInnerHTML={{ __html: tableHtml }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* IMAGE NOT AVAILABLE FALLBACK */}
            {selectedChunk.type === "image" && imagesList.length === 0 && (
              <div className="animate-fade-in">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 tracking-wide">
                  Image Preview
                </div>
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-amber-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1">
                      Image payload not extracted
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs">
                      The layout parser detected this image region and extracted
                      OCR text, but the raw image bytes could not be captured.
                      Try re-ingesting the document to trigger the image
                      extraction fallback.
                    </p>
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
              (selectedChunk.type === "image" || selectedChunk.type === "table") ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-600 dark:text-amber-400 text-[11px] leading-relaxed flex gap-2 animate-pulse">
                  <Loader2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-spin" />
                  <div>
                    <span className="font-semibold block mb-1">
                      AI Summary Pending Generation
                    </span>
                    This complex layout element ({selectedChunk.type}) requires an AI summary for vector grounding, but the summarizer is currently processing this document in the background. Chunks will be re-indexed as soon as it's completed.
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-emerald-600 dark:text-emerald-400 text-[11px] leading-relaxed flex gap-2">
                  <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <span className="font-semibold block mb-1">
                      No AI Summary needed
                    </span>
                    This chunk contains plain text, which is parsed and indexed
                    directly in raw form to optimize latency, save token costs,
                    and maintain high-fidelity accuracy.
                  </div>
                </div>
              )
            ) : (
              <div className="bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200 dark:border-slate-800/80 rounded-xl leading-relaxed text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap select-text shadow-inner">
               <Markdown>
                {selectedChunk.summaryText}
               </Markdown>
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
                  {Object.entries(selectedChunk.metadata)
                    .filter(([k]) => k !== "custom")
                    .map(([key, value]) => (
                      <tr
                        key={key}
                        className="border-b border-slate-200 dark:border-slate-800/40 hover:bg-slate-100/30 dark:hover:bg-slate-900/40 transition-colors"
                      >
                        <td className="p-2.5 font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-[#0d1220] select-none capitalize">
                          {key.replace(/_/g, " ")}
                        </td>
                        <td className="p-2.5 text-slate-700 dark:text-slate-200 break-all select-text font-mono">
                          {typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-inner">
              <table className="w-full text-left text-[11px] border-collapse">
                <tbody>
                  {Object.entries(selectedChunk.metadata.custom || {})
                    .filter(
                      ([k]) => k !== "image_base64" && k !== "tables_html",
                    )
                    .map(([key, value]) => (
                      <tr
                        key={key}
                        className="border-b border-slate-200 dark:border-slate-800/40 hover:bg-slate-100/30 dark:hover:bg-slate-900/40 transition-colors"
                      >
                        <td className="p-2.5 font-bold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-[#0d1220] select-none capitalize">
                          {key.replace(/_/g, " ")}
                        </td>
                        <td className="p-2.5 text-slate-700 dark:text-slate-200 break-all select-text font-mono">
                          {key === "images_base64"
                            ? (value as string[]).map((img, imgIdx) => (
                                <img
                                  key={imgIdx}
                                  src={formatImageSrc(img)}
                                  alt={`Extracted Layout Image ${key}`}
                                  className="max-w-full max-h-87.5 object-contain rounded-lg border border-slate-100 dark:border-slate-900 shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity"
                                  onClick={() => setPreviewImageUrl(formatImageSrc(img))}
                                />
                              ))
                            : typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {!!selectedChunk.metadata.custom?.tables_html?.length && (
              <div className="animate-fade-in space-y-2">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  Tables ({selectedChunk.metadata.custom?.tables_html.length})
                </div>
                <div className="space-y-3">
                  {(selectedChunk.metadata.custom?.tables_html as string[]).map(
                    (tableHtml, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-[#0c111e] p-4 border border-slate-200 dark:border-slate-800 rounded-xl overflow-auto max-w-full text-slate-800 dark:text-slate-200 shadow-sm table-render-container"
                      >
                        <div dangerouslySetInnerHTML={{ __html: tableHtml }} />
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

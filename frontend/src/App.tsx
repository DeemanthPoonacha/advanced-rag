import { useEffect, useState, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ChatPanel } from "./components/ChatPanel";
import { IngestPanel } from "./components/IngestPanel";
import { ConfigPanel } from "./components/ConfigPanel";
import { Toast } from "./components/ui/Toast";
import { useStore } from "./store/useStore";
import {
  useRagStatus,
  useDocuments,
  usePipelineConfig,
  useIngestStatus,
} from "./api/queries";
import { X, Download, FileText, Loader2 } from "lucide-react";

function DocumentPreviewModal({
  docName,
  onClose,
}: {
  docName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("");
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchDocument = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `http://localhost:8000/api/documents/${encodeURIComponent(docName)}/raw`,
        );
        if (!res.ok) {
          throw new Error("Document not found or unavailable");
        }

        const contentType = res.headers.get("content-type") || "";
        const blob = await res.blob();

        // Revoke previous blob URL
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        // Determine file type from extension or content-type
        const ext = docName.split(".").pop()?.toLowerCase() || "";
        let detectedType = "";

        if (
          contentType.includes("image/") ||
          ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)
        ) {
          detectedType = "image";
        } else if (contentType.includes("pdf") || ext === "pdf") {
          detectedType = "pdf";
        } else if (
          contentType.includes("text/") ||
          [
            "txt",
            "md",
            "py",
            "js",
            "ts",
            "json",
            "csv",
            "html",
            "css",
            "xml",
            "yaml",
            "yml",
          ].includes(ext)
        ) {
          detectedType = "text";
          const text = await blob.text();
          setTextContent(text);
        }

        setFileType(detectedType);
        setPreviewUrl(url);
      } catch (err: any) {
        setError(err.message || "Failed to load document");
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [docName]);

  const handleDownload = () => {
    if (previewUrl) {
      const a = document.createElement("a");
      a.href = previewUrl;
      a.download = docName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm font-semibold">Loading document...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400">
          <FileText className="w-12 h-12" />
          <div className="text-center">
            <p className="text-sm font-bold text-rose-500 mb-1">
              Preview unavailable
            </p>
            <p className="text-xs text-slate-500">{error}</p>
          </div>
          <a
            href={`http://localhost:8000/api/documents/${encodeURIComponent(docName)}/raw`}
            download
            className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition cursor-pointer flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Download instead
          </a>
        </div>
      );
    }

    if (fileType === "image" && previewUrl) {
      return (
        <div className="flex-1 flex items-center justify-center p-4">
          <img
            src={previewUrl}
            alt={docName}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          />
        </div>
      );
    }

    if (fileType === "pdf" && previewUrl) {
      return (
        <iframe
          src={previewUrl}
          className="flex-1 w-full border-0 rounded-b-xl"
          title={docName}
        />
      );
    }

    if (fileType === "text" && textContent !== null) {
      return (
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            {textContent}
          </pre>
        </div>
      );
    }

    // Fallback: offer download
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400">
        <FileText className="w-12 h-12" />
        <p className="text-sm font-semibold">
          Preview not available for this file type
        </p>
        <a
          href={`http://localhost:8000/api/documents/${encodeURIComponent(docName)}/raw`}
          download
          className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary/90 transition cursor-pointer flex items-center gap-2"
        >
          <Download className="w-3.5 h-3.5" />
          Download File
        </a>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-[90vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
              {docName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg text-xs font-semibold transition cursor-pointer"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              title="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        {renderContent()}
      </div>
    </div>
  );
}

export default function App() {
  const activePage = useStore((s) => s.activePage);
  const toast = useStore((s) => s.toast);
  const previewImageUrl = useStore((s) => s.previewImageUrl);
  const setPreviewImageUrl = useStore((s) => s.setPreviewImageUrl);
  const previewDocName = useStore((s) => s.previewDocName);
  const setPreviewDocName = useStore((s) => s.setPreviewDocName);

  // Initialize status & config queries on mount
  useRagStatus();
  useDocuments();
  usePipelineConfig();
  useIngestStatus();

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      <Toast toast={toast} />

      {/* Image Preview Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md animate-fade-in cursor-zoom-out"
          onClick={() => setPreviewImageUrl(null)}
        >
          <button
            className="absolute top-6 right-6 p-2.5 rounded-full bg-slate-900/60 text-white hover:bg-slate-800 transition cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImageUrl(null);
            }}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewImageUrl}
            alt="Layout Preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl border border-slate-800 animate-scale-up cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDocName && (
        <DocumentPreviewModal
          docName={previewDocName}
          onClose={() => setPreviewDocName(null)}
        />
      )}

      <Sidebar />

      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
        <Header />

        <main className="flex-1 overflow-hidden p-8 flex flex-col">
          {activePage === "chat" && <ChatPanel />}
          {activePage === "ingest" && <IngestPanel />}
          {activePage === "config" && <ConfigPanel />}
        </main>
      </div>
    </div>
  );
}

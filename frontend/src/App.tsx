import React, { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ChatPanel } from "./components/ChatPanel";
import { IngestPanel } from "./components/IngestPanel";
import { ConfigPanel } from "./components/ConfigPanel";
import { Toast } from "./components/ui/Toast";
import { useStore } from "./store/useStore";
import { useRagStatus, useDocuments, usePipelineConfig, useIngestStatus } from "./api/queries";

export default function App() {
  const activePage = useStore((s) => s.activePage);
  const toast = useStore((s) => s.toast);

  // Initialize status & config queries on mount
  useRagStatus();
  useDocuments();
  usePipelineConfig();
  useIngestStatus();

  useEffect(() => {
    // Add dark mode classes on mount
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {/* Toast popup */}
      <Toast toast={toast} />

      {/* Navigation Drawer Left Sidebar */}
      <Sidebar />

      {/* Main Panel Content Window */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Page Header bar */}
        <Header />

        {/* Content routing container */}
        <main className="flex-1 overflow-hidden p-8 flex flex-col">
          {/* PAGE 1: CHAT DASHBOARD */}
          {activePage === "chat" && <ChatPanel />}

          {/* PAGE 2: DOCUMENT INGEST */}
          {activePage === "ingest" && <IngestPanel />}

          {/* PAGE 3: PIPELINE CONFIG */}
          {activePage === "config" && <ConfigPanel />}
        </main>
      </div>
    </div>
  );
}

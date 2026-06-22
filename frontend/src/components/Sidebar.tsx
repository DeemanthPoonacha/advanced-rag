import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  FileText,
  Settings,
  Sun,
  Moon,
  Zap,
  ChevronLeft,
  ChevronRight,
  Database
} from "lucide-react";
import { RAGStatus } from "../types";

interface SidebarProps {
  activePage: "chat" | "ingest" | "config";
  setActivePage: (page: "chat" | "ingest" | "config") => void;
  status: RAGStatus | null;
  handleToggleMock: (checked: boolean) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Sidebar({
  activePage,
  setActivePage,
  status,
  handleToggleMock,
  isDarkMode,
  toggleTheme,
}: SidebarProps) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("sidebar_width");
    return saved ? parseInt(saved, 10) : 240;
  });
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const [isResizing, setIsResizing] = useState(false);

  const startResizeSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(64, Math.min(320, e.clientX));
      if (newWidth < 120) {
        setSidebarCollapsed(true);
        setSidebarWidth(64);
      } else {
        setSidebarCollapsed(false);
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    localStorage.setItem("sidebar_width", sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  const isRAGActive = status?.status === "active";

  return (
    <div
      style={{ width: sidebarCollapsed ? 64 : sidebarWidth }}
      className="bg-white/80 dark:bg-slate-900/80 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full backdrop-blur-md relative shrink-0 transition-all duration-150 select-none"
    >
      {/* Branding Header */}
      <div
        className={cn(
          "border-b border-slate-200 dark:border-slate-800",
          sidebarCollapsed ? "p-4 flex justify-center" : "p-5"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="bg-primary text-white p-2 rounded-xl shadow-md flex items-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          {!sidebarCollapsed && (
            <div>
              <h1 className="font-title text-base font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent tracking-wide leading-none">
                Advanced RAG
              </h1>
              <p className="text-[9px] font-title font-medium text-slate-400 dark:text-slate-500 uppercase tracking-[1px] mt-1">
                Modular AI Pipeline
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav
        className={cn(
          "flex-1 py-4 flex flex-col gap-1.5",
          sidebarCollapsed ? "px-2 items-center" : "px-3"
        )}
      >
        <button
          onClick={() => setActivePage("chat")}
          className={cn(
            "flex items-center rounded-xl transition-all duration-200 cursor-pointer border border-transparent w-full text-left",
            sidebarCollapsed
              ? "p-2.5 justify-center w-10 h-10"
              : "w-full gap-3 px-3.5 py-2.5 text-sm font-semibold",
            activePage === "chat"
              ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50"
          )}
          title={sidebarCollapsed ? "Assistant Chat" : undefined}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0 text-primary" />
          {!sidebarCollapsed && <span>Assistant Chat</span>}
        </button>

        <button
          onClick={() => setActivePage("ingest")}
          className={cn(
            "flex items-center rounded-xl transition-all duration-200 cursor-pointer border border-transparent w-full text-left",
            sidebarCollapsed
              ? "p-2.5 justify-center w-10 h-10"
              : "w-full gap-3 px-3.5 py-2.5 text-sm font-semibold",
            activePage === "ingest"
              ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50"
          )}
          title={sidebarCollapsed ? "Knowledge Base" : undefined}
        >
          <FileText className="w-4 h-4 shrink-0 text-primary" />
          {!sidebarCollapsed && <span>Knowledge Base</span>}
        </button>

        <button
          onClick={() => setActivePage("config")}
          className={cn(
            "flex items-center rounded-xl transition-all duration-200 cursor-pointer border border-transparent w-full text-left",
            sidebarCollapsed
              ? "p-2.5 justify-center w-10 h-10"
              : "w-full gap-3 px-3.5 py-2.5 text-sm font-semibold",
            activePage === "config"
              ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50"
          )}
          title={sidebarCollapsed ? "Pipeline Config" : undefined}
        >
          <Settings className="w-4 h-4 shrink-0 text-primary" />
          {!sidebarCollapsed && <span>Pipeline Config</span>}
        </button>
      </nav>

      {/* Telemetry/Status Footer */}
      <div
        className={cn(
          "border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-black/10 flex flex-col gap-3.5",
          sidebarCollapsed ? "p-3 items-center" : "p-4"
        )}
      >
        {/* Sandbox Mode Toggle */}
        {!sidebarCollapsed ? (
          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold tracking-tight">Sandbox Mode</span>
              <span className="text-[8px] text-slate-400 dark:text-slate-500">Mock responses</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={status?.mock_mode || false}
                onChange={(e) => handleToggleMock(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        ) : (
          <button
            onClick={() => handleToggleMock(!status?.mock_mode)}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center border transition-all cursor-pointer",
              status?.mock_mode
                ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                : "bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-850 dark:border-slate-800"
            )}
            title={`Sandbox Mode: ${status?.mock_mode ? "ON" : "OFF"}`}
          >
            <Zap size={14} className={status?.mock_mode ? "animate-pulse" : ""} />
          </button>
        )}

        {/* Database Stats */}
        {!sidebarCollapsed && isRAGActive && status?.chunk_count !== undefined && (
          <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200/40 dark:border-slate-800/40 text-[10px] text-slate-500 dark:text-slate-400">
            <Database size={12} className="text-primary shrink-0" />
            <span className="font-medium">
              Indexed Chunks: <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{status.chunk_count}</span>
            </span>
          </div>
        )}

        {/* Status indicator & Theme toggle */}
        <div className={cn("flex items-center w-full justify-between", sidebarCollapsed ? "flex-col gap-2.5" : "flex-row")}>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "w-2 h-2 rounded-full",
              isRAGActive
                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
            )} />
            {!sidebarCollapsed && (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isRAGActive ? "active" : "offline"}
              </span>
            )}
          </div>

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition shadow-sm cursor-pointer"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={startResizeSidebar}
        className="absolute right-0 top-0 bottom-0 w-1 hover:w-1.5 bg-transparent hover:bg-primary/40 cursor-col-resize transition-all duration-150 z-30"
      />

      {/* Collapse/Expand Toggle Button */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="absolute -right-3 top-10 w-6 h-6 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center justify-center cursor-pointer shadow-sm z-40 transition-transform duration-200 hover:scale-105"
        title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {sidebarCollapsed ? (
          <ChevronRight size={10} />
        ) : (
          <ChevronLeft size={10} />
        )}
      </button>
    </div>
  );
}

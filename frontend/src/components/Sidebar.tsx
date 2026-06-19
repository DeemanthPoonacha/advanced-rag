import React from "react";
import { LayoutDashboard, FileText, Settings, Sun, Moon, Zap } from "lucide-react";
import { RAGStatus } from "../types";

interface SidebarProps {
  activePage: "chat" | "ingest" | "config";
  setActivePage: (page: "chat" | "ingest" | "config") => void;
  status: RAGStatus | null;
  handleToggleMock: (checked: boolean) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export function Sidebar({
  activePage,
  setActivePage,
  status,
  handleToggleMock,
  isDarkMode,
  toggleTheme,
}: SidebarProps) {
  return (
    <div className="w-64 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shrink-0">
      {/* Header Logo */}
      <div className="p-5 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
        <div className="bg-primary text-white p-2 rounded-lg shadow-md flex items-center">
          <Zap className="w-5 h-5" />
        </div>
        <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent font-display">
          Advanced RAG
        </span>
      </div>

      {/* Sidebar Nav Buttons */}
      <nav className="flex-1 p-4 flex flex-col gap-2">
        <button
          onClick={() => setActivePage("chat")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-205 ${
            activePage === "chat"
              ? "bg-primary/10 text-primary dark:bg-primary/20"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Assistant Chat</span>
        </button>

        <button
          onClick={() => setActivePage("ingest")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-205 ${
            activePage === "ingest"
              ? "bg-primary/10 text-primary dark:bg-primary/20"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <FileText className="w-5 h-5" />
          <span>Document Ingest</span>
        </button>

        <button
          onClick={() => setActivePage("config")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-205 ${
            activePage === "config"
              ? "bg-primary/10 text-primary dark:bg-primary/20"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          <Settings className="w-5 h-5" />
          <span>Pipeline Config</span>
        </button>
      </nav>

      {/* Sidebar Footer status module */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-4">
        {/* Mock toggle checkbox */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800/50">
          <div className="flex flex-col">
            <span className="text-xs font-semibold">Sandbox Mode</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Mock responses</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={status?.mock_mode || false}
              onChange={(e) => handleToggleMock(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>RAG Status</span>
          <span
            className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
              status?.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
            }`}
          >
            {status?.status === "active" ? "active" : "offline"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">Theme</span>
          <button
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

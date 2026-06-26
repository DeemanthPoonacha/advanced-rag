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
  Database,
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Cpu,
  Sparkles,
  Layers,
  ShieldCheck,
  Bookmark,
  Loader2,
} from "lucide-react";
import { useStore } from "../store/useStore";
import {
  useRagStatus,
  usePresets,
  useActivatePreset,
  useDeletePreset,
} from "../api/queries";
import { Conversation } from "../types";

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

const getPresetIcon = (name: string) => {
  switch (name) {
    case "local_sandbox":
      return <Cpu className="w-4 h-4 text-sky-500 shrink-0" />;
    case "enterprise_accuracy":
      return (
        <Sparkles className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
      );
    case "multimodal_layout":
      return <Layers className="w-4 h-4 text-purple-500 shrink-0" />;
    case "strict_security":
      return <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />;
    default:
      return <Bookmark className="w-4 h-4 text-rose-500 shrink-0" />;
  }
};

export function Sidebar() {
  const activePage = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);
  const isDarkMode = useStore((s) => s.isDarkMode);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const conversations = useStore((s) => s.conversations);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const setActiveConversationId = useStore((s) => s.setActiveConversationId);
  const onNewConversation = useStore((s) => s.handleNewConversation);
  const onDeleteConversation = useStore((s) => s.handleDeleteConversation);
  const onRenameConversation = useStore((s) => s.handleRenameConversation);

  const { data: statusQuery } = useRagStatus();
  const status = statusQuery || null;
  const setShowSavePresetModal = useStore((s) => s.setShowSavePresetModal);
  const { data: presetsData } = usePresets();
  const presets = presetsData?.presets || [];
  const activePreset = presetsData?.active_preset || null;
  const activatePresetMutation = useActivatePreset();
  const deletePresetMutation = useDeletePreset();
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
          sidebarCollapsed ? "p-4 flex justify-center" : "p-5",
        )}
      >
        <div className="flex items-center gap-3">
          <div className="bg-primary text-white p-2 rounded-xl shadow-md flex items-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          {!sidebarCollapsed && (
            <div>
              <h1 className="font-title text-base font-bold bg-linear-to-r from-primary to-accent bg-clip-text text-transparent tracking-wide leading-none">
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
          "shrink-0 py-4 flex flex-col gap-1.5 border-b border-slate-200/50 dark:border-slate-800/60",
          sidebarCollapsed ? "px-2 items-center" : "px-3",
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
              : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50",
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
              : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50",
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
              : "text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50",
          )}
          title={sidebarCollapsed ? "Pipeline Config" : undefined}
        >
          <Settings className="w-4 h-4 shrink-0 text-primary" />
          {!sidebarCollapsed && <span>Pipeline Config</span>}
        </button>
      </nav>

      {/* Conversations List */}
      {activePage === "chat" && !sidebarCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden py-3">
          <div className="px-4 mb-2 flex items-center justify-between shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
              Recent Chats
            </span>
            <button
              onClick={onNewConversation}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-primary hover:text-primary-hover transition-colors cursor-pointer"
              title="New Chat"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1 scrollbar-thin">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onClick={() => setActiveConversationId(conv.id)}
                onDelete={() => onDeleteConversation(conv.id)}
                onRename={(title) => onRenameConversation(conv.id, title)}
              />
            ))}
            {conversations.length === 0 && (
              <div className="text-center py-8 text-[11px] text-slate-400 dark:text-slate-500">
                No recent chats
              </div>
            )}
          </div>
        </div>
      )}

      {activePage === "chat" && sidebarCollapsed && (
        <div className="py-2 flex flex-col items-center shrink-0 border-b border-slate-200/50 dark:border-slate-800/60">
          <button
            onClick={onNewConversation}
            className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-805 flex items-center justify-center text-primary hover:text-primary-hover shadow-sm transition-all cursor-pointer"
            title="New Chat"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      {/* Pipeline Presets List */}
      {activePage === "config" && !sidebarCollapsed && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden py-3">
          <div className="px-4 mb-2 flex items-center justify-between shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
              Pipeline Presets
            </span>
            <button
              onClick={() => setShowSavePresetModal(true)}
              className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-primary hover:text-primary-hover transition-colors cursor-pointer"
              title="Save Preset"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1 scrollbar-thin">
            {presets.length === 0 && (
              <div className="text-center py-8 text-[11px] text-slate-400 dark:text-slate-500">
                No presets available
              </div>
            )}
            {presets.map((preset) => {
              const isActive = activePreset === preset.name;
              const isPending =
                activatePresetMutation.isPending &&
                activatePresetMutation.variables === preset.name;
              return (
                <div
                  key={preset.name}
                  className={cn(
                    "group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium cursor-pointer transition-all duration-150 border border-transparent select-none",
                    isActive
                      ? "bg-primary/5 border-primary/20 text-primary dark:bg-primary/10"
                      : "text-slate-650 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-850/50",
                  )}
                  onClick={() => {
                    if (!isActive && !isPending) {
                      activatePresetMutation.mutate(preset.name);
                    }
                  }}
                  title={preset.description}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getPresetIcon(preset.name)}
                    <span className="truncate pr-1 text-[11px]">
                      {preset.label || preset.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-bold text-emerald-500 uppercase tracking-wider">
                        Active
                      </span>
                    )}
                    {isPending && (
                      <Loader2
                        size={12}
                        className="animate-spin text-primary"
                      />
                    )}
                    {!preset.is_predefined && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePresetMutation.mutate(preset.name);
                        }}
                        className="p-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Preset"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activePage === "config" && sidebarCollapsed && (
        <div className="py-2 flex flex-col items-center shrink-0 border-b border-slate-200/50 dark:border-slate-800/60">
          <button
            onClick={() => setShowSavePresetModal(true)}
            className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-805 flex items-center justify-center text-primary hover:text-primary-hover shadow-sm transition-all cursor-pointer"
            title="Save Preset"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      {/* Telemetry/Status Footer */}
      <div
        className={cn(
          "border-t mt-auto border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-black/10 flex flex-col gap-3.5",
          sidebarCollapsed ? "p-3 items-center" : "p-4",
        )}
      >
        {/* Database Stats */}
        {!sidebarCollapsed &&
          isRAGActive &&
          status?.chunk_count !== undefined && (
            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white dark:bg-slate-950/40 border border-slate-200/40 dark:border-slate-800/40 text-[10px] text-slate-500 dark:text-slate-400">
              <Database size={12} className="text-primary shrink-0" />
              <span className="font-medium">
                Indexed Chunks:{" "}
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {status.chunk_count}
                </span>
              </span>
            </div>
          )}

        {/* Status indicator & Theme toggle */}
        <div
          className={cn(
            "flex items-center w-full justify-between",
            sidebarCollapsed ? "flex-col gap-2.5" : "flex-row",
          )}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                isRAGActive
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]",
              )}
            />
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

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete,
  onRename,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);

  useEffect(() => {
    setEditTitle(conversation.title);
  }, [conversation.title]);

  const handleSaveRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      onRename(editTitle.trim());
      setIsEditing(false);
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(conversation.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (editTitle.trim()) {
        onRename(editTitle.trim());
        setIsEditing(false);
      }
    } else if (e.key === "Escape") {
      setEditTitle(conversation.title);
      setIsEditing(false);
    }
  };

  return (
    <div
      onClick={isEditing ? undefined : onClick}
      className={cn(
        "group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium cursor-pointer transition-all duration-150 border border-transparent select-none",
        isActive
          ? "bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-white font-semibold"
          : "text-slate-650 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-850/50",
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MessageSquare
          size={13}
          className={isActive ? "text-primary animate-pulse" : "text-slate-400"}
        />
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-white dark:bg-slate-950 border border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 text-[11px] text-slate-900 dark:text-slate-100"
            autoFocus
          />
        ) : (
          <span className="truncate pr-1 text-[11px]">
            {conversation.title}
          </span>
        )}
      </div>

      {!isEditing && (
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            title="Rename Chat"
          >
            <Edit2 size={11} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-500"
            title="Delete Chat"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}

      {isEditing && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleSaveRename}
            className="p-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-500"
          >
            <Check size={11} />
          </button>
          <button
            onClick={handleCancelRename}
            className="p-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500"
          >
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

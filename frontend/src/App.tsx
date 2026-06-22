import React, { useState, useEffect, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ChatPanel } from "./components/ChatPanel";
import { IngestPanel } from "./components/IngestPanel";
import { ConfigPanel } from "./components/ConfigPanel";
import { Toast } from "./components/ui/Toast";
import { Message, RAGStatus, PipelineConfig, ToastState, UploadLog } from "./types";

const API_BASE = "http://localhost:8000";

function jsonToYaml(obj: any, indent = 0): string {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj !== "object") {
    if (typeof obj === "string") {
      if (obj.includes("\n")) {
        const lines = obj.split("\n");
        const spaces = " ".repeat(indent + 2);
        return "|\n" + lines.map(line => spaces + line).join("\n");
      }
      const hasSpecial = /[:#\?\{\}\[\]\s,\|&\*!%@`"']/.test(obj) || obj === "true" || obj === "false" || obj === "null" || !isNaN(Number(obj));
      if (hasSpecial) {
        return `"${obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      }
      return obj;
    }
    return String(obj);
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const spaces = " ".repeat(indent);
    return obj.map(item => `\n${spaces}- ${jsonToYaml(item, indent + 2)}`).join("");
  }
  
  let yamlStr = "";
  const keys = Object.keys(obj);
  keys.forEach((key, idx) => {
    const val = obj[key];
    const spaces = " ".repeat(indent);
    
    if (val === null || val === undefined) {
      yamlStr += `${spaces}${key}: null`;
    } else if (typeof val === "object" && !Array.isArray(val) && Object.keys(val).length === 0) {
      yamlStr += `${spaces}${key}: {}`;
    } else if (typeof val === "object") {
      yamlStr += `${spaces}${key}:\n${jsonToYaml(val, indent + 2)}`;
    } else {
      yamlStr += `${spaces}${key}: ${jsonToYaml(val, indent)}`;
    }
    
    if (idx < keys.length - 1) {
      yamlStr += "\n";
    }
  });
  return yamlStr;
}

export default function App() {
  const [activePage, setActivePage] = useState<"chat" | "ingest" | "config">("chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: "assistant",
      text: "Hello! Welcome to the AI assistant query center. Use the left menu to Ingest new documents into the database or configure LLM and vector settings. Once ready, ask me questions here and watch chunks retrieve live.",
      status: "done",
    },
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<RAGStatus | null>(null);
  const [rawYaml, setRawYaml] = useState("");
  const [configData, setConfigData] = useState<PipelineConfig | null>(null);
  const [editMode, setEditMode] = useState<"visual" | "yaml">("visual");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<UploadLog[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [streamResponse, setStreamResponse] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize status & config
  useEffect(() => {
    fetchStatus();
    fetchConfig();
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error("Failed to fetch API status", e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/config`);
      if (res.ok) {
        const data = await res.json();
        setRawYaml(data.raw_yaml);
        setConfigData(data.resolved_config);
      }
    } catch (e) {
      console.error("Failed to fetch pipeline config", e);
    }
  };

  const handleToggleMock = async (checked: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/toggle-mode?mock=${checked}`, {
        method: "POST",
      });
      if (res.ok) {
        showToast(
          checked ? "Switched to Mock Sandbox Mode" : "Switched to Standard RAG Mode",
          "success"
        );
        fetchStatus();
        fetchConfig();
      }
    } catch (e) {
      showToast("Failed to toggle execution modes", "error");
    }
  };

  const handleUpdateConfigValue = (path: string[], value: any) => {
    setConfigData((prev) => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev));
      let current = copy;
      for (let i = 0; i < path.length - 1; i++) {
        if (current[path[i]] === undefined || current[path[i]] === null) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return copy;
    });
  };

  const handleSaveConfig = async () => {
    try {
      let res;
      if (editMode === "yaml") {
        res = await fetch(`${API_BASE}/api/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml_content: rawYaml }),
        });
      } else {
        res = await fetch(`${API_BASE}/api/config/json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(configData),
        });
      }

      const data = await res.json();
      if (res.ok) {
        showToast("Configuration applied and pipeline reloaded!", "success");
        fetchStatus();
        fetchConfig();
      } else {
        const detail = data.detail;
        let errMsg = typeof detail === "string" ? detail : detail.message || "Validation failed";
        if (detail.errors) {
          errMsg += ": " + detail.errors.map((err: any) => `${err.loc.join(".")}: ${err.msg}`).join(", ");
        }
        showToast(errMsg, "error");
      }
    } catch (e) {
      showToast("Network error saving configuration", "error");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    showToast(`Uploading ${files.length} document(s)...`, "success");

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        showToast(`Ingested successfully! Created ${data.total_chunks_ingested} chunks.`, "success");
        const parsedFiles: UploadLog[] = data.files.map((f: any) => ({
          filename: f.filename,
          chunks_count: f.chunks_count,
          date: new Date().toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        }));
        setUploadLogs((prev) => [...parsedFiles, ...prev]);
        fetchStatus();
      } else {
        showToast(data.detail || "Ingestion failed", "error");
      }
    } catch (e) {
      showToast("Upload failed due to connection error", "error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const queryText = input.trim();
    setInput("");
    setIsGenerating(true);

    const userMsg: Message = { sender: "user", text: queryText, status: "done" };
    setMessages((prev) => [...prev, userMsg]);

    setMessages((prev) => [
      ...prev,
      {
        sender: "assistant",
        text: "",
        status: "loading",
        sources: null,
        evaluation: null,
      },
    ]);

    if (streamResponse) {
      try {
        const response = await fetch(`${API_BASE}/api/query/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryText }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Server error");
        }

        if (!response.body) {
          throw new Error("ReadableStream not supported by response.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let collectedText = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const textChunk = decoder.decode(value, { stream: true });
          const lines = textChunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const token = line.slice(6);
              collectedText += token;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  text: collectedText,
                  status: "streaming",
                };
                return next;
              });
            }
          }
        }

        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: "done",
          };
          return next;
        });
      } catch (err: any) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: `[Error: ${err.message || "Failed to generate stream response."}]`,
            status: "done",
          };
          return next;
        });
      } finally {
        setIsGenerating(false);
      }
    } else {
      try {
        const response = await fetch(`${API_BASE}/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryText }),
        });
        const data = await response.json();

        if (response.ok) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              sender: "assistant",
              text: data.answer,
              status: "done",
              latency: data.latency_ms,
              sources: data.sources,
              evaluation: data.metadata.evaluation,
            };
            return next;
          });
        } else {
          throw new Error(data.detail || "Query execution failed");
        }
      } catch (err: any) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: `[Error: ${err.message || "Failed to retrieve response."}]`,
            status: "done",
          };
          return next;
        });
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    document.documentElement.style.setProperty("color-scheme", nextDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", nextDark ? "dark" : "light");
  };

  const handleSetEditMode = async (mode: "visual" | "yaml") => {
    if (mode === "yaml" && editMode === "visual" && configData) {
      try {
        const yamlStr = jsonToYaml(configData);
        setRawYaml(yamlStr);
      } catch (e) {
        console.error("Failed to serialize visual config to YAML", e);
      }
    } else if (mode === "visual" && editMode === "yaml" && rawYaml) {
      try {
        const res = await fetch(`${API_BASE}/api/config/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ yaml_content: rawYaml }),
        });
        if (res.ok) {
          const data = await res.json();
          setConfigData(data.resolved_config);
        } else {
          const data = await res.json();
          const detail = data.detail;
          let errMsg = typeof detail === "string" ? detail : detail.message || "Invalid YAML";
          if (detail.errors) {
            errMsg += ": " + detail.errors.map((err: any) => `${err.loc.join(".")}: ${err.msg}`).join(", ");
          }
          showToast(`YAML parsing failed: ${errMsg}`, "error");
          return;
        }
      } catch (e) {
        showToast("Error connecting to parser endpoint", "error");
        return;
      }
    }
    setEditMode(mode);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      {/* Toast popup */}
      <Toast toast={toast} />

      {/* Navigation Drawer Left Sidebar */}
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        status={status}
        handleToggleMock={handleToggleMock}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
      />

      {/* Main Panel Content Window */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Page Header bar */}
        <Header activePage={activePage} status={status} />

        {/* Content routing container */}
        <main className="flex-1 overflow-hidden p-8 flex flex-col">
          {/* PAGE 1: CHAT DASHBOARD */}
          {activePage === "chat" && (
            <ChatPanel
              messages={messages}
              isGenerating={isGenerating}
              streamResponse={streamResponse}
              setStreamResponse={setStreamResponse}
              handleSendMessage={handleSendMessage}
              input={input}
              setInput={setInput}
              messagesEndRef={messagesEndRef}
            />
          )}

          {/* PAGE 2: DOCUMENT INGEST */}
          {activePage === "ingest" && (
            <IngestPanel
              status={status}
              isUploading={isUploading}
              uploadLogs={uploadLogs}
              handleFileUpload={handleFileUpload}
              fileInputRef={fileInputRef}
            />
          )}

          {/* PAGE 3: PIPELINE CONFIG */}
          {activePage === "config" && (
            <ConfigPanel
              configData={configData}
              rawYaml={rawYaml}
              setRawYaml={setRawYaml}
              editMode={editMode}
              setEditMode={handleSetEditMode}
              handleUpdateConfigValue={handleUpdateConfigValue}
              handleSaveConfig={handleSaveConfig}
              fetchConfig={fetchConfig}
            />
          )}

        </main>
      </div>
    </div>
  );
}

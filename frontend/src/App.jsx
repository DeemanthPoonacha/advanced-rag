import React, { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:8000";

// SVG Icons for clean responsive toolbar navigation
const DashboardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const SunIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const MoonIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SendIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

const CloudUploadIcon = () => (
  <svg className="w-10 h-10 text-primary animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 0 1-.88-7.903A5 5 0 1 1 15.9 6L16 6a5 5 0 0 1 1 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const HelpIcon = () => (
  <svg className="w-3.5 h-3.5 text-slate-400 hover:text-primary transition-colors duration-150" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3m0 4h.01" />
  </svg>
);

// Info Tooltip subcomponent styled Shadcn-like
function InfoTooltip({ text }) {
  return (
    <div className="relative inline-block ml-1.5 tooltip-trigger cursor-help">
      <HelpIcon />
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 text-[10px] leading-normal text-white bg-slate-900 border border-slate-700 rounded-md shadow-lg opacity-0 invisible translate-y-1 transition-all duration-200 z-50 tooltip-content">
        {text}
      </div>
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState("chat"); // "chat" | "ingest" | "config"
  const [messages, setMessages] = useState([
    {
      sender: "assistant",
      text: "Hello! Welcome to the AI assistant query center. Use the left menu to Ingest new documents into the database or configure LLM and vector settings. Once ready, ask me questions here and watch chunks retrieve live.",
      status: "done"
    }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState(null);
  const [rawYaml, setRawYaml] = useState("");
  const [configData, setConfigData] = useState(null);
  const [editMode, setEditMode] = useState("visual"); // "visual" | "yaml"
  const [isUploading, setIsUploading] = useState(false);
  const [uploadLogs, setUploadLogs] = useState([]);
  const [toast, setToast] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [streamResponse, setStreamResponse] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize status & config
  useEffect(() => {
    fetchStatus();
    fetchConfig();
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

  const showToast = (text, type = "success") => {
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

  const handleToggleMock = async (checked) => {
    try {
      const res = await fetch(`${API_BASE}/api/toggle-mode?mock=${checked}`, {
        method: "POST"
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

  const handleUpdateConfigValue = (path, value) => {
    setConfigData(prev => {
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
          body: JSON.stringify({ yaml_content: rawYaml })
        });
      } else {
        res = await fetch(`${API_BASE}/api/config/json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(configData)
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
          errMsg += ": " + detail.errors.map(err => `${err.loc.join(".")}: ${err.msg}`).join(", ");
        }
        showToast(errMsg, "error");
      }
    } catch (e) {
      showToast("Network error saving configuration", "error");
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    showToast(`Uploading ${files.length} document(s)...`, "success");

    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });

    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        showToast(`Ingested successfully! Created ${data.total_chunks_ingested} chunks.`, "success");
        const parsedFiles = data.files.map(f => ({
          filename: f.filename,
          chunks_count: f.chunks_count,
          date: new Date().toLocaleDateString()
        }));
        setUploadLogs(prev => [...parsedFiles, ...prev]);
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

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const queryText = input.trim();
    setInput("");
    setIsGenerating(true);

    const userMsg = { sender: "user", text: queryText, status: "done" };
    setMessages(prev => [...prev, userMsg]);

    setMessages(prev => [...prev, {
      sender: "assistant",
      text: "",
      status: "loading",
      sources: null,
      evaluation: null
    }]);

    if (streamResponse) {
      try {
        const response = await fetch(`${API_BASE}/api/query/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryText })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Server error");
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
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = {
                  ...next[next.length - 1],
                  text: collectedText,
                  status: "streaming"
                };
                return next;
              });
            }
          }
        }

        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: "done"
          };
          return next;
        });

      } catch (err) {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: `[Error: ${err.message || "Failed to generate stream response."}]`,
            status: "done"
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
          body: JSON.stringify({ query: queryText })
        });
        const data = await response.json();

        if (response.ok) {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = {
              sender: "assistant",
              text: data.answer,
              status: "done",
              latency: data.latency_ms,
              sources: data.sources,
              evaluation: data.metadata.evaluation
            };
            return next;
          });
        } else {
          throw new Error(data.detail || "Query execution failed");
        }
      } catch (err) {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: `[Error: ${err.message || "Failed to retrieve response."}]`,
            status: "done"
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
    document.documentElement.style.setProperty("color-scheme", nextDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", nextDark ? "dark" : "light");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      
      {/* Toast popup */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold shadow-lg text-white animate-fade-in ${
          toast.type === "success" ? "bg-emerald-600 shadow-emerald-950/20" : "bg-rose-600 shadow-rose-950/20"
        }`}>
          {toast.text}
        </div>
      )}

      {/* Navigation Drawer Left Sidebar */}
      <div className="w-64 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm shrink-0">
        <div className="p-5 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
          <div className="bg-primary text-white p-2 rounded-lg shadow-md flex items-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent font-display">
            Advanced RAG
          </span>
        </div>

        {/* Sidebar Nav Buttons */}
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button
            onClick={() => setActivePage("chat")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
              activePage === "chat"
                ? "bg-primary/10 text-primary dark:bg-primary/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <DashboardIcon />
            <span>Assistant Chat</span>
          </button>

          <button
            onClick={() => setActivePage("ingest")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
              activePage === "ingest"
                ? "bg-primary/10 text-primary dark:bg-primary/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <DocumentIcon />
            <span>Document Ingest</span>
          </button>

          <button
            onClick={() => setActivePage("config")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
              activePage === "config"
                ? "bg-primary/10 text-primary dark:bg-primary/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <SettingsIcon />
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
            <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
              status?.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
            }`}>
              {status?.status === "active" ? "active" : "offline"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">Theme</span>
            <button className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={toggleTheme}>
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </div>

      {/* Main Panel Content Window */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Page Header bar */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-8 z-10 shrink-0">
          <div>
            <h1 className="text-lg font-bold font-display">
              {activePage === "chat" && "Assistant Chat Dashboard"}
              {activePage === "ingest" && "Knowledge Base Ingest"}
              {activePage === "config" && "Pipeline Configuration Settings"}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {status?.mock_mode ? "Sandbox Mode Active — simulating RAG actions" : `Generic Engine Tier: ${status?.environment || "Development"}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-3 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-800 rounded-md shadow-sm">
              Vectors: {status?.chunk_count ?? 0} Chunks
            </span>
          </div>
        </header>

        {/* Content routing container */}
        <main className="flex-1 overflow-hidden p-8 flex flex-col">

          {/* PAGE 1: CHAT DASHBOARD */}
          {activePage === "chat" && (
            <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {/* Message scroll log */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"} animate-fade-in`}>
                    <div className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm text-sm border leading-relaxed ${
                      msg.sender === "user"
                        ? "bg-primary text-white border-primary/20 rounded-br-none"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800/80 rounded-bl-none"
                    }`}>
                      <div>
                        {msg.text}
                        {msg.status === "streaming" && <span className="streaming-caret" />}
                        {msg.status === "loading" && (
                          <div className="flex gap-1.5 py-1.5">
                            <span className="streaming-caret animate-pulse" />
                            <span className="streaming-caret animate-pulse delay-150" />
                            <span className="streaming-caret animate-pulse delay-300" />
                          </div>
                        )}
                      </div>

                      {/* Detail Accordions */}
                      {msg.sender === "assistant" && (msg.sources || msg.evaluation) && (
                        <MessageDetails sources={msg.sources} evaluation={msg.evaluation} latency={msg.latency} />
                      )}
                    </div>
                    <div className="mt-1.5 flex gap-2 text-[10px] font-semibold text-slate-400 px-1.5">
                      <span>{msg.sender === "user" ? "You" : "RAG Assistant"}</span>
                      {msg.latency && <span className="font-mono">({msg.latency.toFixed(0)}ms)</span>}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input form */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 shrink-0">
                <form className="flex items-center gap-3" onSubmit={handleSendMessage}>
                  <input
                    type="text"
                    placeholder="Ask a question about the uploaded document corpus..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-full px-5 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder-slate-400"
                    disabled={isGenerating}
                  />

                  {/* Mode switcher (Stream vs Evaluate) */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 px-3 py-1.5 rounded-full shadow-sm text-xs font-medium shrink-0">
                    <span className="text-slate-500">Stream</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={streamResponse}
                        onChange={(e) => setStreamResponse(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                    <span className="text-slate-500">Evaluate</span>
                  </div>

                  <button
                    type="submit"
                    className="p-3 rounded-full bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/20 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:shadow-none transition-all duration-200 shrink-0"
                    disabled={!input.trim() || isGenerating}
                  >
                    <SendIcon />
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* PAGE 2: DOCUMENT INGEST */}
          {activePage === "ingest" && (
            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
              {/* Left Column: Drag & Drop Ingestion */}
              <div className="flex-1 flex flex-col gap-6 max-h-full overflow-y-auto">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-md font-bold mb-1 font-display">Ingest Documents</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                    Parse and compile files into mathematical vectors. Documents will be chunked semantically and stored in the database.
                  </p>
                  
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-primary dark:hover:border-primary rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer bg-slate-50 dark:bg-slate-950/20 hover:bg-primary/5 transition-all duration-300"
                  >
                    <CloudUploadIcon />
                    <div className="text-sm font-semibold">Click or drag files to upload</div>
                    <div className="text-xs text-slate-400">Supports PDF, DOCX, TXT, or Markdown (Max 25MB)</div>
                    <input
                      type="file"
                      multiple
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex-1 flex flex-col min-h-[300px]">
                  <h3 className="text-md font-bold mb-4 font-display">Ingested Files Registry</h3>
                  {uploadLogs.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                      <svg className="w-12 h-12 text-slate-300 dark:text-slate-800 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <p className="text-sm">No files uploaded yet in this session</p>
                      <p className="text-xs text-slate-400 mt-1">Upload files above to compile the RAG registry.</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
                            <th className="py-2.5">Document Filename</th>
                            <th className="py-2.5">Generated Chunks</th>
                            <th className="py-2.5">Uploaded Date</th>
                            <th className="py-2.5 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uploadLogs.map((log, idx) => (
                            <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                              <td className="py-3 font-medium max-w-[280px] truncate pr-4">{log.filename}</td>
                              <td className="py-3 font-semibold text-primary">{log.chunks_count} chunks</td>
                              <td className="py-3 text-slate-500">{log.date}</td>
                              <td className="py-3 text-right">
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                                  compiled
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Status Summary */}
              <div className="w-full md:w-80 flex flex-col gap-6 shrink-0 max-h-full overflow-y-auto">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-md font-bold mb-4 font-display">Ingestion Engine Settings</h3>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-slate-500">Parser Model</span>
                      <span className="font-semibold">{status?.parser_provider || "unstructured"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-slate-500">Chunking Strategy</span>
                      <span className="font-semibold">{status?.chunker_provider || "semantic"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-slate-500">DB Schema Collection</span>
                      <span className="font-semibold">{status?.collection_name || "documents"}</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-slate-500">Indexing Engine</span>
                      <span className="font-semibold text-accent">{status?.vector_store_provider || "qdrant"}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-primary/10 to-accent/5 dark:from-primary/20 dark:to-accent/10 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-md font-bold mb-2 font-display text-primary">Semantic Ingestion</h3>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    The Semantic Chunker uses dense embeddings to identify natural transitions in text. Rather than breaking text arbitrarily at character counts, it calculates embedding similarity across adjacent sentences to keep coherent topics intact.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 3: PIPELINE CONFIG */}
          {activePage === "config" && (
            <div className="flex-1 flex flex-col gap-6 max-w-5xl w-full mx-auto overflow-hidden">
              
              {/* Editor Switcher (Form vs YAML) */}
              <div className="flex items-center justify-between shrink-0">
                <div className="flex gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-sm">
                  <button
                    onClick={() => setEditMode("visual")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      editMode === "visual"
                        ? "bg-primary text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    Visual Config Grid
                  </button>
                  <button
                    onClick={() => setEditMode("yaml")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      editMode === "yaml"
                        ? "bg-primary text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    Raw YAML Block
                  </button>
                </div>

                <div className="flex gap-3">
                  <button onClick={fetchConfig} className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                    Reset Changes
                  </button>
                  <button onClick={handleSaveConfig} className="px-5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/20 transition">
                    Apply & Rebuild Pipeline
                  </button>
                </div>
              </div>

              {/* Sub-window */}
              <div className="flex-1 overflow-hidden">
                {editMode === "visual" ? (
                  configData ? (
                    <div className="h-full overflow-y-auto pr-2 grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                      
                      {/* Card 1: General & Ingestion */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                          <h3 className="font-bold text-md font-display">General & Project settings</h3>
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Project</span>
                        </div>

                        <div className="space-y-3">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center">
                              Pipeline Project Name
                              <InfoTooltip text="Unique name identifying this RAG pipeline in logs and metrics." />
                            </label>
                            <input
                              type="text"
                              value={configData.project?.name || ""}
                              onChange={(e) => handleUpdateConfigValue(["project", "name"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center">
                              Environment Environment
                              <InfoTooltip text="System runtime environment tier (determines tracing levels)." />
                            </label>
                            <select
                              value={configData.project?.environment || "development"}
                              onChange={(e) => handleUpdateConfigValue(["project", "environment"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                            >
                              <option value="development">Development</option>
                              <option value="staging">Staging</option>
                              <option value="production">Production</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Card 2: Chunker Splitter Settings */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                          <h3 className="font-bold text-md font-display">Ingestion Splitter Settings</h3>
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Chunker</span>
                        </div>

                        <div className="space-y-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center">
                              Splitting Strategy
                              <InfoTooltip text="Splitting algorithm. Semantic uses sentence differences; Recursive uses character counters." />
                            </label>
                            <select
                              value={configData.ingestion?.chunker?.provider || "semantic"}
                              onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "provider"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                            >
                              <option value="semantic">Semantic Chunker</option>
                              <option value="recursive">Recursive Character</option>
                              <option value="hierarchical">Hierarchical Parent-Child</option>
                              <option value="fixed_size">Fixed Size Splitter</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center justify-between">
                              <span className="flex items-center">Target Chunk Size (Chars)<InfoTooltip text="Maximum number of characters per document vector chunk." /></span>
                              <span className="font-mono text-[11px] font-bold text-primary">{configData.ingestion?.chunker?.config?.target_chunk_size || 500}</span>
                            </label>
                            <input
                              type="range"
                              min="100"
                              max="1500"
                              step="50"
                              value={configData.ingestion?.chunker?.config?.target_chunk_size || 500}
                              onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "config", "target_chunk_size"], parseInt(e.target.value))}
                              className="w-full accent-primary"
                            />
                          </div>

                          {configData.ingestion?.chunker?.provider === "semantic" && (
                            <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-semibold flex items-center justify-between">
                                <span className="flex items-center">Semantic Buffer Size<InfoTooltip text="Number of sentence lookaheads to evaluate semantic boundary splits." /></span>
                                <span className="font-mono text-[11px] font-bold text-primary">{configData.ingestion?.chunker?.config?.buffer_size ?? 1}</span>
                              </label>
                              <input
                                type="range"
                                min="0"
                                max="5"
                                step="1"
                                value={configData.ingestion?.chunker?.config?.buffer_size ?? 1}
                                onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "config", "buffer_size"], parseInt(e.target.value))}
                                className="w-full accent-primary"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card 3: Retrieval & Matching */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                          <h3 className="font-bold text-md font-display">Search & Retrieval Engine</h3>
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">Retrieval</span>
                        </div>

                        <div className="space-y-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center">
                              Search Strategy
                              <InfoTooltip text="Retrieval logic. Simple queries dense index; Multi-Query expands with LLM prompts." />
                            </label>
                            <select
                              value={configData.retrieval?.strategy || "simple"}
                              onChange={(e) => handleUpdateConfigValue(["retrieval", "strategy"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                            >
                              <option value="simple">Simple Dense Search</option>
                              <option value="multi_query">Multi-Query Expansion</option>
                              <option value="contextual_compression">Contextual Compression</option>
                              <option value="auto_merging">Auto-Merging Retrieval</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center justify-between">
                              <span className="flex items-center">Top K Chunks<InfoTooltip text="Maximum number of matched document vectors retrieved to inject into prompt context." /></span>
                              <span className="font-mono text-[11px] font-bold text-primary">{configData.retrieval?.top_k || 5}</span>
                            </label>
                            <input
                              type="range"
                              min="1"
                              max="20"
                              step="1"
                              value={configData.retrieval?.top_k || 5}
                              onChange={(e) => handleUpdateConfigValue(["retrieval", "top_k"], parseInt(e.target.value))}
                              className="w-full accent-primary"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center justify-between">
                              <span className="flex items-center">Similarity Threshold<InfoTooltip text="Minimum cosine similarity score required for chunks to be retrieved." /></span>
                              <span className="font-mono text-[11px] font-bold text-primary">{(configData.retrieval?.similarity_threshold || 0.7).toFixed(2)}</span>
                            </label>
                            <input
                              type="range"
                              min="0.0"
                              max="1.0"
                              step="0.05"
                              value={configData.retrieval?.similarity_threshold || 0.7}
                              onChange={(e) => handleUpdateConfigValue(["retrieval", "similarity_threshold"], parseFloat(e.target.value))}
                              className="w-full accent-primary"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Card 4: LLM Generation Settings */}
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                          <h3 className="font-bold text-md font-display">LLM & completions settings</h3>
                          <span className="text-[10px] uppercase font-extrabold tracking-widest text-slate-400">LLM</span>
                        </div>

                        <div className="space-y-4">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center">
                              LLM Provider API
                              <InfoTooltip text="Large Language Model hosting API endpoint provider." />
                            </label>
                            <select
                              value={configData.llm?.provider || "openai"}
                              onChange={(e) => handleUpdateConfigValue(["llm", "provider"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                            >
                              <option value="openai">OpenAI GPT</option>
                              <option value="anthropic">Anthropic Claude</option>
                              <option value="cohere">Cohere Command</option>
                              <option value="local">Local Transformer</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center">
                              Model Identifier
                              <InfoTooltip text="Specific model tag running completions (e.g. gpt-4o-mini)." />
                            </label>
                            <input
                              type="text"
                              value={configData.llm?.config?.model || ""}
                              onChange={(e) => handleUpdateConfigValue(["llm", "config", "model"], e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:border-primary"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold flex items-center justify-between">
                              <span className="flex items-center">Temperature (Creativity)<InfoTooltip text="Creativity controller. 0.0 is deterministic and focused; 1.0 is highly creative." /></span>
                              <span className="font-mono text-[11px] font-bold text-primary">{(configData.llm?.config?.temperature ?? 0.1).toFixed(2)}</span>
                            </label>
                            <input
                              type="range"
                              min="0.0"
                              max="1.0"
                              step="0.05"
                              value={configData.llm?.config?.temperature ?? 0.1}
                              onChange={(e) => handleUpdateConfigValue(["llm", "config", "temperature"], parseFloat(e.target.value))}
                              className="w-full accent-primary"
                            />
                          </div>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                      Loading configuration settings...
                    </div>
                  )
                ) : (
                  <div className="h-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                    <textarea
                      value={rawYaml}
                      onChange={(e) => setRawYaml(e.target.value)}
                      className="flex-1 w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs font-mono focus:outline-none focus:border-primary resize-none leading-relaxed"
                    />
                  </div>
                )}
              </div>

            </div>
          )}

        </main>
      </div>

    </div>
  );
}

// Sub-component for Citations and Evaluation Metrics Accordions
function MessageDetails({ sources, evaluation, latency }) {
  const [openSection, setOpenSection] = useState(null);

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-800/80 space-y-2.5">
      {/* Sources Citations */}
      {sources && sources.length > 0 && (
        <div>
          <div
            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer select-none"
            onClick={() => toggleSection("citations")}
          >
            <svg
              className="w-3.5 h-3.5 transition-transform duration-200"
              style={{ transform: openSection === "citations" ? "rotate(90deg)" : "rotate(0deg)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Sources Cited ({sources.length})
          </div>
          {openSection === "citations" && (
            <div className="mt-2 space-y-2.5 animate-slide-down">
              {sources.map((src, i) => (
                <div key={i} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/50 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between font-bold text-[10px] text-slate-400">
                    <span className="truncate max-w-[200px]">Doc {i + 1}: {src.metadata?.filename || src.metadata?.source || "Doc"}</span>
                    <span className="text-accent font-mono">Similarity: {(src.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="italic text-slate-600 dark:text-slate-300 leading-relaxed font-sans pr-1">
                    {src.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Evaluations details */}
      {evaluation && (
        <div>
          <div
            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer select-none"
            onClick={() => toggleSection("eval")}
          >
            <svg
              className="w-3.5 h-3.5 transition-transform duration-200"
              style={{ transform: openSection === "eval" ? "rotate(90deg)" : "rotate(0deg)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Automated Quality Metrics
          </div>
          {openSection === "eval" && (
            <div className="mt-2 animate-slide-down">
              {evaluation.error ? (
                <div className="text-xs text-rose-500 font-semibold">
                  Metrics evaluation failed: {evaluation.error}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(evaluation.metrics || {}).map(([metric, score]) => (
                    <div key={metric} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider pr-1">
                        {metric.replace("_", " ")}
                      </span>
                      <span className={`text-md font-bold font-display ${
                        Number(score) >= 0.70 ? "text-emerald-500" : "text-amber-500"
                      }`}>
                        {Number(score).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {latency && (
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 flex flex-col gap-0.5">
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                        Inference Time
                      </span>
                      <span className="text-md font-bold text-slate-700 dark:text-slate-300 font-display">
                        {latency.toFixed(0)} ms
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

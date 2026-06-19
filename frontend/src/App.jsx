import React, { useState, useEffect, useRef } from "react";

const API_BASE = "http://localhost:8000";

// Inline SVG Icons for premium look without extra packages
const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

const ConfigIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.5 1z"></path>
  </svg>
);

const UploadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
);

const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="18.36" x2="5.64" y2="19.78"></line>
    <line x1="18.36" y1="4.22" x2="19.78" y2="5.64"></line>
  </svg>
);

const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

export default function App() {
  const [messages, setMessages] = useState([
    {
      sender: "assistant",
      text: "Hello! Upload some document files in the sidebar and ask me anything about them. I support semantic chunking, dynamic retrievals, output evaluations, and live streaming completions.",
      status: "done"
    }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState(null);
  const [rawYaml, setRawYaml] = useState("");
  const [configData, setConfigData] = useState(null);
  const [editMode, setEditMode] = useState("visual"); // "visual" | "yaml"
  const [activeTab, setActiveTab] = useState("upload"); // "upload" | "config"
  const [isUploading, setIsUploading] = useState(false);
  const [uploadLogs, setUploadLogs] = useState([]);
  const [toast, setToast] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [streamResponse, setStreamResponse] = useState(true); // Toggle streaming vs full evaluation query
  const [isGenerating, setIsGenerating] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize and load status/config
  useEffect(() => {
    fetchStatus();
    fetchConfig();
    
    // Set initial dark theme
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  // Toast auto-clear
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

  const handleToggleMock = async (checked) => {
    try {
      const res = await fetch(`${API_BASE}/api/toggle-mode?mock=${checked}`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        showToast(
          checked ? "Switched to Mock Sandbox Mode (No API keys needed)" : "Switched to Standard RAG Mode",
          "success"
        );
        fetchStatus();
        fetchConfig();
      }
    } catch (e) {
      showToast("Failed to switch execution modes", "error");
    }
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
        showToast("Configuration saved and orchestrator reloaded!", "success");
        fetchStatus();
        fetchConfig(); // Sync both states
      } else {
        const detail = data.detail;
        let errMsg = typeof detail === "string" ? detail : detail.message || "Validation failed";
        if (detail.errors) {
          errMsg += ": " + detail.errors.map(err => `${err.loc.join(".")}: ${err.msg}`).join(", ");
        }
        showToast(errMsg, "error");
      }
    } catch (e) {
      showToast("Network error trying to update config", "error");
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    showToast(`Uploading ${files.length} file(s)...`, "success");
    
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
        showToast(`Ingestion completed! Added ${data.total_chunks_ingested} chunks.`, "success");
        setUploadLogs(prev => [...data.files, ...prev]);
        fetchStatus();
      } else {
        showToast(data.detail || "Upload failed", "error");
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

    // 1. Add User message
    const userMsg = { sender: "user", text: queryText, status: "done" };
    setMessages(prev => [...prev, userMsg]);

    // 2. Add placeholder Assistant message
    const placeholderIndex = messages.length + 1;
    setMessages(prev => [...prev, {
      sender: "assistant",
      text: "",
      status: "loading",
      sources: null,
      evaluation: null
    }]);

    if (streamResponse) {
      // ── Streaming Mode (SSE) ──
      try {
        const response = await fetch(`${API_BASE}/api/query/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: queryText })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Server error during streaming");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let collectedText = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const textChunk = decoder.decode(value, { stream: true });
          
          // Parse Server Sent Events format
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

        // Finalize streaming
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
            text: `[Error: ${err.message || "Failed to stream answer."}]`,
            status: "done"
          };
          return next;
        });
      } finally {
        setIsGenerating(false);
      }
    } else {
      // ── Full Evaluated Blocking Query Mode ──
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
          throw new Error(data.detail || "Query failed");
        }
      } catch (err) {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: `[Error: ${err.message || "Failed to generate answer."}]`,
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
    <div className="dashboard-container">
      {/* Toast Notification Banner */}
      {toast && (
        <div className={`toast-msg ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* Sidebar Panel */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div style={{ background: "var(--color-primary)", color: "white", padding: "6px", borderRadius: "8px", display: "flex" }}>
            <ChatIcon />
          </div>
          <h2>Enterprise RAG</h2>
        </div>

        <div className="sidebar-content">
          {/* Mock Mode Switch */}
          <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem" }}>
            <div className="toggle-control">
              <div>
                <span style={{ fontWeight: 600, fontSize: "0.85rem", display: "block" }}>Mock Sandbox Mode</span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>Runs with mock data locally</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={status?.mock_mode || false}
                  onChange={(e) => handleToggleMock(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {/* Navigation tabs inside Sidebar */}
          <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.5rem" }}>
            <button
              onClick={() => setActiveTab("upload")}
              className={`btn btn-secondary ${activeTab === "upload" ? "active" : ""}`}
              style={{ flex: 1, padding: "0.4rem 0.8rem", border: activeTab === "upload" ? "1px solid var(--color-primary)" : "1px solid var(--color-border)" }}
            >
              Document Ingest
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`btn btn-secondary ${activeTab === "config" ? "active" : ""}`}
              style={{ flex: 1, padding: "0.4rem 0.8rem", border: activeTab === "config" ? "1px solid var(--color-primary)" : "1px solid var(--color-border)" }}
            >
              Config Settings
            </button>
          </div>

          {/* Tab 1: Upload Zone */}
          {activeTab === "upload" && (
            <div style={{ display: "flex", flex: "1", flexDirection: "column", gap: "1.2rem" }}>
              <div>
                <h4 className="section-title">Upload Documents</h4>
                <div 
                  className="upload-zone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="upload-icon"><UploadIcon /></div>
                  <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>Click to select files</div>
                  <div className="upload-text">Supports PDF, TXT, Markdown, etc.</div>
                  <input
                    type="file"
                    multiple
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              {/* Ingested files log */}
              {uploadLogs.length > 0 && (
                <div style={{ display: "flex", flex: "1", flexDirection: "column" }}>
                  <h4 className="section-title">Ingested Files Log</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "160px", overflowY: "auto" }}>
                    {uploadLogs.map((log, idx) => (
                      <div key={idx} className="ingest-log-item">
                        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>{log.filename}</span>
                        <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>{log.chunks_count} chunks</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Config Settings */}
          {activeTab === "config" && (
            <div style={{ display: "flex", flex: "1", flexDirection: "column", gap: "0.8rem", overflow: "hidden" }}>
              {/* Sub-tab Toggle (Visual Form vs Raw YAML) */}
              <div style={{ display: "flex", gap: "0.2rem", background: "var(--color-surface-card)", padding: "0.2rem", borderRadius: "8px", border: "1px solid var(--color-border)" }}>
                <button
                  onClick={() => setEditMode("visual")}
                  className="btn"
                  style={{ flex: 1, padding: "0.4rem", fontSize: "0.75rem", borderRadius: "6px", border: "none", background: editMode === "visual" ? "var(--color-surface)" : "transparent", color: "var(--color-text)", boxShadow: editMode === "visual" ? "var(--shadow-sm)" : "none" }}
                >
                  Visual Form
                </button>
                <button
                  onClick={() => setEditMode("yaml")}
                  className="btn"
                  style={{ flex: 1, padding: "0.4rem", fontSize: "0.75rem", borderRadius: "6px", border: "none", background: editMode === "yaml" ? "var(--color-surface)" : "transparent", color: "var(--color-text)", boxShadow: editMode === "yaml" ? "var(--shadow-sm)" : "none" }}
                >
                  Raw YAML
                </button>
              </div>

              {editMode === "visual" ? (
                configData ? (
                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.2rem", paddingRight: "0.2rem" }}>
                    
                    {/* General Section */}
                    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem" }}>
                      <h4 className="section-title">General Project</h4>
                      
                      <div className="form-group">
                        <label>Project Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={configData.project?.name || ""}
                          onChange={(e) => handleUpdateConfigValue(["project", "name"], e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>Environment</label>
                        <select
                          className="form-control"
                          value={configData.project?.environment || "development"}
                          onChange={(e) => handleUpdateConfigValue(["project", "environment"], e.target.value)}
                        >
                          <option value="development">Development</option>
                          <option value="staging">Staging</option>
                          <option value="production">Production</option>
                        </select>
                      </div>
                    </div>

                    {/* Ingestion & Chunking */}
                    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem" }}>
                      <h4 className="section-title">Ingestion & Chunking</h4>
                      
                      <div className="form-group">
                        <label>Chunker Provider</label>
                        <select
                          className="form-control"
                          value={configData.ingestion?.chunker?.provider || "semantic"}
                          onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "provider"], e.target.value)}
                        >
                          <option value="semantic">Semantic Chunker</option>
                          <option value="recursive">Recursive Character</option>
                          <option value="hierarchical">Hierarchical Parent-Child</option>
                          <option value="fixed_size">Fixed Size Splitter</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Target Chunk Size (Chars)</label>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="100"
                            max="1500"
                            step="50"
                            value={configData.ingestion?.chunker?.config?.target_chunk_size || 500}
                            onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "config", "target_chunk_size"], parseInt(e.target.value))}
                          />
                          <span className="slider-val">{configData.ingestion?.chunker?.config?.target_chunk_size || 500}</span>
                        </div>
                      </div>

                      {configData.ingestion?.chunker?.provider === "semantic" && (
                        <div className="form-group">
                          <label>Semantic Buffer Size</label>
                          <div className="slider-container">
                            <input
                              type="range"
                              min="0"
                              max="5"
                              step="1"
                              value={configData.ingestion?.chunker?.config?.buffer_size ?? 1}
                              onChange={(e) => handleUpdateConfigValue(["ingestion", "chunker", "config", "buffer_size"], parseInt(e.target.value))}
                            />
                            <span className="slider-val">{configData.ingestion?.chunker?.config?.buffer_size ?? 1}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Retrieval Section */}
                    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem" }}>
                      <h4 className="section-title">Retrieval strategy</h4>
                      
                      <div className="form-group">
                        <label>Search Strategy</label>
                        <select
                          className="form-control"
                          value={configData.retrieval?.strategy || "simple"}
                          onChange={(e) => handleUpdateConfigValue(["retrieval", "strategy"], e.target.value)}
                        >
                          <option value="simple">Simple Dense Search</option>
                          <option value="multi_query">Multi-Query Expansion</option>
                          <option value="contextual_compression">Contextual Compression</option>
                          <option value="auto_merging">Auto-Merging Retrieval</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Top K Chunks</label>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="1"
                            max="20"
                            step="1"
                            value={configData.retrieval?.top_k || 5}
                            onChange={(e) => handleUpdateConfigValue(["retrieval", "top_k"], parseInt(e.target.value))}
                          />
                          <span className="slider-val">{configData.retrieval?.top_k || 5}</span>
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Similarity Threshold</label>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.05"
                            value={configData.retrieval?.similarity_threshold || 0.7}
                            onChange={(e) => handleUpdateConfigValue(["retrieval", "similarity_threshold"], parseFloat(e.target.value))}
                          />
                          <span className="slider-val">{(configData.retrieval?.similarity_threshold || 0.7).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* LLM settings */}
                    <div>
                      <h4 className="section-title">LLM generation</h4>
                      
                      <div className="form-group">
                        <label>LLM Provider</label>
                        <select
                          className="form-control"
                          value={configData.llm?.provider || "openai"}
                          onChange={(e) => handleUpdateConfigValue(["llm", "provider"], e.target.value)}
                        >
                          <option value="openai">OpenAI GPT</option>
                          <option value="anthropic">Anthropic Claude</option>
                          <option value="cohere">Cohere Command</option>
                          <option value="local">Local Transformer</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Model Identifier</label>
                        <input
                          type="text"
                          className="form-control"
                          value={configData.llm?.config?.model || ""}
                          onChange={(e) => handleUpdateConfigValue(["llm", "config", "model"], e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>Temperature</label>
                        <div className="slider-container">
                          <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.05"
                            value={configData.llm?.config?.temperature ?? 0.1}
                            onChange={(e) => handleUpdateConfigValue(["llm", "config", "temperature"], parseFloat(e.target.value))}
                          />
                          <span className="slider-val">{(configData.llm?.config?.temperature ?? 0.1).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div style={{ textAlign: "center", color: "var(--color-muted)", padding: "2rem 0" }}>
                    Loading configuration data...
                  </div>
                )
              ) : (
                <div className="form-group" style={{ flex: 1, display: "flex", flexDirection: "column", margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>Raw config.yaml</span>
                    <button 
                      onClick={fetchConfig} 
                      style={{ fontSize: "0.75rem", background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Reset Changes
                    </button>
                  </div>
                  <textarea
                    className="form-control yaml-editor-textarea"
                    value={rawYaml}
                    onChange={(e) => setRawYaml(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
              )}

              <button onClick={handleSaveConfig} className="btn btn-primary" style={{ width: "100%", marginTop: "0.5rem" }}>
                Apply & Reload Pipeline
              </button>
            </div>
          )}

          {/* Status Module */}
          <div style={{ marginTop: "auto" }}>
            <h4 className="section-title">Pipeline Status</h4>
            <div className="status-panel">
              <div className="status-row">
                <span>RAG Pipeline</span>
                <span className={`status-badge ${status?.status || "failed"}`}>{status?.status || "inactive"}</span>
              </div>
              <div className="status-row">
                <span>Project Name</span>
                <span style={{ fontWeight: 500 }}>{status?.project_name || "N/A"}</span>
              </div>
              <div className="status-row">
                <span>Vector Count</span>
                <span style={{ fontWeight: 500 }}>{status?.chunk_count ?? 0} chunks</span>
              </div>
              <div className="status-row">
                <span>LLM Engine</span>
                <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>{status?.llm_provider || "N/A"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-container">
        {/* Chat Header */}
        <div className="chat-header">
          <div className="chat-header-title">
            <h3>Interactive Assistant</h3>
            <p>{status?.mock_mode ? "Demonstration Sandbox Mode" : `RAG Environment: ${status?.environment || "Development"}`}</p>
          </div>
          <div className="header-actions">
            {/* Dark Mode toggler */}
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle Theme">
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>

        {/* Message Thread */}
        <div className="messages-list">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message-wrapper ${msg.sender}`}>
              <div className="message-bubble">
                <div>
                  {msg.text}
                  {msg.status === "streaming" && <span className="streaming-pulse" />}
                  {msg.status === "loading" && (
                    <div style={{ display: "flex", gap: "4px", padding: "4px 0" }}>
                      <span className="streaming-pulse" style={{ margin: 0, animationDelay: "0s" }} />
                      <span className="streaming-pulse" style={{ margin: 0, animationDelay: "0.2s" }} />
                      <span className="streaming-pulse" style={{ margin: 0, animationDelay: "0.4s" }} />
                    </div>
                  )}
                </div>

                {/* Inblocking query evaluation / citations info panel */}
                {msg.sender === "assistant" && (msg.sources || msg.evaluation) && (
                  <MessageDetails sources={msg.sources} evaluation={msg.evaluation} latency={msg.latency} />
                )}
              </div>
              
              <div className="message-meta">
                <span>{msg.sender === "user" ? "You" : "Assistant"}</span>
                {msg.latency && (
                  <span style={{ fontFamily: 'JetBrains Mono', monospace }}>
                    {msg.latency.toFixed(0)}ms
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input Bar */}
        <div className="chat-input-bar">
          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <input
              type="text"
              placeholder="Ask a question about the database..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="chat-input-textarea"
              disabled={isGenerating}
            />
            
            {/* Toggle streaming vs detailed evaluations */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>Stream</span>
              <label className="switch" style={{ width: "36px", height: "20px" }}>
                <input
                  type="checkbox"
                  checked={streamResponse}
                  onChange={(e) => setStreamResponse(e.target.checked)}
                />
                <span className="slider" style={{ borderRadius: "20px" }}></span>
              </label>
              <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginRight: "0.5rem" }}>Evaluate</span>
            </div>

            <button
              type="submit"
              className="btn-send"
              disabled={!input.trim() || isGenerating}
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Sub-component for Citations and Evaluation Metrics Accordions
function MessageDetails({ sources, evaluation, latency }) {
  const [openSection, setOpenSection] = useState(null); // null | 'citations' | 'eval'

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section);
  };

  return (
    <div className="accordion-section">
      {/* Citations section */}
      {sources && sources.length > 0 && (
        <div>
          <div className="accordion-header" onClick={() => toggleSection("citations")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: openSection === "citations" ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            Sources Cited ({sources.length})
          </div>
          {openSection === "citations" && (
            <div className="accordion-content" style={{ marginTop: "0.4rem" }}>
              {sources.map((src, i) => (
                <div key={i} className="citation-card">
                  <div className="citation-card-header">
                    <span>Source {i + 1}: {src.metadata?.filename || src.metadata?.source || "Document"}</span>
                    <span className="citation-score">Sim: {(src.score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="citation-text">
                    {src.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Evaluations section */}
      {evaluation && (
        <div style={{ marginTop: "0.4rem" }}>
          <div className="accordion-header" onClick={() => toggleSection("eval")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: openSection === "eval" ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
            Automated Quality Metrics
          </div>
          {openSection === "eval" && (
            <div className="accordion-content" style={{ marginTop: "0.4rem" }}>
              {evaluation.error ? (
                <div style={{ fontSize: "0.75rem", color: "rgb(239, 68, 68)" }}>
                  Metrics evaluation failed: {evaluation.error}
                </div>
              ) : (
                <div className="eval-grid">
                  {Object.entries(evaluation.metrics || {}).map(([metric, score]) => (
                    <div key={metric} className="eval-metric-box">
                      <span className="eval-metric-name">{metric.replace("_", " ")}</span>
                      <span className="eval-metric-val" style={{ color: Number(score) >= 0.7 ? "rgb(16, 185, 129)" : "oklch(60% 0.2 30)" }}>
                        {Number(score).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {latency && (
                    <div className="eval-metric-box">
                      <span className="eval-metric-name">Inference Time</span>
                      <span className="eval-metric-val">{latency.toFixed(0)} ms</span>
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

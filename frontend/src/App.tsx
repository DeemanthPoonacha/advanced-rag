import React, { useState, useEffect, useRef } from "react";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { ChatPanel } from "./components/ChatPanel";
import { IngestPanel } from "./components/IngestPanel";
import { ConfigPanel } from "./components/ConfigPanel";
import { Toast } from "./components/ui/Toast";
import { Message, RAGStatus, PipelineConfig, ToastState, UploadLog, Conversation, Attachment } from "./types";

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
  
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem("rag_conversations");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse conversations", e);
      }
    }
    return [
      {
        id: "default",
        title: "Default Chat",
        messages: [
          {
            sender: "assistant",
            text: "Hello! Welcome to the AI assistant query center. Use the left menu to Ingest new documents into the database or configure LLM and vector settings. Once ready, ask me questions here and watch chunks retrieve live.",
            status: "done",
          },
        ],
        created_at: new Date().toISOString(),
      },
    ];
  });

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const savedId = localStorage.getItem("rag_active_conversation_id");
    return savedId || "default";
  });

  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<RAGStatus | null>(null);
  const [rawYaml, setRawYaml] = useState("");
  const [configData, setConfigData] = useState<PipelineConfig | null>(null);
  const [editMode, setEditMode] = useState<"visual" | "yaml">("visual");
  const [isUploading, setIsUploading] = useState(false);
  const [wizardActive, setWizardActive] = useState(false);
  const [wizardMinimized, setWizardMinimized] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [maxStepReached, setMaxStepReached] = useState<number>(1);
  const [realIngestStatus, setRealIngestStatus] = useState<Record<string, any>>({});
  const [uploadLogs, setUploadLogs] = useState<UploadLog[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [streamResponse, setStreamResponse] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state changes to localStorage
  useEffect(() => {
    localStorage.setItem("rag_conversations", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem("rag_active_conversation_id", activeConversationId);
  }, [activeConversationId]);

  const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0] || { messages: [] };
  const messages = activeConversation.messages;

  // Intercept setMessages to update active conversation messages
  const setMessages = (updateFn: Message[] | ((prev: Message[]) => Message[])) => {
    setConversations((prevConvs) => {
      return prevConvs.map((conv) => {
        if (conv.id === activeConversationId) {
          const nextMessages = typeof updateFn === "function" ? updateFn(conv.messages) : updateFn;
          
          // Auto-generate title if the conversation has default title and this is the first user message
          let newTitle = conv.title;
          if (conv.title === "Default Chat" || conv.title === "New Chat") {
            const firstUserMsg = nextMessages.find(m => m.sender === "user");
            if (firstUserMsg) {
              newTitle = firstUserMsg.text.slice(0, 24) + (firstUserMsg.text.length > 24 ? "..." : "");
            }
          }

          return {
            ...conv,
            title: newTitle,
            messages: nextMessages,
          };
        }
        return conv;
      });
    });
  };

  const checkRunningIngestion = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ingest/status`);
      if (res.ok) {
        const data = await res.json();
        setRealIngestStatus(data);
        const keys = Object.keys(data);
        if (keys.length > 0) {
          const isAnyRunning = keys.some(filename => {
            const info = data[filename];
            return info && info.status !== "completed" && info.status !== "failed";
          });
          if (isAnyRunning) {
            setIsUploading(true);
            setWizardActive(true);
            setWizardMinimized(true);
            
            // Determine active step
            let minStep = 3;
            keys.forEach((filename) => {
              const info = data[filename];
              if (info && typeof info.step === "number") {
                minStep = Math.min(minStep, info.step);
              } else if (info) {
                if (info.status === "uploading") {
                  minStep = Math.min(minStep, 1);
                } else if (info.status === "partitioning") {
                  minStep = Math.min(minStep, 2);
                } else if (info.status === "chunking" || info.status === "indexing") {
                  minStep = Math.min(minStep, 3);
                }
              }
            });
            setActiveStep(minStep);
            setMaxStepReached(minStep);
          }
        }
      }
    } catch (e) {
      console.error("Failed to check running ingestion status", e);
    }
  };

  // Initialize status & config
  useEffect(() => {
    fetchStatus();
    fetchConfig();
    fetchDocuments();
    checkRunningIngestion();
    document.documentElement.classList.add("dark");
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  // Poll ingestion status when isUploading is active
  useEffect(() => {
    let intervalId: any;
    if (isUploading) {
      const pollStatus = async () => {
        try {
          const res = await fetch(`${API_BASE}/api/ingest/status`);
          if (res.ok) {
            const data = await res.json();
            setRealIngestStatus(data);
            
            const keys = Object.keys(data);
            if (keys.length > 0) {
              const isAnyRunning = keys.some(filename => {
                const info = data[filename];
                return info && info.status !== "completed" && info.status !== "failed";
              });
              
              // Sync active step and max step reached based on api status
              let minStep = 3;
              keys.forEach((filename) => {
                const info = data[filename];
                if (info && typeof info.step === "number") {
                  minStep = Math.min(minStep, info.step);
                } else if (info) {
                  if (info.status === "uploading") {
                    minStep = Math.min(minStep, 1);
                  } else if (info.status === "partitioning") {
                    minStep = Math.min(minStep, 2);
                  } else if (info.status === "chunking" || info.status === "indexing") {
                    minStep = Math.min(minStep, 3);
                  }
                }
              });
              
              setActiveStep(prev => Math.max(prev, minStep));
              setMaxStepReached(prev => Math.max(prev, minStep));
              
              if (!isAnyRunning) {
                setIsUploading(false);
                showToast("Document ingestion completed!", "success");
                await fetchDocuments();
                fetchStatus();
              }
            }
          }
        } catch (e) {
          console.error("Failed to poll ingest status", e);
        }
      };
      
      pollStatus();
      intervalId = setInterval(pollStatus, 800);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isUploading]);

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

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/documents`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success" && data.documents) {
          const parsed: UploadLog[] = data.documents.map((d: any) => ({
            filename: d.name,
            chunks_count: d.chunksCount,
            date: d.uploadTime,
          }));
          setUploadLogs(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to fetch documents", e);
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

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      showToast("Ingestion cancelled.", "warning");
    }
    setIsUploading(false);
    setWizardActive(false);
    setWizardMinimized(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    setWizardActive(true);
    setWizardMinimized(false);
    setActiveStep(1);
    setMaxStepReached(1);
    showToast(`Uploading ${files.length} document(s)...`, "success");

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/api/ingest`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const data = await res.json();

      if (res.ok) {
        showToast(`Ingested successfully! Created ${data.total_chunks_ingested} chunks.`, "success");
        await fetchDocuments();
        fetchStatus();
      } else {
        showToast(data.detail || "Ingestion failed", "error");
        setWizardActive(false);
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        return;
      }
      showToast("Upload failed due to connection error", "error");
      setWizardActive(false);
    } finally {
      // Note: we don't set isUploading to false here because status polling handles it
      // when the background tasks in the API are fully completed!
      abortControllerRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteFile = async (filename: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `Deleted successfully!`, "success");
        await fetchDocuments();
        fetchStatus(); // Refresh vector count
      } else {
        showToast(data.detail || "Delete failed", "error");
      }
    } catch (e) {
      showToast("Delete failed due to connection error", "error");
    }
  };

  const handleAttachFiles = async (files: File[]) => {
    if (!files.length) return;

    const newAttachments = files.map(file => {
      const id = `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const isImage = file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif)$/i.test(file.name);
      
      const att: Attachment = {
        id,
        filename: file.name,
        file_type: file.type || (isImage ? "image/jpeg" : "application/octet-stream"),
        status: "processing"
      };

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const base64 = dataUrl.split(",")[1];
          setPendingAttachments(prev => prev.map(a => a.id === id ? {
            ...a,
            base64,
            status: "ready"
          } : a));
        };
        reader.onerror = () => {
          setPendingAttachments(prev => prev.map(a => a.id === id ? {
            ...a,
            status: "error",
            error: "Failed to read image locally."
          } : a));
        };
        reader.readAsDataURL(file);
      } else {
        const formData = new FormData();
        formData.append("file", file);

        fetch(`${API_BASE}/api/parse-attachment`, {
          method: "POST",
          body: formData
        })
        .then(res => {
          if (!res.ok) throw new Error("Failed to parse file.");
          return res.json();
        })
        .then(data => {
          setPendingAttachments(prev => prev.map(a => a.id === id ? {
            ...a,
            content: data.content,
            extracted_images: data.extracted_images,
            status: "ready"
          } : a));
        })
        .catch(err => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const text = e.target?.result as string;
            setPendingAttachments(prev => prev.map(a => a.id === id ? {
              ...a,
              content: text,
              status: "ready"
            } : a));
          };
          reader.onerror = () => {
            setPendingAttachments(prev => prev.map(a => a.id === id ? {
              ...a,
              status: "error",
              error: err.message || "Failed to parse file on server."
            } : a));
          };
          reader.readAsText(file);
        });
      }

      return att;
    });

    setPendingAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleRemovePendingAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleNewConversation = () => {
    const newId = `conv_${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: "New Chat",
      messages: [
        {
          sender: "assistant",
          text: "Hello! Welcome to a new chat session. Attach files/images or ask questions directly, and watch chunks retrieve live.",
          status: "done",
        },
      ],
      created_at: new Date().toISOString(),
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newId);
    setPendingAttachments([]);
    setInput("");
  };

  const handleDeleteConversation = (id: string) => {
    const nextConvs = conversations.filter(c => c.id !== id);
    setConversations(nextConvs);
    
    if (activeConversationId === id) {
      if (nextConvs.length > 0) {
        setActiveConversationId(nextConvs[0].id);
      } else {
        const defaultConv: Conversation = {
          id: "default",
          title: "Default Chat",
          messages: [
            {
              sender: "assistant",
              text: "Hello! Welcome to the AI assistant query center. Use the left menu to Ingest new documents into the database or configure LLM and vector settings. Once ready, ask me questions here and watch chunks retrieve live.",
              status: "done",
            },
          ],
          created_at: new Date().toISOString(),
        };
        setConversations([defaultConv]);
        setActiveConversationId("default");
      }
    }
  };

  const handleRenameConversation = (id: string, title: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    const hasAttachments = pendingAttachments.some(a => a.status === "ready");
    if ((!input.trim() && !hasAttachments) || isGenerating) return;

    if (pendingAttachments.some(a => a.status === "processing")) {
      showToast("Please wait for attachments to finish uploading.", "error");
      return;
    }

    const queryText = input.trim();
    setInput("");
    setIsGenerating(true);

    const attachmentsToSend = pendingAttachments.filter(a => a.status === "ready");
    setPendingAttachments([]);

    const userMsg: Message = { 
      sender: "user", 
      text: queryText || `Sent ${attachmentsToSend.length} attachment(s)`, 
      status: "done",
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : null
    };
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

    const backendAttachments = attachmentsToSend.map(att => ({
      filename: att.filename,
      file_type: att.file_type,
      content: att.content || "",
      base64: att.base64 || null,
      extracted_images: att.extracted_images || []
    }));

    if (streamResponse) {
      try {
        const response = await fetch(`${API_BASE}/api/query/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            query: queryText || `[Query with attachments]`,
            attachments: backendAttachments.length > 0 ? backendAttachments : undefined
          }),
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
          body: JSON.stringify({ 
            query: queryText || `[Query with attachments]`,
            attachments: backendAttachments.length > 0 ? backendAttachments : undefined
          }),
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
        conversations={conversations}
        activeConversationId={activeConversationId}
        setActiveConversationId={setActiveConversationId}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
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
              pendingAttachments={pendingAttachments}
              onAttachFiles={handleAttachFiles}
              onRemoveAttachment={handleRemovePendingAttachment}
            />
          )}

          {/* PAGE 2: DOCUMENT INGEST */}
          {activePage === "ingest" && (
            <IngestPanel
              status={status}
              isUploading={isUploading}
              uploadLogs={uploadLogs}
              handleFileUpload={handleFileUpload}
              handleCancelUpload={handleCancelUpload}
              fileInputRef={fileInputRef}
              handleDeleteFile={handleDeleteFile}
              wizardActive={wizardActive}
              setWizardActive={setWizardActive}
              wizardMinimized={wizardMinimized}
              setWizardMinimized={setWizardMinimized}
              activeStep={activeStep}
              setActiveStep={setActiveStep}
              maxStepReached={maxStepReached}
              setMaxStepReached={setMaxStepReached}
              realIngestStatus={realIngestStatus}
              setRealIngestStatus={setRealIngestStatus}
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

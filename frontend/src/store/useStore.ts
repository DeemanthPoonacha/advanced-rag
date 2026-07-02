import { create } from "zustand";
import { Message, ToastState, Conversation, Attachment } from "../types";

const API_BASE = "http://localhost:8000";

interface State {
  // Navigation & Theme
  activePage: "chat" | "ingest" | "config";
  isDarkMode: boolean;
  
  // UI Notifications
  toast: ToastState | null;

  // Ingestion Wizard UI State
  isUploading: boolean;
  wizardActive: boolean;
  wizardMinimized: boolean;
  activeStep: number;
  maxStepReached: number;
  realIngestStatus: Record<string, any>;

  // Chat/Conversations State
  conversations: Conversation[];
  activeConversationId: string;
  pendingAttachments: Attachment[];
  input: string;
  streamResponse: boolean;
  isGenerating: boolean;
  abortController: AbortController | null;
  previewImageUrl: string | null;
  selectedDocumentFilter: string | null;
  previewDocName: string | null;
}

interface Actions {
  // Navigation & Theme
  setActivePage: (page: "chat" | "ingest" | "config") => void;
  setIsDarkMode: (isDark: boolean) => void;
  toggleTheme: () => void;

  // UI Notifications
  setToast: (toast: ToastState | null) => void;
  showToast: (text: string, type?: "success" | "error") => void;

  // Ingestion Wizard UI State
  setIsUploading: (isUploading: boolean) => void;
  setWizardActive: (active: boolean) => void;
  setWizardMinimized: (minimized: boolean) => void;
  setActiveStep: (step: number | ((prev: number) => number)) => void;
  setMaxStepReached: (step: number | ((prev: number) => number)) => void;
  setRealIngestStatus: (status: Record<string, any>) => void;
  closeWizard: () => void;
  setAbortController: (controller: AbortController | null) => void;
  handleCancelUpload: () => void;

  // Chat/Conversations Actions
  setInput: (input: string) => void;
  setStreamResponse: (stream: boolean) => void;
  setIsGenerating: (generating: boolean) => void;
  setActiveConversationId: (id: string) => void;
  updateActiveMessages: (updateFn: Message[] | ((prev: Message[]) => Message[])) => void;
  handleNewConversation: () => void;
  handleDeleteConversation: (id: string) => void;
  handleRenameConversation: (id: string, title: string) => void;
  handleAttachFiles: (files: File[]) => Promise<void>;
  handleRemovePendingAttachment: (id: string) => void;
  handleSendMessage: (e?: React.FormEvent) => Promise<void>;
  setPreviewImageUrl: (url: string | null) => void;
  setSelectedDocumentFilter: (doc: string | null) => void;
  setPreviewDocName: (name: string | null) => void;
}

const getInitialConversations = (): Conversation[] => {
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
};

const getInitialActiveConversationId = (): string => {
  const savedId = localStorage.getItem("rag_active_conversation_id");
  return savedId || "default";
};

export const useStore = create<State & Actions>((set, get) => ({
  // Navigation & Theme
  activePage: "chat",
  isDarkMode: true,
  
  // UI Notifications
  toast: null,

  // Ingestion Wizard UI State
  isUploading: false,
  wizardActive: false,
  wizardMinimized: false,
  activeStep: 1,
  maxStepReached: 1,
  realIngestStatus: {},
  abortController: null,

  // Chat/Conversations State
  conversations: getInitialConversations(),
  activeConversationId: getInitialActiveConversationId(),
  pendingAttachments: [],
  input: "",
  streamResponse: true,
  isGenerating: false,
  previewImageUrl: null,
  selectedDocumentFilter: null,
  previewDocName: null,

  // Navigation & Theme Actions
  setActivePage: (activePage) => set({ activePage }),
  setIsDarkMode: (isDarkMode) => set({ isDarkMode }),
  toggleTheme: () => {
    const nextDark = !get().isDarkMode;
    set({ isDarkMode: nextDark });
    if (nextDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    document.documentElement.style.setProperty("color-scheme", nextDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", nextDark ? "dark" : "light");
  },

  // UI Notifications Actions
  setToast: (toast) => set({ toast }),
  showToast: (text, type = "success") => {
    set({ toast: { text, type } });
  },

  // Ingestion Wizard Actions
  setIsUploading: (isUploading) => set({ isUploading }),
  setWizardActive: (wizardActive) => set({ wizardActive }),
  setWizardMinimized: (wizardMinimized) => set({ wizardMinimized }),
  setActiveStep: (step) => {
    set((state) => {
      const nextStep = typeof step === "function" ? step(state.activeStep) : step;
      return { activeStep: nextStep };
    });
  },
  setMaxStepReached: (step) => {
    set((state) => {
      const nextStep = typeof step === "function" ? step(state.maxStepReached) : step;
      return { maxStepReached: nextStep };
    });
  },
  setRealIngestStatus: (realIngestStatus) => set({ realIngestStatus }),
  closeWizard: () => set({ wizardActive: false, wizardMinimized: false }),
  setAbortController: (abortController) => set({ abortController }),
  handleCancelUpload: () => {
    const controller = get().abortController;
    if (controller) {
      controller.abort();
      set({ abortController: null });
      get().showToast("Ingestion cancelled.", "error"); // matching toast style or 'warning' -> here mapped to error for UI look
    }
    set({ isUploading: false, wizardActive: false, wizardMinimized: false });
  },

  // Chat Actions
  setInput: (input) => set({ input }),
  setStreamResponse: (streamResponse) => set({ streamResponse }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setPreviewImageUrl: (previewImageUrl) => set({ previewImageUrl }),
  setSelectedDocumentFilter: (selectedDocumentFilter) => set({ selectedDocumentFilter }),
  setPreviewDocName: (previewDocName) => set({ previewDocName }),
  setActiveConversationId: (activeConversationId) => set({ activeConversationId, pendingAttachments: [], input: "" }),

  updateActiveMessages: (updateFn) => {
    set((state) => {
      const nextConversations = state.conversations.map((conv) => {
        if (conv.id === state.activeConversationId) {
          const nextMessages = typeof updateFn === "function" ? updateFn(conv.messages) : updateFn;
          
          let newTitle = conv.title;
          if (conv.title === "Default Chat" || conv.title === "New Chat") {
            const firstUserMsg = nextMessages.find((m) => m.sender === "user");
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
      return { conversations: nextConversations };
    });
  },

  handleNewConversation: () => {
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
    set((state) => ({
      conversations: [newConv, ...state.conversations],
      activeConversationId: newId,
      pendingAttachments: [],
      input: "",
    }));
  },

  handleDeleteConversation: (id) => {
    set((state) => {
      const nextConvs = state.conversations.filter((c) => c.id !== id);
      let nextActiveId = state.activeConversationId;

      if (state.activeConversationId === id) {
        if (nextConvs.length > 0) {
          nextActiveId = nextConvs[0].id;
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
          return {
            conversations: [defaultConv],
            activeConversationId: "default",
          };
        }
      }

      return {
        conversations: nextConvs,
        activeConversationId: nextActiveId,
      };
    });
  },

  handleRenameConversation: (id, title) => {
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
  },

  handleAttachFiles: async (files) => {
    if (!files.length) return;

    const newAttachments = files.map((file) => {
      const id = `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const isImage = file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif)$/i.test(file.name);

      const att: Attachment = {
        id,
        filename: file.name,
        file_type: file.type || (isImage ? "image/jpeg" : "application/octet-stream"),
        status: "processing",
      };

      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const base64 = dataUrl.split(",")[1];
          set((state) => ({
            pendingAttachments: state.pendingAttachments.map((a) =>
              a.id === id ? { ...a, base64, status: "ready" } : a
            ),
          }));
        };
        reader.onerror = () => {
          set((state) => ({
            pendingAttachments: state.pendingAttachments.map((a) =>
              a.id === id ? { ...a, status: "error", error: "Failed to read image locally." } : a
            ),
          }));
        };
        reader.readAsDataURL(file);
      } else {
        const formData = new FormData();
        formData.append("file", file);

        fetch(`${API_BASE}/api/parse-attachment`, {
          method: "POST",
          body: formData,
        })
          .then((res) => {
            if (!res.ok) throw new Error("Failed to parse file.");
            return res.json();
          })
          .then((data) => {
            set((state) => ({
              pendingAttachments: state.pendingAttachments.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      content: data.content,
                      extracted_images: data.extracted_images,
                      status: "ready",
                    }
                  : a
              ),
            }));
          })
          .catch((err) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const text = e.target?.result as string;
              set((state) => ({
                pendingAttachments: state.pendingAttachments.map((a) =>
                  a.id === id ? { ...a, content: text, status: "ready" } : a
                ),
              }));
            };
            reader.onerror = () => {
              set((state) => ({
                pendingAttachments: state.pendingAttachments.map((a) =>
                  a.id === id ? { ...a, status: "error", error: err.message || "Failed to parse file on server." } : a
                ),
              }));
            };
            reader.readAsText(file);
          });
      }

      return att;
    });

    set((state) => ({
      pendingAttachments: [...state.pendingAttachments, ...newAttachments],
    }));
  },

  handleRemovePendingAttachment: (id) => {
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((a) => a.id !== id),
    }));
  },

  handleSendMessage: async (e) => {
    if (e) e.preventDefault();
    const state = get();
    const hasAttachments = state.pendingAttachments.some((a) => a.status === "ready");
    if ((!state.input.trim() && !hasAttachments) || state.isGenerating) return;

    if (state.pendingAttachments.some((a) => a.status === "processing")) {
      state.showToast("Please wait for attachments to finish uploading.", "error");
      return;
    }

    const queryText = state.input.trim();
    set({ input: "", isGenerating: true });

    const activeConversation = state.conversations.find((c) => c.id === state.activeConversationId) || state.conversations[0];
    const chatHistory = activeConversation ? activeConversation.messages.map((m) => ({
      sender: m.sender,
      text: m.text,
    })) : [];

    const attachmentsToSend = state.pendingAttachments.filter((a) => a.status === "ready");
    set({ pendingAttachments: [] });

    const userMsg: Message = {
      sender: "user",
      text: queryText || `Sent ${attachmentsToSend.length} attachment(s)`,
      status: "done",
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : null,
    };
    state.updateActiveMessages((prev) => [...prev, userMsg]);

    state.updateActiveMessages((prev) => [
      ...prev,
      {
        sender: "assistant",
        text: "",
        status: "loading",
        sources: null,
        evaluation: null,
      },
    ]);

    const backendAttachments = attachmentsToSend.map((att) => ({
      filename: att.filename,
      file_type: att.file_type,
      content: att.content || "",
      base64: att.base64 || null,
      extracted_images: att.extracted_images || [],
    }));

    const bodyMetadata = state.selectedDocumentFilter
      ? { filters: { file_name: state.selectedDocumentFilter } }
      : undefined;

    if (state.streamResponse) {
      try {
        const response = await fetch(`${API_BASE}/api/query/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: queryText || `[Query with attachments]`,
            chat_history: chatHistory,
            attachments: backendAttachments.length > 0 ? backendAttachments : undefined,
            metadata: bodyMetadata,
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
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const textChunk = decoder.decode(value, { stream: true });
          buffer += textChunk;
          const lines = buffer.split("\n");
          // Save the last line (which may be incomplete) to process with the next chunk
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const token = line.slice(6).replace(/\r/g, "");
              collectedText += token;
              state.updateActiveMessages((prev) => {
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

        // Process any remaining text in the buffer after stream ends
        if (buffer && buffer.startsWith("data: ")) {
          const token = buffer.slice(6).replace(/\r/g, "");
          collectedText += token;
        }

        state.updateActiveMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            status: "done",
          };
          return next;
        });
      } catch (err: any) {
        state.updateActiveMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: `[Error: ${err.message || "Failed to generate stream response."}]`,
            status: "done",
          };
          return next;
        });
      } finally {
        set({ isGenerating: false });
      }
    } else {
      try {
        const response = await fetch(`${API_BASE}/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: queryText || `[Query with attachments]`,
            chat_history: chatHistory,
            attachments: backendAttachments.length > 0 ? backendAttachments : undefined,
            metadata: bodyMetadata,
          }),
        });
        const data = await response.json();

        if (response.ok) {
          state.updateActiveMessages((prev) => {
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
        state.updateActiveMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: `[Error: ${err.message || "Failed to retrieve response."}]`,
            status: "done",
          };
          return next;
        });
      } finally {
        set({ isGenerating: false });
      }
    }
  },
}));

// Sync store changes to localStorage automatically
useStore.subscribe((state) => {
  localStorage.setItem("rag_conversations", JSON.stringify(state.conversations));
  localStorage.setItem("rag_active_conversation_id", state.activeConversationId);
});

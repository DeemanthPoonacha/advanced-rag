import React, { useState, useRef, useEffect } from "react";
import { useStore } from "../store/useStore";
import {
  Send,
  ChevronRight,
  Paperclip,
  FileText,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Message, Source, Evaluation, Attachment } from "../types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageDetailsProps {
  sources?: Source[] | null;
  evaluation?: Evaluation | null;
  latency?: number;
}

function MessageDetails({ sources, evaluation, latency }: MessageDetailsProps) {
  const [openSection, setOpenSection] = useState<"citations" | "eval" | null>(
    null,
  );

  const toggleSection = (section: "citations" | "eval") => {
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
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                openSection === "citations" ? "rotate-90" : "rotate-0"
              }`}
            />
            Sources Cited ({sources.length})
          </div>
          {openSection === "citations" && (
            <div className="mt-2 space-y-2.5 animate-slide-down">
              {sources.map((src, i) => (
                <div
                  key={i}
                  className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/50 rounded-xl text-xs space-y-1"
                >
                  <div className="flex justify-between font-bold text-[10px] text-slate-400">
                    <span className="truncate max-w-[200px]">
                      Doc {i + 1}:{" "}
                      {src.metadata?.file_name || src.metadata?.source || "Doc"}
                    </span>
                    <span className="text-accent font-mono">
                      Similarity: {(src.score * 100).toFixed(0)}%
                    </span>
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
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                openSection === "eval" ? "rotate-90" : "rotate-0"
              }`}
            />
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
                  {Object.entries(evaluation.metrics || {}).map(
                    ([metric, score]) => (
                      <div
                        key={metric}
                        className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 flex flex-col gap-0.5"
                      >
                        <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider pr-1">
                          {metric.replace("_", " ")}
                        </span>
                        <span
                          className={`text-md font-bold font-display ${
                            Number(score) >= 0.7
                              ? "text-emerald-500"
                              : "text-amber-500"
                          }`}
                        >
                          {Number(score).toFixed(2)}
                        </span>
                      </div>
                    ),
                  )}
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

export function ChatPanel() {
  const conversations = useStore((s) => s.conversations);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0] || { messages: [] };
  const messages = activeConversation.messages;

  const isGenerating = useStore((s) => s.isGenerating);
  const streamResponse = useStore((s) => s.streamResponse);
  const setStreamResponse = useStore((s) => s.setStreamResponse);
  const handleSendMessage = useStore((s) => s.handleSendMessage);
  const input = useStore((s) => s.input);
  const setInput = useStore((s) => s.setInput);
  const pendingAttachments = useStore((s) => s.pendingAttachments);
  const onAttachFiles = useStore((s) => s.handleAttachFiles);
  const onRemoveAttachment = useStore((s) => s.handleRemovePendingAttachment);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onAttachFiles(files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const files = items
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (files.length > 0) {
      onAttachFiles(files);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onAttachFiles(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const isUploadDisabled = isGenerating;
  const isSendDisabled =
    isGenerating ||
    (input.trim() === "" &&
      !pendingAttachments.some((a) => a.status === "ready"));

  const cleanAiResponse = (text: string) => {
    return text
      .replace(/\s+\*\s+\*\*/g, "\n\n-  **")
      .replace(/ \* /g, "\n- ")
      .replace(/\s\*\*\s/g, "**")
      .trim();
  };

  return (
    <div
      className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-2xl flex flex-col items-center justify-center backdrop-blur-sm z-50 animate-fade-in pointer-events-none">
          <div className="bg-white dark:bg-slate-905 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
            <Paperclip className="w-10 h-10 text-primary animate-bounce" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Drop files to attach to this chat
            </p>
            <p className="text-xs text-slate-400">
              Images, PDFs, or Text files are supported
            </p>
          </div>
        </div>
      )}

      {/* Message scroll log */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-5 py-4 shadow-sm text-sm border leading-relaxed ${
                msg.sender === "user"
                  ? "bg-primary text-white border-primary/20 rounded-br-none"
                  : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800/80 rounded-bl-none"
              }`}
            >
              {/* Sent Attachments Previews inside message bubble */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {msg.attachments.map((att) => (
                    <div
                      key={att.id}
                      className={`flex items-center gap-2.5 p-1.5 rounded-lg border text-xs pr-3 select-none ${
                        msg.sender === "user"
                          ? "bg-white/10 border-white/20 text-white"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-850 dark:text-slate-200"
                      }`}
                    >
                      {att.base64 ? (
                        <img
                          src={`data:${att.file_type};base64,${att.base64}`}
                          alt={att.filename}
                          className="w-10 h-10 rounded object-cover shadow-sm"
                        />
                      ) : (
                        <div
                          className={`w-10 h-10 rounded flex items-center justify-center text-[10px] font-bold ${
                            msg.sender === "user"
                              ? "bg-white/20 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-primary"
                          }`}
                        >
                          <FileText size={18} />
                        </div>
                      )}
                      <div className="flex flex-col max-w-[160px]">
                        <span className="font-semibold truncate text-[11px] leading-tight">
                          {att.filename}
                        </span>
                        <span
                          className={`text-[8px] uppercase tracking-wider font-semibold leading-none mt-1 ${
                            msg.sender === "user"
                              ? "text-white/60"
                              : "text-slate-400"
                          }`}
                        >
                          {att.file_type.split("/")[1] || att.file_type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_a]:text-blue-500 hover:[&_a]:underline [&_pre]:bg-slate-100 dark:[&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:my-2 [&_pre]:overflow-x-auto [&_code]:font-mono [&_code]:text-xs [&_code]:bg-slate-100 dark:[&_code]:bg-slate-850 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_p]:my-1.5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {cleanAiResponse(msg.text)}
                </ReactMarkdown>
                {msg.status === "streaming" && (
                  <span className="streaming-caret" />
                )}
                {msg.status === "loading" && (
                  <div className="flex gap-1.5 py-1.5">
                    <span className="streaming-caret animate-pulse" />
                    <span className="streaming-caret animate-pulse delay-150" />
                    <span className="streaming-caret animate-pulse delay-300" />
                  </div>
                )}
              </div>

              {/* Detail Accordions */}
              {msg.sender === "assistant" &&
                (msg.sources || msg.evaluation) && (
                  <MessageDetails
                    sources={msg.sources}
                    evaluation={msg.evaluation}
                    latency={msg.latency}
                  />
                )}
            </div>
            <div className="mt-1.5 flex gap-2 text-[10px] font-semibold text-slate-400 px-1.5">
              <span>{msg.sender === "user" ? "You" : "RAG Assistant"}</span>
              {msg.latency && (
                <span className="font-mono">({msg.latency.toFixed(0)}ms)</span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input form */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 shrink-0">
        {/* Pending attachments preview list */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3 px-2">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className={`flex items-center gap-2 p-1.5 bg-white dark:bg-slate-950 border rounded-xl text-xs pr-2 select-none group relative shadow-sm transition-all duration-200 ${
                  att.status === "error"
                    ? "border-rose-500/50 bg-rose-50/10"
                    : "border-slate-200 dark:border-slate-850 hover:border-slate-350 dark:hover:border-slate-700"
                }`}
              >
                {att.base64 ? (
                  <img
                    src={`data:${att.file_type};base64,${att.base64}`}
                    alt={att.filename}
                    className="w-8 h-8 rounded object-cover shadow-sm"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-primary font-bold shadow-sm shrink-0">
                    <FileText size={16} />
                  </div>
                )}
                <div className="flex flex-col max-w-[120px]">
                  <span className="font-semibold truncate text-[11px] text-slate-800 dark:text-slate-200 leading-tight">
                    {att.filename}
                  </span>
                  <span className="text-[8px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5 leading-none">
                    {att.file_type.split("/")[1] || att.file_type}
                  </span>
                </div>

                {/* Loading / Error Indicators */}
                {att.status === "processing" && (
                  <div className="ml-1 shrink-0 text-primary">
                    <Loader2 size={12} className="animate-spin" />
                  </div>
                )}
                {att.status === "error" && (
                  <div
                    className="ml-1 shrink-0 text-rose-500"
                    title={att.error}
                  >
                    <AlertCircle size={12} />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="p-1 ml-1 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form className="flex items-center gap-3" onSubmit={handleSendMessage}>
          {/* File Input trigger */}
          <button
            type="button"
            onClick={triggerFileInput}
            className="p-2.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 transition-all cursor-pointer shrink-0 shadow-sm"
            disabled={isUploadDisabled}
            title="Attach files or images"
          >
            <Paperclip className="w-4.5 h-4.5" />
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            multiple
            accept="image/*,.pdf,.txt,.doc,.docx,.csv,.json,.py,.js,.html,.css,.md"
          />

          <input
            type="text"
            placeholder="Ask a question about the corpus or upload files to chat..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-full px-5 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder-slate-400 shadow-sm"
            disabled={isGenerating}
          />

          {/* Mode switcher (Stream vs Evaluate) */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-full shadow-sm text-xs font-medium shrink-0">
            <span
              onClick={() => setStreamResponse(false)}
              className={
                (!streamResponse ? "text-primary" : "text-slate-500") +
                " cursor-pointer"
              }
            >
              Evaluate
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={streamResponse}
                onChange={(e) => setStreamResponse(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
            </label>
            <span
              onClick={() => setStreamResponse(true)}
              className={
                (streamResponse ? "text-primary" : "text-slate-500") +
                " cursor-pointer"
              }
            >
              Stream
            </span>
          </div>

          <button
            type="submit"
            className="p-3 rounded-full bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/20 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:shadow-none transition-all duration-200 shrink-0 cursor-pointer"
            disabled={isSendDisabled}
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

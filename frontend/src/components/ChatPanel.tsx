import React, { useState } from "react";
import { Send, ChevronRight } from "lucide-react";
import { Message, Source, Evaluation } from "../types";

interface MessageDetailsProps {
  sources?: Source[] | null;
  evaluation?: Evaluation | null;
  latency?: number;
}

function MessageDetails({ sources, evaluation, latency }: MessageDetailsProps) {
  const [openSection, setOpenSection] = useState<"citations" | "eval" | null>(null);

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
                      Doc {i + 1}: {src.metadata?.filename || src.metadata?.source || "Doc"}
                    </span>
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
                  {Object.entries(evaluation.metrics || {}).map(([metric, score]) => (
                    <div
                      key={metric}
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 flex flex-col gap-0.5"
                    >
                      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider pr-1">
                        {metric.replace("_", " ")}
                      </span>
                      <span
                        className={`text-md font-bold font-display ${
                          Number(score) >= 0.7 ? "text-emerald-500" : "text-amber-500"
                        }`}
                      >
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

interface ChatPanelProps {
  messages: Message[];
  isGenerating: boolean;
  streamResponse: boolean;
  setStreamResponse: (checked: boolean) => void;
  handleSendMessage: (e: React.FormEvent) => void;
  input: string;
  setInput: (value: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatPanel({
  messages,
  isGenerating,
  streamResponse,
  setStreamResponse,
  handleSendMessage,
  input,
  setInput,
  messagesEndRef,
}: ChatPanelProps) {
  return (
    <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
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
            className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-full px-5 py-3 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder-slate-400"
            disabled={isGenerating}
          />

          {/* Mode switcher (Stream vs Evaluate) */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-full shadow-sm text-xs font-medium shrink-0">
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
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}

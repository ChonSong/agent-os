/**
 * Collapsible chat panel — slides up from the bottom-right corner.
 * Streams agent responses via SSE from /api/agent/chat.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  id: string;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Parse SSE chunks that look like: data: {"choices":[{"delta":{"content":"x"}}]}\n\n */
function parseSSEToken(data: string): string {
  const trimmed = data.trim();
  if (!trimmed.startsWith("data:")) return "";
  const json = trimmed.slice(5).trim();
  if (json === "[DONE]") return "";
  try {
    const parsed = JSON.parse(json);
    return parsed.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    setStreaming(true);

    const userMsg: Message = { role: "user", content: text, id: generateId() };
    const assistantMsgId = generateId();

    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "", id: assistantMsgId }]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, session_id: "dashboard", stream: true }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: `Error: ${res.status} ${res.statusText}` } : m,
          ),
        );
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const token = parseSSEToken(line);
          if (token) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: m.content + token } : m,
              ),
            );
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: m.content + "\n[stopped]" } : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: `Error: ${(err as Error).message}` } : m,
          ),
        );
      }
    } finally {
      setStreaming(false);
    }
  }, [input, streaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 z-50 flex flex-col rounded-tl-2xl overflow-hidden",
        "transition-all duration-300 ease-in-out shadow-2xl",
        "bg-[#111827] border border-[#1f2937] border-b-0",
        "w-[480px] max-w-[calc(100vw-68px)]",
        open ? "h-[420px]" : "h-[36px]",
        !open && "opacity-0 pointer-events-none",
      )}
    >
      {/* Header bar */}
      <div
        className="flex items-center h-[36px] px-3 gap-2 bg-[#1f2937] cursor-pointer shrink-0"
        onClick={() => setMinimized((v) => !v)}
      >
        <span className="text-xs font-semibold text-[#10b981]">Nanobot Agent</span>
        {streaming && (
          <span className="text-[10px] text-[#6b7280] animate-pulse">typing...</span>
        )}
        <span className="flex-1" />
        <button
          onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
          className="text-[#6b7280] hover:text-[#e8e6e3] transition-colors"
        >
          {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-[#6b7280] hover:text-red-400 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      {!minimized && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-[#4b5563] text-center mt-8">
              Ask me to manage your containers, install apps, explore files, and more.
            </p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "rounded-lg px-3 py-2 text-xs max-w-[85%] whitespace-pre-wrap",
                msg.role === "user"
                  ? "bg-[#10b981]/20 text-[#10b981] self-end ml-auto"
                  : "bg-[#1f2937] text-[#e8e6e3] self-start",
              )}
            >
              {msg.content}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      {!minimized && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#1f2937] shrink-0">
          {streaming ? (
            <button
              onClick={stopStreaming}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                "bg-[#ef4444] text-white hover:bg-[#dc2626]",
              )}
              title="Stop"
            >
              <X size={14} />
            </button>
          ) : (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the agent anything..."
              rows={1}
              className={cn(
                "flex-1 bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-2",
                "text-xs text-[#e8e6e3] placeholder-[#4b5563] resize-none",
                "focus:outline-none focus:border-[#10b981] transition-colors",
              )}
            />
          )}
          {!streaming && (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                "bg-[#10b981] text-[#0a0e14] hover:bg-[#0d9f6e]",
                "!bg-[#10b981] text-[#0a0e14]",
                !input.trim() && "opacity-30 cursor-not-allowed",
              )}
            >
              <Send size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}


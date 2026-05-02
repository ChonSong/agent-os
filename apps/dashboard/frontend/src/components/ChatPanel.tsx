/**
 * Collapsible chat panel — slides up from the bottom-right corner.
 * Uses the existing gateway WebSocket API from hermes-agent web.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  id: string;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

function buildWsUrl(token: string, channel: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/pty?${new URLSearchParams({ token, channel }).toString()}`;
}

function generateChannelId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chat-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const channelId = useRef(generateChannelId());

  // Connect WebSocket on mount
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    const ws = new WebSocket(buildWsUrl(token, channelId.current));

    ws.binaryType = "arraybuffer";

    ws.onmessage = (event) => {
      // Handle ArrayBuffer (terminal data) or text JSON messages
      if (event.data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(event.data);
        // VT100-escaped terminal output — just append raw
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: text, id: Math.random().toString(36).slice(2) },
        ]);
      } else {
        try {
          const parsed = JSON.parse(event.data as string);
          if (parsed.type === "output" || parsed.content) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: parsed.content ?? parsed.text ?? "", id: Math.random().toString(36).slice(2) },
            ]);
          }
        } catch {
          // Raw text terminal output
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: event.data as string, id: Math.random().toString(36).slice(2) },
          ]);
        }
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, id: Math.random().toString(36).slice(2) },
    ]);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", text }));
    }

    setSending(false);
  }, [input, sending]);

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
        !open && "opacity-0 pointer-events-none"
      )}
    >
      {/* Header bar — always visible */}
      <div
        className="flex items-center h-[36px] px-3 gap-2 bg-[#1f2937] cursor-pointer shrink-0"
        onClick={() => setMinimized((v) => !v)}
      >
        <span className="text-xs font-semibold text-[#10b981]">Nanobot Agent</span>
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
                  : "bg-[#1f2937] text-[#e8e6e3] self-start"
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
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the agent anything..."
            rows={1}
            className={cn(
              "flex-1 bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-2",
              "text-xs text-[#e8e6e3] placeholder-[#4b5563] resize-none",
              "focus:outline-none focus:border-[#10b981] transition-colors"
            )}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
              "bg-[#10b981] text-[#0a0e14] hover:bg-[#0d9f6e]",
              "disabled:opacity-30 disabled:cursor-not-allowed"
            )}
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

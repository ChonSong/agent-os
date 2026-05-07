/**
 * Collapsible chat panel with persistent session management.
 * Streams agent responses via SSE from /api/agent/chat.
 * Sessions are stored in PostgreSQL via the backend.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Send, ChevronDown, ChevronUp, Plus, Trash2,
  MessageSquare, Clock, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Message {
  id: string | number;
  role: "user" | "assistant" | "tool";
  content: string;
  created_at?: string;
  tokens_used?: number;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  input_tokens?: number;
  output_tokens?: number;
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
function parseSSEToken(data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed.startsWith("data:")) return null;
  const json = trimmed.slice(5).trim();
  if (json === "[DONE]") return null;
  // Handle session_id control messages
  if (json.startsWith("{")) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.session_id) return null; // control message, not content
      return parsed.choices?.[0]?.delta?.content ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionTokens, setSessionTokens] = useState<{ input: number; output: number }>({ input: 0, output: 0 });
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load sessions list
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/sessions?limit=50");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  // Load messages for a session
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        // Update session token counts if available
        if (data.input_tokens !== undefined || data.output_tokens !== undefined) {
          setSessionTokens({
            input: data.input_tokens ?? 0,
            output: data.output_tokens ?? 0,
          });
        }
      }
    } catch {
      setMessages([]);
    }
  }, []);

  // Initialize: load sessions + start new session
  useEffect(() => {
    if (open) {
      loadSessions();
      // Start a fresh session if none selected
      if (!currentSessionId) {
        setMessages([]);
      }
    }
  }, [open]);

  // Switch sessions
  const selectSession = useCallback(
    (session: Session) => {
      setCurrentSessionId(session.id);
      setSessionTokens({ input: 0, output: 0 });
      loadSessionMessages(session.id);
      setShowSidebar(false);
    },
    [loadSessionMessages],
  );

  // Start a brand-new session
  const startNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setMessages([]);
    setShowSidebar(false);
    setSessionTokens({ input: 0, output: 0 });
  }, []);

  // Delete a session
  const deleteSession = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          startNewSession();
        }
      } catch {
        // ignore
      }
    },
    [currentSessionId, startNewSession],
  );

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    setStreaming(true);

    const userMsgId = generateId();
    const assistantMsgId = generateId();

    // Optimistically add user message + empty assistant placeholder
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: text, created_at: new Date().toISOString() },
      { id: assistantMsgId, role: "assistant", content: "", created_at: new Date().toISOString() },
    ]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, session_id: currentSessionId ?? undefined, stream: true }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: `Error: ${res.status} ${body}` } : m,
          ),
        );
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let receivedSessionId: string | null = null;
      let gotFirstToken = false;
      let streamingInputTokens = 0;
      let streamingOutputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          // Parse potential control message (session_id) before token content
          if (!receivedSessionId) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:{")) {
              try {
                const parsed = JSON.parse(trimmed.slice(5).trim());
                if (parsed.session_id) {
                  receivedSessionId = parsed.session_id;
                  // If this is a brand-new session, update the current session ID
                  if (!currentSessionId) {
                    setCurrentSessionId(receivedSessionId);
                    // Reload sessions list so the new session appears
                    loadSessions();
                  }
                  continue; // not a content token
                }
                // Parse token usage from SSE chunk (nanobot API format)
                if (parsed.usage || parsed.tokens) {
                  const usage = parsed.usage ?? parsed.tokens;
                  if (usage) {
                    streamingInputTokens += usage.prompt_tokens ?? usage.input_tokens ?? 0;
                    streamingOutputTokens += usage.completion_tokens ?? usage.output_tokens ?? 0;
                  }
                }
              } catch {
                // not JSON, fall through to token parsing
              }
            }
          }

          const token = parseSSEToken(line);
          if (token) {
            gotFirstToken = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: m.content + token } : m,
              ),
            );
          }
        }
      }

      // After stream completes, update session tokens and assistant message
      if (streamingInputTokens > 0 || streamingOutputTokens > 0) {
        setSessionTokens((prev) => ({
          input: prev.input + streamingInputTokens,
          output: prev.output + streamingOutputTokens,
        }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, tokens_used: (streamingInputTokens + streamingOutputTokens) || undefined }
              : m,
          ),
        );
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
  }, [input, streaming, currentSessionId, loadSessions]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const currentTitle =
    sessions.find((s) => s.id === currentSessionId)?.title ??
    (currentSessionId ? "Conversation" : "New conversation");

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 z-50 flex flex-col overflow-hidden rounded-tl-2xl",
        "transition-all duration-300 ease-in-out shadow-2xl",
        "bg-[#111827] border border-[#1f2937] border-b-0",
        "w-[520px] max-w-[calc(100vw-68px)]",
        open ? "h-[480px]" : "h-[36px]",
        !open && "opacity-0 pointer-events-none",
      )}
    >
      {/* ── Header bar ── */}
      <div
        className="flex items-center h-[36px] px-3 gap-2 bg-[#1f2937] cursor-pointer shrink-0 select-none"
        onClick={() => setMinimized((v) => !v)}
      >
        <MessageSquare size={12} className="text-[#10b981]" />
        <span className="text-xs font-semibold text-[#10b981] truncate flex-1">
          {currentTitle}
        </span>
        {streaming && (
          <span className="text-[10px] text-[#6b7280] animate-pulse shrink-0">thinking…</span>
        )}
        {sessionTokens.input > 0 || sessionTokens.output > 0 ? (
          <span className="text-[10px] text-[#8a8f98] shrink-0">
            {sessionTokens.input + sessionTokens.output > 0
              ? `${sessionTokens.input + sessionTokens.output} tokens`
              : null}
          </span>
        ) : null}
        <button
          onClick={(e) => { e.stopPropagation(); setShowSidebar((v) => !v); }}
          className="text-[#6b7280] hover:text-[#e8e6e3] transition-colors shrink-0"
          title="Sessions"
        >
          <MessageSquare size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
          className="text-[#6b7280] hover:text-[#e8e6e3] transition-colors shrink-0"
        >
          {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-[#6b7280] hover:text-red-400 transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Session sidebar (left panel) ── */}
      {!minimized && showSidebar && (
        <div className="flex border-t border-[#1f2937] h-full">
          {/* Session list */}
          <div className="w-[180px] shrink-0 bg-[#0d1117] border-r border-[#1f2937] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f2937]">
              <span className="text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider">
                Sessions
              </span>
              <button
                onClick={startNewSession}
                className="text-[#10b981] hover:text-[#0d9f6e] transition-colors"
                title="New conversation"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingSessions ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={16} className="text-[#4b5563] animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-[10px] text-[#4b5563] text-center py-4 px-2">
                  No sessions yet. Start a new conversation!
                </p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => selectSession(s)}
                    className={cn(
                      "group flex items-start gap-2 px-3 py-2 cursor-pointer border-b border-[#1f2937]/50",
                      "hover:bg-[#1f2937]/60 transition-colors",
                      s.id === currentSessionId && "bg-[#1f2937]",
                    )}
                  >
                    <Clock size={10} className="text-[#4b5563] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-[11px] truncate",
                          s.id === currentSessionId ? "text-[#10b981]" : "text-[#9ca3af]",
                        )}
                      >
                        {s.title || "New conversation"}
                      </p>
                      <p className="text-[9px] text-[#4b5563]">{formatRelativeTime(s.updated_at)}</p>
                    </div>
                    <button
                      onClick={(e) => deleteSession(s.id, e)}
                      className="text-[#4b5563] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                      title="Delete session"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Chat messages */}
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
                    "rounded-lg px-3 py-2 text-xs max-w-[85%] whitespace-pre-wrap break-words",
                    msg.role === "user"
                      ? "bg-[#10b981]/20 text-[#10b981] self-end ml-auto"
                      : msg.role === "tool"
                      ? "bg-[#f59e0b]/20 text-[#f59e0b] self-start text-[10px]"
                      : "bg-[#1f2937] text-[#e8e6e3] self-start",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="flex-1">{msg.content}</span>
                    {msg.tokens_used && (
                      <span className="text-[10px] text-[#8a8f98] ml-2 shrink-0">
                        {msg.tokens_used} tokens
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input row */}
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
                  placeholder="Ask the agent anything…"
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
                    "flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0",
                    "bg-[#10b981] text-[#0a0e14] hover:bg-[#0d9f6e]",
                    !input.trim() && "opacity-30 cursor-not-allowed",
                  )}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Chat only (no sidebar) ── */}
      {!minimized && !showSidebar && (
        <>
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
                  "rounded-lg px-3 py-2 text-xs max-w-[85%] whitespace-pre-wrap break-words",
                  msg.role === "user"
                    ? "bg-[#10b981]/20 text-[#10b981] self-end ml-auto"
                    : msg.role === "tool"
                    ? "bg-[#f59e0b]/20 text-[#f59e0b] self-start text-[10px]"
                    : "bg-[#1f2937] text-[#e8e6e3] self-start",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="flex-1">{msg.content}</span>
                  {msg.tokens_used && (
                    <span className="text-[10px] text-[#8a8f98] ml-2 shrink-0">
                      {msg.tokens_used} tokens
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

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
                placeholder="Ask the agent anything…"
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
                  "flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0",
                  "bg-[#10b981] text-[#0a0e14] hover:bg-[#0d9f6e]",
                  !input.trim() && "opacity-30 cursor-not-allowed",
                )}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * ChatPage — Full-page SSE-based chat.
 * Streams agent responses via /api/agent/chat, same endpoint as ChatPanel.
 * Sessions are persisted in PostgreSQL through the backend.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Loader2, Plus, Trash2, MessageSquare, Clock,
  PanelLeftClose, PanelLeftOpen, Square, Sparkles,
} from "lucide-react";
import { cn, isoTimeAgo } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { Toast } from "@/components/Toast";
import { useToast } from "@/hooks/useToast";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Message {
  id: string;
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
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Parse an SSE line and return token content if present.
 * Handles OpenAI-compatible chunks and control messages.
 */
function parseSSEToken(data: string): string | null {
  const trimmed = data.trim();
  if (!trimmed.startsWith("data:")) return null;
  const json = trimmed.slice(5).trim();
  if (json === "[DONE]") return null;
  if (json.startsWith("{")) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.session_id) return null;          // control message
      if (parsed.usage || parsed.tokens) return null; // usage message
      return parsed.choices?.[0]?.delta?.content ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionTokens, setSessionTokens] = useState<{ input: number; output: number }>({
    input: 0,
    output: 0,
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast, showToast } = useToast();

  /* ---- session list ---- */
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/sessions?limit=50");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  /* ---- load messages for a session ---- */
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
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

  /* ---- init ---- */
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  /* ---- select session ---- */
  const selectSession = useCallback(
    (session: Session) => {
      setCurrentSessionId(session.id);
      setSessionTokens({ input: 0, output: 0 });
      loadSessionMessages(session.id);
    },
    [loadSessionMessages],
  );

  /* ---- new session ---- */
  const startNewSession = useCallback(() => {
    setCurrentSessionId(null);
    setMessages([]);
    setSessionTokens({ input: 0, output: 0 });
  }, []);

  /* ---- delete session ---- */
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          startNewSession();
        }
      } catch {
        showToast("Failed to delete session");
      }
    },
    [currentSessionId, startNewSession, showToast],
  );

  /* ---- auto-scroll ---- */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- send message (SSE streaming) ---- */
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
        body: JSON.stringify({
          text,
          session_id: currentSessionId ?? undefined,
          stream: true,
        }),
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
      let streamingInputTokens = 0;
      let streamingOutputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete last line in buffer

        for (const line of lines) {
          // Check for control messages (session_id, usage) before token parsing
          const trimmed = line.trim();
          if (trimmed.startsWith("data:{") || trimmed.startsWith("data: {")) {
            try {
              const jsonStr = trimmed.slice(trimmed.indexOf("{"));
              const parsed = JSON.parse(jsonStr);

              if (parsed.session_id && !receivedSessionId) {
                receivedSessionId = parsed.session_id;
                if (!currentSessionId) {
                  setCurrentSessionId(receivedSessionId);
                  loadSessions();
                }
                continue;
              }

              // Parse token usage
              if (parsed.usage || parsed.tokens) {
                const usage = parsed.usage ?? parsed.tokens;
                if (usage) {
                  streamingInputTokens += usage.prompt_tokens ?? usage.input_tokens ?? 0;
                  streamingOutputTokens += usage.completion_tokens ?? usage.output_tokens ?? 0;
                }
              }
            } catch {
              /* not JSON, fall through to token parsing */
            }
          }

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

      // Update token counts after stream completes
      if (streamingInputTokens > 0 || streamingOutputTokens > 0) {
        setSessionTokens((prev) => ({
          input: prev.input + streamingInputTokens,
          output: prev.output + streamingOutputTokens,
        }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, tokens_used: streamingInputTokens + streamingOutputTokens || undefined }
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

  /* ---- stop streaming ---- */
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /* ---- keyboard handler ---- */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /* ---- derived state ---- */
  const currentTitle =
    sessions.find((s) => s.id === currentSessionId)?.title ??
    (currentSessionId ? "Conversation" : "New conversation");

  const totalTokens = sessionTokens.input + sessionTokens.output;

  /* ---- render ---- */
  return (
    <div className="flex h-full overflow-hidden">
      <Toast toast={toast} />

      {/* ── Sidebar: session list ── */}
      {sidebarOpen && (
        <div className="w-64 shrink-0 flex flex-col border-r border-[#F0E6D8] bg-[#FFFBF5]">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0E6D8] shrink-0">
            <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
              Sessions
            </span>
            <button
              onClick={startNewSession}
              className="p-1.5 rounded-lg hover:bg-[#FAD4C0]/60 text-[#16A34A] hover:text-[#0d9f6e] transition-colors"
              title="New conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto">
            {loadingSessions ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-[#6B7280]" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-[#6B7280] text-center py-8 px-4">
                No sessions yet.
                <br />
                Send a message to start!
              </p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => selectSession(s)}
                  className={cn(
                    "group flex items-start gap-2 px-4 py-2.5 cursor-pointer border-b border-[#F0E6D8]/50",
                    "hover:bg-[#FFF5E6]/60 transition-colors",
                    s.id === currentSessionId && "bg-[#FFF5E6]",
                  )}
                >
                  <Clock className="w-3 h-3 text-[#6B7280] mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-xs truncate",
                        s.id === currentSessionId ? "text-[#16A34A] font-medium" : "text-[#9CA3AF]",
                      )}
                    >
                      {s.title || "New conversation"}
                    </p>
                    <p className="text-[10px] text-[#6B7280]">
                      {isoTimeAgo(s.updated_at || s.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    className="text-[#6B7280] hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                    title="Delete session"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#FFFBF5]">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#F0E6D8] bg-[#FFFBF5] shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-[#FAD4C0]/40 text-[#6B7280] hover:text-[#111827] transition-colors"
              title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#16A34A]" />
              <span className="text-sm font-semibold text-[#111827]">{currentTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {totalTokens > 0 && (
              <span className="text-[10px] text-[#8a8f98]">{totalTokens} tokens</span>
            )}
            {streaming && (
              <span className="text-[10px] text-[#6B7280] animate-pulse flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                thinking…
              </span>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF5E6] flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-[#16A34A]" />
                </div>
                <p className="text-sm font-medium text-[#111827] mb-1">Start a conversation</p>
                <p className="text-xs text-[#6B7280] max-w-sm">
                  Ask the agent to manage containers, explore files, run commands, install apps,
                  and more.
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "rounded-xl max-w-[85%] overflow-hidden",
                    msg.role === "user"
                      ? "bg-[#16A34A]/15 text-[#16A34A] px-4 py-3"
                      : msg.role === "tool"
                      ? "bg-[#D97706]/10 text-[#D97706] text-xs px-4 py-3 max-w-none w-full"
                      : "bg-white border border-[#F0E6D8] px-5 py-4",
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="relative">
                      <Markdown
                        content={msg.content}
                        streaming={streaming && msg.content !== "" && msg.id === messages[messages.length - 1]?.id}
                      />
                      {msg.tokens_used && (
                        <div className="text-[10px] text-[#8a8f98] mt-2">
                          {msg.tokens_used} tokens
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap break-words text-sm">
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="shrink-0 border-t border-[#F0E6D8] bg-[#FFFBF5] px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            {streaming ? (
              <button
                onClick={stopStreaming}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-lg transition-colors shrink-0",
                  "bg-[#DC2626]/10 text-[#DC2626] hover:bg-[#DC2626]/20",
                )}
                title="Stop generating"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : null}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the agent anything…"
              rows={1}
              disabled={streaming}
              className={cn(
                "flex-1 bg-white border border-[#F0E6D8] rounded-lg px-4 py-2.5",
                "text-sm text-[#111827] placeholder-[#4b5563] resize-none",
                "focus:outline-none focus:border-[#FAD4C0] focus:ring-2 focus:ring-[#FAD4C0]/30 transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
            {!streaming && (
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-lg transition-colors shrink-0",
                  "bg-[#16A34A] text-white hover:bg-[#15803D]",
                  !input.trim() && "opacity-30 cursor-not-allowed",
                )}
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="max-w-3xl mx-auto mt-1.5 text-center">
            <p className="text-[10px] text-[#6B7280]">
              Press <kbd className="px-1 py-0.5 rounded bg-[#F0E6D8] text-[#6B7280] font-mono text-[9px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-[#F0E6D8] text-[#6B7280] font-mono text-[9px]">Shift+Enter</kbd> for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

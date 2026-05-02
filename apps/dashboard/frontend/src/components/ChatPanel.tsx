/**
 * Collapsible chat panel — slides up from the bottom-right corner.
 * Connects to the agent-os backend via:
 *   POST /api/chat  — sends a message, initiates SSE stream
 *   GET  /api/chat/stream?session=<id> — SSE stream of agent tokens
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  id: string;
}

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Stable session for the lifetime of the panel
  const sessionIdRef = useRef<string>(generateSessionId());

  // ---------------------------------------------------------------------------
  // Parse OpenAI-compatible SSE chunks from /api/chat/stream
  // ---------------------------------------------------------------------------
  const parseSSE = useCallback((data: string): string | null => {
    // Format: data: {"id":"...","object":"chat.completion.chunk","choices":[...]}
    if (!data.trim() || data.trim() === '[DONE]') return null;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed?.choices?.[0]?.delta?.content;
      return typeof delta === 'string' ? delta : null;
    } catch {
      return null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Connect EventSource to the current session's SSE stream
  // ---------------------------------------------------------------------------
  const connectStream = useCallback((sessionId: string) => {
    // Close any existing connection
    eventSourceRef.current?.close();

    const es = new EventSource(`/api/chat/stream?session=${encodeURIComponent(sessionId)}`);
    eventSourceRef.current = es;
    let assistantContent = '';
    let assistantId = `asst-${Math.random().toString(36).slice(2)}`;

    es.onmessage = (event) => {
      const text = parseSSE(event.data);
      if (text === null) {
        // [DONE] or empty — stream finished
        es.close();
        eventSourceRef.current = null;
        if (assistantContent) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: assistantContent, id: assistantId },
          ]);
        }
        setSending(false);
        setStreamError(null);
        return;
      }
      // Accumulate token into current assistant message
      assistantContent += text;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.id === assistantId) {
          return [...prev.slice(0, -1), { ...last, content: assistantContent }];
        }
        return [...prev, { role: 'assistant', content: assistantContent, id: assistantId }];
      });
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      if (sending) {
        setStreamError('Stream disconnected. Check nanobot status.');
        setSending(false);
      }
    };
  }, [parseSSE, sending]);

  // ---------------------------------------------------------------------------
  // Send a message: POST /api/chat then open EventSource
  // ---------------------------------------------------------------------------
  const sendMessage = useCallback(async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    setStreamError(null);

    const userId = `user-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, id: userId },
    ]);

    const sessionId = sessionIdRef.current;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // POST succeeded — nanobot is now streaming. Open SSE stream.
      connectStream(sessionId);
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : String(e));
      setSending(false);
    }
  }, [input, sending, connectStream]);

  // ---------------------------------------------------------------------------
  // Auto-scroll to bottom
  // ---------------------------------------------------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      className={cn(
        'fixed bottom-0 right-0 z-50 flex flex-col rounded-tl-2xl overflow-hidden',
        'transition-all duration-300 ease-in-out shadow-2xl',
        'bg-[#111827] border border-[#1f2937] border-b-0',
        'w-[480px] max-w-[calc(100vw-68px)]',
        open ? 'h-[420px]' : 'h-[36px]',
        !open && 'opacity-0 pointer-events-none'
      )}
    >
      {/* Header bar */}
      <div
        className='flex items-center h-[36px] px-3 gap-2 bg-[#1f2937] cursor-pointer shrink-0'
        onClick={() => setMinimized((v) => !v)}
      >
        <span className='text-xs font-semibold text-[#10b981]'>Nanobot Agent</span>
        <span className='flex-1' />
        {sending && (
          <span className='text-[10px] text-[#6b7280] animate-pulse'>streaming…</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
          className='text-[#6b7280] hover:text-[#e8e6e3] transition-colors'
        >
          {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className='text-[#6b7280] hover:text-red-400 transition-colors'
        >
          <X size={14} />
        </button>
      </div>

      {/* Error banner */}
      {!minimized && streamError && (
        <div className='flex items-center px-3 py-1.5 bg-red-900/40 border-b border-red-800/50 shrink-0'>
          <span className='text-[10px] text-red-400'>{streamError}</span>
        </div>
      )}

      {/* Messages */}
      {!minimized && (
        <div className='flex-1 overflow-y-auto p-3 space-y-2'>
          {messages.length === 0 && (
            <p className='text-xs text-[#4b5563] text-center mt-8'>
              Ask me to manage your containers, install apps, explore files, and more.
            </p>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'rounded-lg px-3 py-2 text-xs max-w-[85%] whitespace-pre-wrap',
                msg.role === 'user'
                  ? 'bg-[#10b981]/20 text-[#10b981] self-end ml-auto'
                  : 'bg-[#1f2937] text-[#e8e6e3] self-start'
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
        <div className='flex items-center gap-2 px-3 py-2 border-t border-[#1f2937] shrink-0'>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Ask the agent anything…'
            rows={1}
            className={cn(
              'flex-1 bg-[#0d1117] border border-[#1f2937] rounded-lg px-3 py-2',
              'text-xs text-[#e8e6e3] placeholder-[#4b5563] resize-none',
              'focus:outline-none focus:border-[#10b981] transition-colors'
            )}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
              'bg-[#10b981] text-[#0a0e14] hover:bg-[#0d9f6e]',
              'disabled:opacity-30 disabled:cursor-not-allowed'
            )}
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

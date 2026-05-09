/**
 * ChatPage — Full-page SSE-based chat (replaces broken xterm/PTY version).
 * Uses the same /api/agent/chat endpoint as the ChatPanel.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Plus, Trash2, MessageSquare } from 'lucide-react';
import { H2 } from '@/components/NouiTypography';
import { ToolCallRenderer } from '@/components/ToolCallRenderer';
import { useToast } from '@/hooks/useToast';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tokens_used?: number;
}

interface Session {
  id: string;
  title: string;
  created_at: string;
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/sessions?page=1&limit=50');
      const data = await res.json();
      setSessions((data.sessions || []).slice(0, 50));
    } catch { /* ignore */ }
    setLoadingSessions(false);
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      const data = await res.json();
      const msgs: Message[] = (data.messages || []).map((m: any) => ({
        id: String(m.id),
        role: m.role || 'assistant',
        content: m.content || '',
        tokens_used: m.tokens_used,
      }));
      setMessages(msgs);
    } catch { /* ignore */ }
  }, []);

  const createSession = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions', { method: 'POST' });
      const data = await res.json();
      const session = data.session || data;
      setCurrentSessionId(session.id);
      setMessages([]);
      loadSessions();
    } catch (err) {
      showToast(String(err), 'error');
    }
  }, [showToast, loadSessions]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
      loadSessions();
    } catch (err) {
      showToast(String(err), 'error');
    }
  }, [currentSessionId, showToast, loadSessions]);

  const selectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    loadMessages(sessionId);
  }, [loadMessages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const res = await fetch('/api/sessions', { method: 'POST' });
        const data = await res.json();
        sessionId = data.session?.id || data.id;
        setCurrentSessionId(sessionId);
        loadSessions();
      } catch {
        setStreaming(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userMsg.content,
          session_id: sessionId,
          stream: true,
        }),
      });

      if (!res.body) {
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.session_id) continue;
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'assistant') {
                    return [...prev.slice(0, -1), { ...last, content: assistantContent }];
                  }
                  return [...prev, { id: `msg-${Date.now()}`, role: 'assistant' as const, content: assistantContent }];
                });
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, currentSessionId, showToast, loadSessions]);

  const stopStreaming = useCallback(() => {
    setStreaming(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-[#FFF5E6]">
      {/* Session sidebar */}
      {sidebarOpen && (
        <div className="w-64 border-r bg-[#FFFBF5] flex flex-col shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <H2 variant="sm">Sessions</H2>
            <button onClick={createSession} className="p-1.5 rounded-lg hover:bg-[#FAD4C0] transition-colors" title="New session">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              sessions.map(s => (
                <div key={s.id} className="flex items-center group px-3 py-2 hover:bg-[#FAD4C0]/20 transition-colors">
                  <button onClick={() => selectSession(s.id)} className="flex-1 text-left min-w-0">
                    <p className="text-xs font-medium truncate">{s.title || 'New Chat'}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                  </button>
                  <button onClick={() => deleteSession(s.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 transition-all">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b bg-[#FFFBF5] shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <MessageSquare className="w-4 h-4" />
            </button>
            <H2 variant="sm">Chat</H2>
            {currentSessionId && (
              <span className="text-xs text-muted-foreground font-mono">{currentSessionId.slice(0, 12)}...</span>
            )}
          </div>
          {streaming && (
            <button onClick={stopStreaming} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
              Stop
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-lg px-4 py-3 max-w-[80%] ${
                msg.role === 'user'
                  ? 'bg-[#16A34A]/15 text-[#16A34A]'
                  : msg.role === 'tool'
                  ? 'bg-[#D97706]/10 text-[#D97706] text-xs w-full max-w-none'
                  : 'bg-[#FFFBF5] border border-[#F0E6D8]'
              }`}>
                <ToolCallRenderer content={msg.content} />
                {msg.tokens_used && (
                  <div className="text-[10px] text-muted-foreground mt-1">{msg.tokens_used} tokens</div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t bg-[#FFFBF5] shrink-0">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the agent anything..."
            rows={1}
            disabled={streaming}
            className="flex-1 bg-[#FFF5E6] border border-[#F0E6D8] rounded-lg px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

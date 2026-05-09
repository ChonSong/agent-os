/**
 * TerminalPage — Full PTY terminal via xterm.js + Socket.IO.
 * Connects to the backend's Docker exec-based terminal session.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { io, type Socket } from 'socket.io-client';
import { Terminal as TerminalIcon, Play, AlertCircle, Loader2 } from 'lucide-react';
import { H2 } from '@/components/NouiTypography';
import { useToast } from '@/hooks/useToast';

export default function TerminalPage() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const connect = useCallback(() => {
    if (connecting || connected) return;
    setConnecting(true);
    setError(null);

    // Initialize xterm if not done yet
    if (!xtermRef.current) {
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace',
        theme: {
          background: '#0d1117',
          foreground: '#c9d1d9',
          cursor: '#c9d1d9',
          cursorAccent: '#0d1117',
          selectionBackground: '#264f78',
          black: '#0d1117',
          red: '#ff7b72',
          green: '#7ee787',
          yellow: '#ffa657',
          blue: '#79c0ff',
          magenta: '#d2a8ff',
          cyan: '#79c0ff',
          white: '#c9d1d9',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#aff5b4',
          brightYellow: '#ffd479',
          brightBlue: '#a5d6ff',
          brightMagenta: '#e8abff',
          brightCyan: '#a5d6ff',
          brightWhite: '#ffffff',
        },
        allowProposedApi: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.loadAddon(new Unicode11Addon());
      term.unicode.activeVersion = '11';

      xtermRef.current = term;
      fitRef.current = fitAddon;
    }

    // Open terminal in DOM
    if (terminalRef.current && !xtermRef.current.element) {
      xtermRef.current.open(terminalRef.current);
    }

    // Connect to Socket.IO
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = io(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    // Set up terminal input
    xtermRef.current.onData((data) => {
      if (sessionIdRef.current && socket.connected) {
        socket.emit('terminal:stdin', { sessionId: sessionIdRef.current, data });
      }
    });

    // Handle connection
    socket.on('connect', () => {
      socket.emit('terminal:create', {
        container: 'agent-os-backend',
        cols: xtermRef.current?.cols || 80,
        rows: xtermRef.current?.rows || 24,
      });
    });

    socket.on('terminal:created', ({ sessionId }: { sessionId: string }) => {
      sessionIdRef.current = sessionId;
      setConnected(true);
      setConnecting(false);
      xtermRef.current?.focus();
    });

    socket.on('terminal:data', ({ data }: { data: string }) => {
      xtermRef.current?.write(data);
    });

    socket.on('terminal:exit', () => {
      setConnected(false);
      sessionIdRef.current = null;
      xtermRef.current?.writeln('\r\n\x1b[33m[Process exited]\x1b[0m');
    });

    socket.on('terminal:error', ({ error: msg }: { error: string }) => {
      setError(msg);
      setConnecting(false);
      setConnected(false);
      showToast(msg, 'error');
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Fit after terminal is rendered
    setTimeout(() => {
      fitRef.current?.fit();
      if (sessionIdRef.current && socket.connected) {
        socket.emit('terminal:resize', {
          sessionId: sessionIdRef.current,
          cols: xtermRef.current?.cols,
          rows: xtermRef.current?.rows,
        });
      }
    }, 100);
  }, [connecting, connected, showToast]);

  const disconnect = useCallback(() => {
    if (sessionIdRef.current && socketRef.current) {
      socketRef.current.emit('terminal:close', { sessionId: sessionIdRef.current });
    }
    socketRef.current?.disconnect();
    socketRef.current = null;
    sessionIdRef.current = null;
    setConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      xtermRef.current?.dispose();
    };
  }, [disconnect]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitRef.current) {
        fitRef.current.fit();
        if (sessionIdRef.current && socketRef.current?.connected) {
          socketRef.current.emit('terminal:resize', {
            sessionId: sessionIdRef.current,
            cols: xtermRef.current?.cols,
            rows: xtermRef.current?.rows,
          });
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#30363d] shrink-0 bg-[#161b22]">
        <div className="flex items-center gap-3">
          <TerminalIcon className="w-5 h-5 text-[#c9d1d9]" />
          <H2 variant="sm" className="text-[#c9d1d9]">Terminal</H2>
          {connected && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Connected
            </span>
          )}
          {connecting && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 text-xs font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              Connecting
            </span>
          )}
          {!connected && !connecting && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs font-medium">
              <AlertCircle className="w-3 h-3" />
              Disconnected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <button
              onClick={disconnect}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Play className="w-3 h-3" />
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 overflow-hidden relative">
        <div ref={terminalRef} className="absolute inset-0" />
        {!connected && !connecting && !xtermRef.current && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[#8b949e]">
            <TerminalIcon className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-sm font-medium mb-2">Terminal</p>
            <p className="text-xs text-[#6e7681] mb-4">Click Connect to start a shell session</p>
            <button
              onClick={connect}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#21262d] text-[#c9d1d9] border border-[#30363d] hover:border-[#8b949e] transition-colors flex items-center gap-2"
            >
              <Play className="w-3 h-3" />
              Connect
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[#30363d] shrink-0 bg-[#161b22]">
        <span className="text-[11px] text-[#8b949e]">
          {connected ? `Connected to agent-os-backend` : 'Not connected'}
        </span>
        <span className="text-[11px] text-[#6e7681]">
          {xtermRef.current?.rows || 24} × {xtermRef.current?.cols || 80}
        </span>
      </div>
    </div>
  );
}

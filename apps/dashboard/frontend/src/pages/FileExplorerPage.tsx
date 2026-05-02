/**
 * File Explorer — browse filesystem, view/edit files, upload/download,
 * and integrated xterm.js terminal panel.
 */
import { useState, useEffect, useRef } from "react";
import {
  Folder, FolderOpen, FileText, Upload, Download,
  ChevronRight, ChevronDown, Plus, RefreshCw,
  Terminal as TerminalIcon, ExternalLink, X, Minus,
} from "lucide-react";
import { H2 } from "@/components/NouiTypography";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

interface FSEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modTime: string;
}

interface Tunnel {
  name: string;
  url: string;
  status: string;
}

const HOME = "/root";

export default function FileExplorerPage() {
  const [cwd, setCwd] = useState(HOME);
  const [entries, setEntries] = useState<FSEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set([HOME]));
  const [tree, setTree] = useState<Record<string, FSEntry[]>>({});
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"files" | "tunnels">("files");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const termRef2 = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // ── File listing ──────────────────────────────────────────────────────────

  async function listDir(path: string): Promise<FSEntry[]> {
    const res = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error("Failed to list directory");
    return res.json();
  }

  async function loadDir(path: string) {
    setLoading(true);
    setError("");
    try {
      const entries = await listDir(path);
      setEntries(entries);
      setTree(prev => ({ ...prev, [path]: entries }));
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { loadDir(cwd); }, [cwd]);

  // ── Tree sidebar ────────────────────────────────────────────────────────────

  async function toggleDir(path: string) {
    const next = new Set(expandedDirs);
    if (next.has(path)) { next.delete(path); setExpandedDirs(next); return; }
    next.add(path);
    setExpandedDirs(next);
    if (!tree[path]) {
      try {
        const children = await listDir(path);
        setTree(prev => ({ ...prev, [path]: children }));
      } catch {}
    }
  }

  function renderTreeNode(path: string, depth = 0) {
    const children = tree[path] || [];
    const isExpanded = expandedDirs.has(path);
    const dirs = children.filter((e: FSEntry) => e.type === "directory");
    const pad = depth * 16;

    return (
      <div key={path}>
        <button
          onClick={() => { if (dirs.length > 0) toggleDir(path); else { setCwd(path); setSelectedPath(path); } }}
          className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm hover:bg-[#2d3748] transition-all ${
            cwd === path ? "bg-[#2d3748] text-[#3b82f6]" : "text-[#9ca3af]"
          }`}
          style={{ paddingLeft: pad + 8 }}
        >
          {dirs.length > 0
            ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)
            : <span className="w-3" />}
          {isExpanded ? <FolderOpen size={14} className="text-yellow-400" /> : <Folder size={14} className="text-yellow-400" />}
          <span className="truncate">{path.split("/").pop() || "/"}</span>
        </button>
        {isExpanded && dirs.map((d: FSEntry) => renderTreeNode(d.path, depth + 1))}
      </div>
    );
  }

  // ── File preview ──────────────────────────────────────────────────────────

  async function previewFile(entry: FSEntry) {
    setSelectedPath(entry.path);
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", cwd);
    const res = await fetch("/api/files/upload", { method: "POST", body: formData });
    if (!res.ok) setError("Upload failed");
    else loadDir(cwd);
  }

  async function mkdirPrompt() {
    const name = prompt("Folder name:");
    if (!name) return;
    const res = await fetch("/api/files/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: cwd, name }),
    });
    if (!res.ok) setError("mkdir failed");
    else loadDir(cwd);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  // ── Terminal ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!terminalOpen || !termRef.current) return;
    const term = new Terminal({ theme: { background: "#0f1117", foreground: "#e8e6e3", cursor: "#3b82f6" }, fontSize: 13, fontFamily: "monospace", scrollback: 500 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();
    termRef2.current = term;
    fitRef.current = fit;

    let currentLine = "";
    let ws: WebSocket | null = null;

    ws = new WebSocket(`ws://${window.location.host}/api/pty`);

    ws.onopen = () => term.write("\r\n$ ");
    ws.onmessage = (ev) => {
      if (ev.data === "\n") { term.write("\r\n"); term.write("$ "); }
      else term.write(ev.data);
    };
    ws.onclose = () => term.write("\r\n[disconnected]\r\n");

    term.onData((data) => {
      if (data === "\r") {
        ws?.send(JSON.stringify({ type: "input", data: currentLine + "\n" }));
        currentLine = "";
      } else if (data === "\x7f") {
        if (currentLine.length > 0) { currentLine = currentLine.slice(0, -1); term.write("\b \b"); }
      } else { currentLine += data; term.write(data); }
    });

    const observer = new ResizeObserver(() => fit.fit());
    if (termRef.current) observer.observe(termRef.current);

    return () => { ws?.close(); term.dispose(); observer.disconnect(); };
  }, [terminalOpen]);

  // ── Tunnels ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab !== "tunnels") return;
    fetch("/api/tunnels")
      .then(r => r.ok ? r.json() : [])
      .then(setTunnels)
      .catch(() => setTunnels([]));
  }, [activeTab]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
  }

  function breadcrumb(): string[] {
    const parts = cwd.split("/").filter(Boolean);
    const crumbs = ["/"];
    let acc = "";
    for (const p of parts) { acc += "/" + p; crumbs.push(acc); }
    return crumbs;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-[#1f2937] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <H2 variant="xl" className="text-[#e8e6e3]">Files</H2>
          <div className="flex gap-1 bg-[#1a1f2e] rounded-lg p-0.5">
            {(["files", "tunnels"] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${activeTab === t ? "bg-[#2d3748] text-[#e8e6e3]" : "text-[#6b7280] hover:text-[#9ca3af]"}`}>
                {t === "files" ? "Files" : "Tunnels"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTerminalOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${terminalOpen ? "bg-[#3b82f6] text-white" : "bg-[#1f2937] text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151]"}`}>
            <TerminalIcon size={13} /> Terminal
          </button>
          {activeTab === "files" && (
            <>
              <button onClick={mkdirPrompt} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all">
                <Plus size={13} /> New Folder
              </button>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all cursor-pointer">
                <Upload size={13} /> Upload
                <input type="file" multiple className="hidden" onChange={e => { if (e.target.files) Array.from(e.target.files).forEach(uploadFile); }} />
              </label>
              <button onClick={() => loadDir(cwd)} className="p-1.5 rounded-lg bg-[#1f2937] text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all">
                <RefreshCw size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      {activeTab === "files" && (
        <div className="shrink-0 px-6 py-2 border-b border-[#1f2937] flex items-center gap-1 text-xs">
          {breadcrumb().map((part, i, arr) => (
            <span key={i} className="flex items-center">
              {i > 0 && <ChevronRight size={11} className="mx-1 text-[#4b5563]" />}
              <button
                onClick={() => setCwd(part)}
                className={`px-1.5 py-0.5 rounded hover:bg-[#2d3748] transition-all ${i === arr.length - 1 ? "text-[#e8e6e3]" : "text-[#6b7280]"}`}
              >
                {part === "/" ? "/" : part.split("/").pop()}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar tree */}
        {activeTab === "files" && (
          <div className="w-56 shrink-0 border-r border-[#1f2937] overflow-y-auto py-2 px-2">
            {renderTreeNode(HOME)}
          </div>
        )}

        {/* File list */}
        {activeTab === "files" && (
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-[#6b7280]"><RefreshCw size={24} className="animate-spin" /></div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-[#6b7280]">
                <Folder size={40} className="opacity-20" /><p className="text-sm">Empty folder</p>
              </div>
            ) : (
              <div className="p-4">
                {/* Folders first */}
                {entries.filter(e => e.type === "directory").map(entry => (
                  <button key={entry.path} onClick={() => { setCwd(entry.path); setSelectedPath(entry.path); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all ${selectedPath === entry.path ? "bg-[#2d3748]" : "hover:bg-[#1f2937]"}`}>
                    <Folder size={18} className="text-yellow-400 shrink-0" />
                    <div className="flex-1 text-left">
                      <H2 variant="sm" className="text-[#e8e6e3]">{entry.name}</H2>
                      <p className="text-xs text-[#6b7280]">Folder</p>
                    </div>
                  </button>
                ))}
                {/* Files */}
                {entries.filter(e => e.type !== "directory").map(entry => (
                  <button key={entry.path} onClick={() => { previewFile(entry); setSelectedPath(entry.path); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-all ${selectedPath === entry.path ? "bg-[#2d3748]" : "hover:bg-[#1f2937]"}`}>
                    <FileText size={18} className="text-[#3b82f6] shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <H2 variant="sm" className="text-[#e8e6e3] truncate">{entry.name}</H2>
                      <p className="text-xs text-[#6b7280]">{formatSize(entry.size)}</p>
                    </div>
                    {entry.size > 0 && (
                      <a href={`/api/files/download?path=${encodeURIComponent(entry.path)}`} download
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded text-[#6b7280] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all">
                        <Download size={14} />
                      </a>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tunnels tab */}
        {activeTab === "tunnels" && (
          <div className="flex-1 overflow-y-auto p-6">
            {tunnels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
                <ExternalLink size={40} className="opacity-20" />
                <p className="text-sm">No Cloudflare tunnels active</p>
                <p className="text-xs">Run <code className="bg-[#1f2937] px-1 rounded">cloudflared tunnel</code> to create one</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {tunnels.map((tunnel: Tunnel) => (
                  <a key={tunnel.name} href={tunnel.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-4 p-4 bg-[#1a1f2e] border border-[#2d3748] rounded-xl hover:border-[#3b82f6]/50 transition-all group">
                    <ExternalLink size={20} className="text-[#3b82f6]" />
                    <div className="flex-1">
                      <H2 variant="sm" className="text-[#e8e6e3] font-semibold">{tunnel.name}</H2>
                      <p className="text-xs text-[#6b7280] font-mono">{tunnel.url}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${tunnel.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-[#2d3748] text-[#6b7280]"}`}>
                      {tunnel.status}
                    </span>
                    <ExternalLink size={14} className="text-[#6b7280] group-hover:text-[#3b82f6]" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Terminal panel */}
      {terminalOpen && (
        <div className="shrink-0 border-t border-[#1f2937" style={{ height: "220px", background: "#0f1117" }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f2937]">
            <span className="text-xs text-[#6b7280] flex items-center gap-1.5"><TerminalIcon size={12} /> Terminal</span>
            <div className="flex gap-1">
              <button onClick={() => setTerminalOpen(false)} className="p-1 rounded hover:bg-[#2d3748] text-[#6b7280] hover:text-[#e8e6e3]"><Minus size={12} /></button>
              <button onClick={() => setTerminalOpen(false)} className="p-1 rounded hover:bg-[#2d3748] text-[#6b7280] hover:text-[#e8e6e3]"><X size={12} /></button>
            </div>
          </div>
          <div ref={termRef} className="overflow-hidden" style={{ height: "calc(100% - 36px)" }} />
        </div>
      )}
    </div>
  );
}

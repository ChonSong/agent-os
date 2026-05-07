/**
 * File Explorer page — browse /opt/data and /home/sean on the host server.
 * Read-only, path traversal protected at the backend level.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  Upload,
} from "lucide-react";
import { H2 } from "@/components/NouiTypography";
import { api, type FileEntry, type FileContent } from "@/lib/api";

function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function PathBreadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.split("/").filter(Boolean);
  const fullParts: string[] = [];
  return (
    <div className="flex items-center gap-1 text-[10px] text-[#6b7280] flex-wrap">
      {parts.map((part, i) => {
        fullParts.push(part);
        const isLast = i === parts.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3" />}
            <button
              onClick={() => !isLast && onNavigate("/" + fullParts.join("/"))}
              className={`${isLast ? "text-[#e8e6e3] font-medium" : "hover:text-[#9ca3af]"} transition-colors`}
            >
              {part}
            </button>
          </span>
        );
      })}
    </div>
  );
}

export default function FileExplorerPage() {
  const [cwd, setCwd] = useState("/home/sean");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<FileContent | null>(null);

  const load = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setSelected(null);
    try {
      const data = await api.browseDirectory(dir);
      // Sort: dirs first, then alphabetically
      setEntries(data.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
      setCwd(dir);
    } catch (e) {
      setError(String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(cwd); }, [load, cwd]);

  function navigate(dir: string) {
    setCwd(dir);
  }

  function navigateUp() {
    const parts = cwd.split("/").filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    setCwd("/" + parts.join("/"));
  }

  async function openFile(name: string) {
    const fullPath = cwd === "/" ? name : `${cwd}/${name}`;
    try {
      const data: FileContent = await api.readFileContent(fullPath);
      setPreview(data);
      setSelected(name);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div className="flex-1 min-w-0">
          <H2 variant="xl" className="text-[#e8e6e3]">File Explorer</H2>
          <div className="mt-1">
            <PathBreadcrumb path={cwd} onNavigate={navigate} />
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <button
            onClick={() => navigateUp()}
            className="p-2 rounded-lg bg-[#1f2937] hover:bg-[#374151] text-[#9ca3af] hover:text-[#e8e6e3] transition-all"
            title="Go up"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <button
            onClick={() => load(cwd)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f2937] hover:bg-[#374151] border border-[#1f2937] hover:border-[#4b5563] rounded-lg text-[10px] text-[#9ca3af] transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File list */}
        <div className={`flex-1 overflow-y-auto p-4 ${preview ? "border-r border-[#1f2937]" : ""}`}>
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-6 h-6 animate-spin text-[#4b5563]" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <p className="text-[11px] text-[#ef4444]">{error}</p>
              <button onClick={() => load(cwd)} className="text-[10px] text-[#6b7280] hover:text-[#9ca3af]">
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[#6b7280]">
              <Folder className="w-8 h-8 opacity-20" />
              <p className="text-[11px]">Empty directory</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* Hardcoded root dirs */}
              {cwd === "/" && (
                <>
                  {[
                    { name: "opt", type: "dir" as const, size: 0, mtime: null },
                    { name: "home", type: "dir" as const, size: 0, mtime: null },
                  ].map(e => (
                    <div
                      key={e.name}
                      onClick={() => navigate(`/${e.name}`)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1f2937] cursor-pointer transition-colors group"
                    >
                      <Folder className="w-4 h-4 text-[#f59e0b] shrink-0" />
                      <span className="text-[11px] text-[#9ca3af] group-hover:text-[#e8e6e3]">{e.name}</span>
                    </div>
                  ))}
                  <div className="border-t border-[#1f2937] my-2" />
                </>
              )}
              {entries.map((entry) => (
                <div
                  key={entry.name}
                  onClick={() => entry.type === "dir" ? navigate(cwd === "/" ? `/${entry.name}` : `${cwd}/${entry.name}`) : openFile(entry.name)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1f2937] cursor-pointer transition-colors group ${selected === entry.name ? "bg-[#1f2937]" : ""}`}
                >
                  {entry.type === "dir" ? (
                    <Folder className="w-4 h-4 text-[#f59e0b] shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-[#6b7280] shrink-0" />
                  )}
                  <span className="text-[11px] text-[#9ca3af] group-hover:text-[#e8e6e3] flex-1 truncate">{entry.name}</span>
                  <span className="text-[10px] text-[#4b5563] shrink-0">{formatSize(entry.size)}</span>
                  <span className="text-[10px] text-[#4b5563] shrink-0 w-16 text-right">{formatAge(entry.mtime)}</span>
                  {entry.type === "dir" && <ChevronRight className="w-3 h-3 text-[#4b5563] shrink-0" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* File preview panel */}
        {preview && (
          <div className="w-96 shrink-0 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f2937] shrink-0">
              <span className="text-[10px] text-[#9ca3af]">Preview: {selected}</span>
              <button
                onClick={() => { setPreview(null); setSelected(null); }}
                className="text-[10px] text-[#6b7280] hover:text-[#9ca3af]"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-[10px] text-[#9ca3af] font-mono whitespace-pre-wrap break-all leading-relaxed">
                {preview.content}
              </pre>
            </div>
            <div className="px-4 py-2 border-t border-[#1f2937] shrink-0">
              <span className="text-[9px] text-[#4b5563]">
                {formatSize(preview.size)} · {preview.mtime ? new Date(preview.mtime).toLocaleString() : "—"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * File Explorer — browse and edit /opt/data and /home/sean on the host server.
 * Write and delete protected at both backend and frontend level.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  Upload,
  Trash2,
  Plus,
  Save,
  X,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { H2 } from "@/components/NouiTypography";
import { api, type FileEntry, type FileContent } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Toast } from "@/components/Toast";

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

/** Modal for creating a new file */
function NewFileModal({ cwd, onClose, onCreated }: {
  cwd: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) { setError("Name required"); return; }
    if (name.includes("/") || name.includes("..")) { setError("No slashes or .."); return; }
    setLoading(true);
    setError("");
    try {
      const fullPath = cwd === "/" ? `/${name}` : `${cwd}/${name}`;
      await api.writeFile(fullPath, "# New file\n");
      onCreated(name);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to create file");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-xl border border-[#1f2937] bg-[#0d1117] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f2937]">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#5e6ad2]" />
            <span className="text-[11px] font-medium text-[#e8e6e3]">New File</span>
          </div>
          <button onClick={onClose} className="text-[#6b7280] hover:text-[#9ca3af]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-[10px] text-[#6b7280]">
            <Folder className="w-3 h-3" />
            <span className="truncate">{cwd}/</span>
          </div>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="filename.txt"
            className="w-full px-3 py-2 rounded-lg bg-[#161b22] border border-[#1f2937] text-[11px] text-[#e8e6e3] placeholder-[#4b5563] focus:outline-none focus:border-[#5e6ad2]"
          />
          {error && <p className="text-[10px] text-[#ef4444]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-[10px] text-[#9ca3af] hover:text-[#e8e6e3] transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-medium bg-[#5e6ad2] hover:bg-[#4f52c9] text-white transition-colors disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Confirm dialog for delete */
function DeleteConfirm({ name, path, type, onClose, onConfirm }: {
  name: string; path: string; type: "file" | "dir";
  onClose: () => void; onConfirm: () => void;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-xl border border-[#1f2937] bg-[#0d1117] shadow-2xl">
        <div className="flex flex-col items-center gap-3 p-6">
          <div className="p-3 rounded-full bg-[#7f1d1d]/20">
            <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
          </div>
          <div className="text-center">
            <p className="text-[11px] font-medium text-[#e8e6e3]">Delete {type}?</p>
            <p className="text-[10px] text-[#6b7280] mt-1 font-mono">{path}</p>
          </div>
          <p className="text-[9px] text-[#6b7280] text-center">
            {type === "dir" ? "Directory must be empty." : "This cannot be undone."}
          </p>
          <div className="flex gap-2 w-full">
            <button onClick={onClose} className="flex-1 py-1.5 rounded-lg text-[10px] text-[#9ca3af] hover:text-[#e8e6e3] border border-[#1f2937] hover:border-[#4b5563] transition-colors">
              Cancel
            </button>
            <button
              onClick={async () => { setLoading(true); await onConfirm(); }}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium bg-[#dc2626] hover:bg-[#b91c1c] text-white transition-colors disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete
            </button>
          </div>
        </div>
      </div>
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
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editDirty, setEditDirty] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; path: string; type: "file" | "dir" } | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  const load = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setSelected(null);
    setEditing(false);
    try {
      const data = await api.browseDirectory(dir);
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

  function navigate(dir: string) { setCwd(dir); }

  function navigateUp() {
    const parts = cwd.split("/").filter(Boolean);
    if (parts.length <= 1) { setCwd("/"); return; }
    parts.pop();
    setCwd("/" + parts.join("/"));
  }

  async function openFile(name: string) {
    const fullPath = cwd === "/" ? name : `${cwd}/${name}`;
    try {
      const data: FileContent = await api.readFileContent(fullPath);
      setPreview(data);
      setSelected(name);
      setEditing(false);
      setEditDirty(false);
      setEditContent(data.content);
    } catch (e) {
      showToast(`Failed to open: ${e}`, "error");
    }
  }

  async function handleDelete(name: string, type: "file" | "dir") {
    const fullPath = cwd === "/" ? name : `${cwd}/${name}`;
    try {
      await api.deleteFile(fullPath);
      showToast(`Deleted ${name}`, "success");
      setDeleteTarget(null);
      if (selected === name) { setPreview(null); setSelected(null); }
      load(cwd);
    } catch (e: unknown) {
      showToast(`Delete failed: ${(e as Error).message ?? e}`, "error");
    }
  }

  async function handleSave() {
    if (!selected) return;
    const fullPath = cwd === "/" ? selected : `${cwd}/${selected}`;
    setSaving(true);
    try {
      await api.writeFile(fullPath, editContent);
      setEditDirty(false);
      setEditing(false);
      const updated: FileContent = await api.readFileContent(fullPath);
      setPreview(updated);
      showToast(`Saved ${selected}`, "success");
    } catch (e: unknown) {
      showToast(`Save failed: ${(e as Error).message ?? e}`, "error");
    } finally {
      setSaving(false);
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
            onClick={() => setShowNewFile(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5e6ad2] hover:bg-[#4f52c9] rounded-lg text-[10px] font-medium text-white transition-colors"
          >
            <Plus className="w-3 h-3" />
            New File
          </button>
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
              <button onClick={() => load(cwd)} className="text-[10px] text-[#6b7280] hover:text-[#9ca3af]">Retry</button>
            </div>
          ) : entries.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[#6b7280]">
              <Folder className="w-8 h-8 opacity-20" />
              <p className="text-[11px]">Empty directory</p>
              <button onClick={() => setShowNewFile(true)} className="text-[10px] text-[#5e6ad2] hover:underline">
                Create a file
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {/* Root directories */}
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
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#1f2937] cursor-pointer transition-colors group ${selected === entry.name ? "bg-[#1f2937]" : ""}`}
                >
                  <div
                    className="flex-1 flex items-center gap-2 min-w-0"
                    onClick={() => entry.type === "dir"
                      ? navigate(cwd === "/" ? `/${entry.name}` : `${cwd}/${entry.name}`)
                      : openFile(entry.name)
                    }
                  >
                    {entry.type === "dir" ? (
                      <Folder className="w-4 h-4 text-[#f59e0b] shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-[#6b7280] shrink-0" />
                    )}
                    <span className="text-[11px] text-[#9ca3af] group-hover:text-[#e8e6e3] truncate">{entry.name}</span>
                  </div>
                  <span className="text-[9px] text-[#4b5563] shrink-0 hidden group-hover:flex">
                    {entry.type === "dir" ? "dir" : formatSize(entry.size)}
                  </span>
                  <span className="text-[9px] text-[#4b5563] shrink-0 w-14 text-right hidden group-hover:flex">
                    {formatAge(entry.mtime)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget({ name: entry.name, path: cwd === "/" ? `/${entry.name}` : `${cwd}/${entry.name}`, type: entry.type }); }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#dc2626]/20 text-[#6b7280] hover:text-[#ef4444] shrink-0 transition-all"
                    title={`Delete ${entry.type}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  {entry.type === "dir" && <ChevronRight className="w-3 h-3 text-[#4b5563] shrink-0" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* File preview / edit panel */}
        {preview && (
          <div className="w-[28rem] lg:w-[36rem] xl:w-[44rem] shrink-0 flex flex-col overflow-hidden">
            {/* Preview header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f2937] shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-[#6b7280] shrink-0" />
                <span className="text-[10px] text-[#9ca3af] truncate">{selected}</span>
                {editDirty && <span className="text-[8px] text-[#f59e0b]">● unsaved</span>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!editing ? (
                  <>
                    <button
                      onClick={() => { setEditing(true); setEditDirty(false); }}
                      className="px-2 py-1 rounded text-[9px] text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#1f2937] transition-colors"
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ name: selected!, path: cwd === "/" ? `/${selected}` : `${cwd}/${selected}`, type: "file" })}
                      className="p-1.5 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#dc2626]/20 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditing(false); setEditContent(preview?.content ?? ""); setEditDirty(false); }}
                      className="px-2 py-1 rounded text-[9px] text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#1f2937] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !editDirty}
                      className="flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-medium bg-[#5e6ad2] hover:bg-[#4f52c9] text-white transition-colors disabled:opacity-40"
                    >
                      {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setPreview(null); setSelected(null); setEditing(false); }}
                  className="ml-1 p-1 rounded text-[#6b7280] hover:text-[#9ca3af] hover:bg-[#1f2937] transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Preview / editor content */}
            <div className="flex-1 overflow-auto p-4">
              {editing ? (
                <textarea
                  autoFocus
                  value={editContent}
                  onChange={e => { setEditContent(e.target.value); setEditDirty(e.target.value !== preview.content); }}
                  className="w-full h-full min-h-64 resize-none rounded-lg bg-[#0d1117] border border-[#1f2937] text-[11px] text-[#e8e6e3] font-mono leading-relaxed p-3 focus:outline-none focus:border-[#5e6ad2]"
                  spellCheck={false}
                />
              ) : (
                <pre className="text-[11px] text-[#9ca3af] font-mono whitespace-pre-wrap break-all leading-relaxed">
                  {preview.content}
                </pre>
              )}
            </div>

            {/* Preview footer */}
            <div className="px-4 py-2 border-t border-[#1f2937] shrink-0">
              <span className="text-[9px] text-[#4b5563]">
                {formatSize(preview.size)} · {preview.mtime ? new Date(preview.mtime).toLocaleString() : "—"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewFile && (
        <NewFileModal
          cwd={cwd}
          onClose={() => setShowNewFile(false)}
          onCreated={(name) => {
            setShowNewFile(false);
            load(cwd);
            openFile(name);
          }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.name}
          path={deleteTarget.path}
          type={deleteTarget.type}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget.name, deleteTarget.type)}
        />
      )}
      <Toast toast={toast} />
    </div>
  );
}

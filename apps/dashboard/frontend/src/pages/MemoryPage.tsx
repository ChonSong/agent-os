/**
 * MemoryPage — Browse and view agent memory files.
 * Uses the agent-os file API to read from the hermes memory directory.
 */
import { useEffect, useState, useCallback } from 'react';
import { Brain, Search, FileText, Clock, Save, X, Loader2 } from 'lucide-react';
import { H2 } from '@/components/NouiTypography';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface MemoryFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export default function MemoryPage() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();

  const MEMORY_PATHS = ['/opt/data/memory', '/opt/data', '/home/sean/.hermes'];

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const results: MemoryFile[] = [];
      for (const basePath of MEMORY_PATHS) {
        try {
          const listRes = await api.browseDirectory(basePath);
          if (listRes && Array.isArray(listRes)) {
            for (const entry of listRes) {
              if (entry.isDirectory) continue;
              const name = entry.name || '';
              if (name.endsWith('.md') && (
                name === 'MEMORY.md' ||
                name.includes('memory') ||
                name.includes('memory-') ||
                /memory\/\d{4}-\d{2}-\d{2}\.md/.test(entry.path || '') ||
                /memories\/\d{4}-\d{2}-\d{2}\.md/.test(entry.path || '')
              )) {
                results.push({
                  name,
                  path: entry.path || `${basePath}/${name}`,
                  size: entry.size || 0,
                  modified: entry.modified || new Date().toISOString(),
                });
              }
            }
          }
        } catch { /* skip inaccessible paths */ }
      }
      // Deduplicate by path
      const seen = new Set<string>();
      const unique = results.filter(f => {
        if (seen.has(f.path)) return false;
        seen.add(f.path);
        return true;
      });
      // Sort: MEMORY.md first, then by date
      unique.sort((a, b) => {
        if (a.name === 'MEMORY.md') return -1;
        if (b.name === 'MEMORY.md') return 1;
        return b.name.localeCompare(a.name);
      });
      setFiles(unique);
    } catch (err) {
      toast({ title: 'Failed to load memory files', description: String(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const loadFile = useCallback(async (path: string) => {
    setSelectedFile(path);
    setEditing(false);
    try {
      const content = await api.readFileContent(path);
      setContent(content);
      setDraftContent(content);
    } catch (err) {
      toast({ title: 'Failed to read file', description: String(err), type: 'error' });
    }
  }, [toast]);

  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await api.writeFile(selectedFile, draftContent);
      setContent(draftContent);
      setEditing(false);
      toast({ title: 'Memory saved', description: selectedFile.split('/').pop(), type: 'success' });
    } catch (err) {
      toast({ title: 'Failed to save', description: String(err), type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [selectedFile, draftContent, toast]);

  const filteredFiles = searchQuery
    ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5" />
          <H2 variant="xl">Memory</H2>
        </div>
        <button
          onClick={loadFiles}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* File list sidebar */}
        <div className="w-72 border-r flex flex-col shrink-0 overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search memory files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading...
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {searchQuery ? 'No matching files' : 'No memory files found'}
              </div>
            ) : (
              filteredFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => loadFile(file.path)}
                  className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors flex items-start gap-3 ${
                    selectedFile === file.path ? 'bg-muted border-l-2 border-l-accent' : ''
                  }`}
                >
                  <FileText className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatBytes(file.size)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedFile ? (
            <>
              {/* File header */}
              <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
                <div>
                  <p className="text-sm font-medium">{selectedFile.split('/').pop()}</p>
                  <p className="text-xs text-muted-foreground">{selectedFile}</p>
                </div>
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <button
                        onClick={saveFile}
                        disabled={saving}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1.5"
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setEditing(false); setDraftContent(content); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {editing ? (
                  <textarea
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    className="w-full h-full min-h-[400px] font-mono text-sm p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                    {content || '(empty)'}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Brain className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">Select a memory file</p>
              <p className="text-xs mt-1">Choose from the list on the left to view or edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

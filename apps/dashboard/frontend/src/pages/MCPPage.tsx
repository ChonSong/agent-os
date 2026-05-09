/**
 * MCPPage — Manage MCP (Model Context Protocol) servers.
 * Add, configure, test, and monitor MCP server connections.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Plug,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Server,
  Wrench,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { H2 } from '@/components/NouiTypography';
import { useToast } from '@/hooks/useToast';

interface MCPServer {
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  tools: string[];
  error?: string;
}

export default function MCPPage() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const { toast } = useToast();

  // New server form state
  const [newName, setNewName] = useState('');
  const [newTransport, setNewTransport] = useState<'stdio' | 'http' | 'sse'>('stdio');
  const [newCommand, setNewCommand] = useState('');
  const [newArgs, setNewArgs] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      setServers(data.servers || []);
    } catch (err) {
      toast({ title: 'Failed to load MCP servers', description: String(err), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const toggleExpand = (name: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const testServer = async (name: string) => {
    setTestingServer(name);
    try {
      const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'connected') {
        toast({ title: `${name} connected`, description: 'MCP server is reachable', type: 'success' });
        // Scan tools
        await fetch(`/api/mcp/servers/${encodeURIComponent(name)}/tools`, { method: 'POST' });
        setExpandedServers(prev => new Set([...prev, name]));
      } else {
        toast({ title: `${name} connection failed`, description: data.error || 'Unknown error', type: 'error' });
      }
      loadServers();
    } catch (err) {
      toast({ title: 'Test failed', description: String(err), type: 'error' });
    } finally {
      setTestingServer(null);
    }
  };

  const deleteServer = async (name: string) => {
    try {
      await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' });
      toast({ title: `${name} removed`, description: 'MCP server deleted', type: 'success' });
      loadServers();
    } catch (err) {
      toast({ title: 'Delete failed', description: String(err), type: 'error' });
    }
  };

  const addServer = async () => {
    if (!newName) return;
    const body: Record<string, unknown> = {
      name: newName,
      transport: newTransport,
      enabled: true,
    };
    if (newTransport === 'stdio') {
      body.command = newCommand;
      body.args = newArgs.split(' ').filter(Boolean);
    } else {
      body.url = newUrl;
    }
    try {
      await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast({ title: `${newName} added`, description: 'MCP server created', type: 'success' });
      setShowAddDialog(false);
      setNewName('');
      setNewCommand('');
      setNewArgs('');
      setNewUrl('');
      loadServers();
    } catch (err) {
      toast({ title: 'Add failed', description: String(err), type: 'error' });
    }
  };

  const toggleEnabled = async (server: MCPServer) => {
    try {
      await fetch(`/api/mcp/servers/${encodeURIComponent(server.name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !server.enabled }),
      });
      loadServers();
    } catch (err) {
      toast({ title: 'Update failed', description: String(err), type: 'error' });
    }
  };

  const statusIcon = (server: MCPServer) => {
    if (!server.enabled) return <span className="w-2 h-2 rounded-full bg-gray-400" />;
    if (testingServer === server.name) return <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />;
    switch (server.status) {
      case 'connected': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-400" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const totalTools = servers.reduce((sum, s) => sum + s.tools.length, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Plug className="w-5 h-5" />
          <div>
            <H2 variant="xl">MCP Servers</H2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {servers.length} servers · {totalTools} tools · {servers.filter(s => s.status === 'connected').length} connected
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3 h-3" />
          Add Server
        </button>
      </div>

      {/* Server list */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading MCP servers...
          </div>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Server className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-medium mb-1">No MCP servers configured</p>
            <p className="text-xs mb-4">Add an MCP server to extend agent capabilities</p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
            >
              Add Server
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {servers.map((server) => (
              <div key={server.name} className="bento-card p-0 overflow-hidden">
                {/* Server header */}
                <div className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleExpand(server.name)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {expandedServers.has(server.name) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    {statusIcon(server)}
                    <div>
                      <p className="text-sm font-medium">{server.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {server.transport} {server.transport === 'stdio' ? `· ${server.command || '—'}` : `· ${server.url || '—'}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleEnabled(server)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                        server.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                      }`}
                    >
                      {server.enabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      onClick={() => testServer(server.name)}
                      disabled={testingServer !== null}
                      className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                      title="Test connection"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteServer(server.name)}
                      className="p-1.5 rounded hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400"
                      title="Delete server"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Server details (expanded) */}
                {expandedServers.has(server.name) && (
                  <div className="border-t px-5 py-4 bg-muted/30">
                    {server.error && (
                      <div className="flex items-center gap-2 mb-3 text-xs text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        {server.error}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Tools ({server.tools.length})
                      </span>
                    </div>
                    {server.tools.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No tools discovered. Click the play button to test and scan.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {server.tools.map((tool) => (
                          <span key={tool} className="px-2 py-0.5 rounded-md bg-muted/50 text-xs font-mono text-muted-foreground">
                            {tool}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Server Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bento-card w-full max-w-md mx-4 p-6">
            <h3 className="text-sm font-semibold mb-4">Add MCP Server</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., filesystem, github, postgres"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Transport</label>
                <select
                  value={newTransport}
                  onChange={(e) => setNewTransport(e.target.value as 'stdio' | 'http' | 'sse')}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <option value="stdio">stdio (local process)</option>
                  <option value="http">HTTP (remote server)</option>
                  <option value="sse">SSE (streaming)</option>
                </select>
              </div>
              {newTransport === 'stdio' ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Command</label>
                    <input
                      type="text"
                      value={newCommand}
                      onChange={(e) => setNewCommand(e.target.value)}
                      placeholder="e.g., npx, python, node"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Arguments</label>
                    <input
                      type="text"
                      value={newArgs}
                      onChange={(e) => setNewArgs(e.target.value)}
                      placeholder="e.g., -y @modelcontextprotocol/server-filesystem /opt/data"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">URL</label>
                  <input
                    type="text"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="e.g., http://localhost:3001/mcp"
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addServer}
                disabled={!newName}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
              >
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

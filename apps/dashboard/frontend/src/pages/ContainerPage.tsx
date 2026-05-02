/**
 * Container management page — lists Docker containers, shows status,
 * resource stats, logs, and start/stop/restart/remove via Docker Engine API.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Box, Play, Square, RotateCw, Trash2, Plus, RefreshCw,
  Terminal, BarChart3, ChevronDown, ChevronRight, Image,
} from "lucide-react";
import { H2 } from "@/components/NouiTypography";

interface Container {
  Id: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
  Created: string;
  Labels: Record<string, string>;
}

interface ContainerStats {
  containerId: string;
  cpuPct: string;
  memUsage: string;
  memPct: string;
  netIO: string;
  blockIO: string;
}

function containerStateColor(state: string): string {
  switch (state.toLowerCase()) {
    case "running":    return "text-[#10b981]";
    case "exited":     return "text-[#6b7280]";
    case "paused":     return "text-yellow-400";
    case "restarting": return "text-blue-400";
    case "dead":       return "text-red-500";
    default:           return "text-[#9ca3af]";
  }
}

function containerStateBg(state: string): string {
  switch (state.toLowerCase()) {
    case "running":    return "bg-[#10b981]/10 border-[#10b981]/30";
    case "exited":     return "bg-[#6b7280]/10 border-[#6b7280]/30";
    case "paused":     return "bg-yellow-400/10 border-yellow-400/30";
    default:           return "bg-[#1f2937]/50 border-[#1f2937]";
  }
}

// Parse NDJSON from `docker ps --format=json`
function parseContainers(text: string): Container[] {
  return text.trim().split("\n").filter(Boolean).map(line => {
    try {
      const o = JSON.parse(line);
      return {
        Id:     o.ID   || o.Id   || "",
        Names:  o.Names  || "",
        Image:  o.Image  || "",
        State:  o.State  || o.Status || "",
        Status: o.Status || "",
        Ports:  o.Ports  || "",
        Created: o.CreatedAt || o.Created || "",
        Labels: o.Labels
          ? (typeof o.Labels === "string" ? JSON.parse(o.Labels) : o.Labels)
          : {},
      } as Container;
    } catch { return null; }
  }).filter(Boolean) as Container[];
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`/api/docker/${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
}

async function fetchContainers(): Promise<Container[]> {
  const res = await apiFetch("containers/json?all=true");
  if (!res.ok) return [];
  return parseContainers(await res.text());
}

async function fetchStats(id: string): Promise<ContainerStats | null> {
  const res = await apiFetch(`containers/${id}/stats?stream=false`);
  if (!res.ok) return null;
  try {
    const data = JSON.parse(await res.text());
    const s = Array.isArray(data) ? data[0] : data;
    const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage || 0)
      - (s.precpu_stats?.cpu_usage?.total_usage || 0);
    const sysDelta = (s.cpu_stats?.system_cpu_usage || 0)
      - (s.precpu_stats?.system_cpu_usage || 0);
    const cpus = s.cpu_stats?.online_cpus || 1;
    const cpuPct = sysDelta > 0 ? ((cpuDelta / sysDelta) * cpus * 100).toFixed(1) : "0.0";
    const memU = s.memory_stats?.usage || 0;
    const memL = s.memory_stats?.limit || 1;
    const memPct = ((memU / memL) * 100).toFixed(1);
    const memStr = memU > 1e9 ? `${(memU/1e9).toFixed(1)}GiB`
               : memU > 1e6 ? `${(memU/1e6).toFixed(1)}MiB`
               : `${(memU/1e3).toFixed(1)}KiB`;
    let net = 0;
    if (s.networks) {
      for (const n of Object.values(s.networks) as any[]) {
        net += (n.rx_bytes || 0) + (n.tx_bytes || 0);
      }
    }
    let blk = 0;
    if (s.blkio_stats?.io_service_bytes_recursive) {
      for (const b of s.blkio_stats.io_service_bytes_recursive) {
        blk += b.value || 0;
      }
    }
    const netStr  = net > 1e9 ? `${(net/1e9).toFixed(1)}GB`  : net > 1e6 ? `${(net/1e6).toFixed(1)}MB`  : `${(net/1e3).toFixed(1)}KB`;
    const blkStr  = blk > 1e9 ? `${(blk/1e9).toFixed(1)}GB` : blk > 1e6 ? `${(blk/1e6).toFixed(1)}MB` : `${(blk/1e3).toFixed(1)}KB`;
    return { containerId: id, cpuPct: `${cpuPct}%`, memUsage: memStr, memPct: `${memPct}%`, netIO: netStr, blockIO: blkStr };
  } catch { return null; }
}

// Docker stream log format: 8-byte header per frame [4B type+flags, 4B BE size, payload]
function parseLogs(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf);
  const out: string[] = [];
  let i = 0;
  while (i < u.length) {
    if (i + 8 > u.length) break;
    const size = (u[i+4] | u[i+5]<<8 | u[i+6]<<16 | u[i+7]<<24) >>> 0;
    i += 8;
    if (i + size <= u.length) out.push(new TextDecoder().decode(u.slice(i, i+size)));
    i += size;
  }
  return out.join("") || "(no logs)";
}

async function fetchLogs(id: string): Promise<string> {
  const res = await apiFetch(`containers/${id}/logs?stdout=true&stderr=true&tail=100`);
  return res.ok ? parseLogs(await res.arrayBuffer()) : "Failed to fetch logs.";
}

async function containerAction(id: string, action: "start"|"stop"|"restart"|"remove") {
  await apiFetch(`containers/${id}/${action}`, { method: action === "remove" ? "DELETE" : "POST" });
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#1f2937]/50 rounded-lg p-2.5">
      <p className="text-[#6b7280] text-[10px] uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm font-mono font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, loading, color, danger,
}: {
  icon: React.ElementType; label: string; onClick: () => void;
  loading: boolean; color?: string; danger?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading} title={label}
      className={`p-1.5 rounded-lg transition-all hover:bg-white/10 disabled:opacity-30 ${
        danger ? "text-red-400 hover:text-red-300" : color || "text-[#9ca3af]"
      }`}>
      <Icon size={14} className={loading ? "animate-spin" : ""} />
    </button>
  );
}

export default function ContainerPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading]       = useState(true);
  const [inFlight, setInFlight]      = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab]    = useState<Record<string, "logs"|"stats">>({});
  const [logs, setLogs]              = useState<Record<string, string>>({});
  const [stats, setStats]            = useState<Record<string, ContainerStats | undefined>>({});
  const [logsLoading, setLogsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchContainers();
    setContainers(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const expand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!activeTab[id]) setActiveTab(prev => ({ ...prev, [id]: "logs" }));
  };

  const switchTab = (id: string, tab: "logs"|"stats") => {
    setActiveTab(prev => ({ ...prev, [id]: tab }));
    if (tab === "logs" && !logs[id]) {
      setLogsLoading(true);
      fetchLogs(id).then(l => { setLogs(p => ({ ...p, [id]: l })); setLogsLoading(false); });
    } else if (tab === "stats" && !stats[id]) {
      setStatsLoading(true);
      fetchStats(id).then(s => { setStats(p => ({ ...p, [id]: s ?? undefined })); setStatsLoading(false); });
    }
  };

  useEffect(() => {
    if (!expandedId) return;
    const tab = activeTab[expandedId] || "logs";
    if (tab === "logs" && !logs[expandedId] && !logsLoading) {
      setLogsLoading(true);
      fetchLogs(expandedId).then(l => { setLogs(p => ({ ...p, [expandedId]: l })); setLogsLoading(false); });
    } else if (tab === "stats" && !stats[expandedId] && !statsLoading) {
      setStatsLoading(true);
      fetchStats(expandedId).then(s => { setStats(p => ({ ...p, [expandedId]: s ?? undefined })); setStatsLoading(false); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId, activeTab]);

  const doAction = async (id: string, action: "start"|"stop"|"restart"|"remove") => {
    setInFlight(id);
    await containerAction(id, action);
    await load();
    setInFlight(null);
  };

  const shortId = (id: string) => id.length > 12 ? id.slice(0, 12) : id;

  const runningCount = containers.filter(c => c.State === "running").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#e8e6e3]">Containers</H2>
          <H2 variant="sm" className="text-[#6b7280]">
            {containers.length} total
            {runningCount > 0 && <span className="ml-2 text-[#10b981]">· {runningCount} running</span>}
          </H2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />Refresh
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#10b981] text-xs text-[#0a0e14] font-semibold hover:bg-[#0d9f6e] transition-all">
            <Plus size={13} />New Container
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && !containers.length ? (
          <div className="flex items-center justify-center h-full text-[#6b7280] text-sm">Loading containers...</div>
        ) : !containers.length ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
            <Box size={40} className="opacity-30" />
            <p className="text-sm">No containers found — is Docker running?</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {containers.map(c => (
              <div key={c.Id} className="flex flex-col">

                {/* Card */}
                <div
                  className={`bg-[#111827] border rounded-xl p-4 flex flex-col gap-2 cursor-pointer hover:border-[#374151] transition-colors ${containerStateBg(c.State)}`}
                  onClick={() => expand(c.Id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {expandedId === c.Id
                          ? <ChevronDown size={14} className="text-[#6b7280] shrink-0" />
                          : <ChevronRight size={14} className="text-[#6b7280] shrink-0" />}
                        <span className="text-[#e8e6e3] font-semibold text-sm truncate">{c.Names.replace(/^\//, "")}</span>
                        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${containerStateColor(c.State)} bg-current/10`}>{c.State}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 ml-6">
                        <span className="text-[#6b7280] text-xs truncate flex items-center gap-1"><Image size={11}/>{c.Image}</span>
                        <span className="text-[#4b5563] text-xs font-mono">{shortId(c.Id)}</span>
                        <span className="text-[#6b7280] text-xs">{c.Status}</span>
                      </div>
                    </div>
                    {/* Actions — stop propagation so clicks don't toggle expand */}
                    <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                      {c.State !== "running" && (
                        <ActionBtn icon={Play} label="Start"    onClick={() => doAction(c.Id, "start")}    loading={inFlight === c.Id} color="text-[#10b981]" />)}
                      {c.State === "running" && (
                        <ActionBtn icon={Square} label="Stop"    onClick={() => doAction(c.Id, "stop")}    loading={inFlight === c.Id} color="text-yellow-400" />)}
                      <ActionBtn icon={RotateCw} label="Restart" onClick={() => doAction(c.Id, "restart")} loading={inFlight === c.Id} color="text-blue-400" />
                      <ActionBtn icon={Terminal}  label="Logs"   onClick={() => { expand(c.Id); switchTab(c.Id, "logs"); }}   loading={false} color="text-[#9ca3af]" />
                      <ActionBtn icon={BarChart3} label="Stats"   onClick={() => { expand(c.Id); switchTab(c.Id, "stats"); }} loading={false} color="text-[#9ca3af]" />
                      <ActionBtn icon={Trash2}   label="Remove"  onClick={() => doAction(c.Id, "remove")}   loading={inFlight === c.Id} danger />
                    </div>
                  </div>
                </div>

                {/* Expanded panel */}
                {expandedId === c.Id && (
                  <div className="mt-1 bg-[#0d1117] border border-[#1f2937] rounded-xl overflow-hidden">
                    <div className="flex border-b border-[#1f2937] px-4">
                      {(["logs","stats"] as const).map(tab => (
                        <button key={tab} onClick={() => switchTab(c.Id, tab)}
                          className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                            (activeTab[c.Id]||"logs") === tab
                              ? "border-[#10b981] text-[#10b981]"
                              : "border-transparent text-[#6b7280] hover:text-[#9ca3af]"
                          }`}>
                          {tab === "logs" ? <Terminal size={12}/> : <BarChart3 size={12}/>}
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="p-4 max-h-64 overflow-y-auto">
                      {(activeTab[c.Id] || "logs") === "logs" && (
                        logsLoading && !logs[c.Id]
                          ? <p className="text-[#6b7280] text-xs">Loading logs...</p>
                          : <pre className="text-[#9ca3af] text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">{logs[c.Id] || "(no logs)"}</pre>
                      )}
                      {(activeTab[c.Id] || "logs") === "stats" && (() => {
                        const s = stats[c.Id];
                        if (statsLoading && !s) return <p className="text-[#6b7280] text-xs">Loading stats...</p>;
                        if (!s) return <p className="text-[#6b7280] text-xs">Stats unavailable — container may not be running.</p>;
                        return (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <StatCard label="CPU"    value={s.cpuPct}    color={parseFloat(s.cpuPct)  > 80 ? "text-red-400"   : "text-[#10b981]"} />
                            <StatCard label="Memory" value={`${s.memUsage} (${s.memPct})`} color={parseFloat(s.memPct) > 80 ? "text-red-400" : "text-[#10b981]"} />
                            <StatCard label="Net I/O" value={s.netIO}    color="text-[#9ca3af]" />
                            <StatCard label="Block I/O" value={s.blockIO} color="text-[#9ca3af]" />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

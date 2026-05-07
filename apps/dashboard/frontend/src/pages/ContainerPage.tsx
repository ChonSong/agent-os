/**
 * Container management page — lists Docker containers, shows live CPU/memory
 * stats, and allows start/stop/restart/remove via Docker Engine API.
 */
import { useEffect, useState, useCallback } from "react";
import { Box, Play, Square, RotateCw, Trash2, Plus, RefreshCw, Activity, Wifi, Server, Cpu, HardDrive, ArrowUpDown } from "lucide-react";
import { H2 } from "@/components/NouiTypography";
import { onContainerUpdate, type ContainerUpdate } from "@/lib/socket";

interface Container {
  Id: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
}

interface ContainerStats {
  id: string;
  name: string;
  state: string;
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  pids: number;
}

function containerStateColor(state: string): string {
  switch (state?.toLowerCase()) {
    case "running": return "text-[#10b981]";
    case "exited":  return "text-[#6b7280]";
    case "paused":  return "text-yellow-400";
    default:        return "text-[#9ca3af]";
  }
}

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-[#6b7280] w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[#9ca3af] w-12 text-right shrink-0">{pct}%</span>
    </div>
  );
}

async function fetchContainers(): Promise<Container[]> {
  const res = await fetch("/api/docker/containers/json?all=true");
  if (!res.ok) return [];
  return res.json();
}

async function fetchStats(): Promise<Record<string, ContainerStats>> {
  const res = await fetch("/api/docker/stats");
  if (!res.ok) return {};
  const data = await res.json();
  return Object.fromEntries((data.stats || []).map((s: ContainerStats) => [s.name, s]));
}

async function containerAction(id: string, action: "start" | "stop" | "restart" | "remove") {
  await fetch(`/api/docker/containers/${id}/${action}`, { method: "POST" });
}

export default function ContainerPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [stats, setStats] = useState<Record<string, ContainerStats>>({});
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [connected, setConnected] = useState(false);

  const load = useCallback(async () => {
    const [conts, statsMap] = await Promise.all([fetchContainers(), fetchStats()]);
    setContainers(conts);
    setStats(statsMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh when live mode is on — subscribe to Socket.IO docker:containers
  useEffect(() => {
    if (!live) {
      setConnected(false);
      return;
    }
    const unsubscribe = onContainerUpdate((update: ContainerUpdate) => {
      setContainers(update.containers);
      setStats(update.stats);
      setLoading(false);
      setConnected(true);
    });
    return unsubscribe;
  }, [live]);

  const doAction = async (id: string, action: "start" | "stop" | "restart" | "remove") => {
    setActionInFlight(id);
    await containerAction(id, action);
    await load();
    setActionInFlight(null);
  };

  const running = containers.filter(c => c.State === "running").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#e8e6e3]">Containers</H2>
          <H2 variant="sm" className="text-[#6b7280]">
            {running} running &middot; {containers.length} total
          </H2>
        </div>
        <div className="flex items-center gap-2">
          {/* Live toggle */}
          <button
            onClick={() => setLive(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${
              live
                ? "bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30"
                : "bg-[#1f2937] text-[#9ca3af] border border-[#1f2937]"
            }`}
          >
            <Activity size={12} className={live && connected ? "animate-pulse" : ""} />
            {live ? (connected ? "Live" : "Connecting...") : "Auto-refresh"}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1f2937] text-xs text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151] transition-all"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#10b981] text-xs text-[#0a0e14] font-semibold hover:bg-[#0d9f6e] transition-all opacity-50 cursor-not-allowed" title="Coming soon">
            <Plus size={13} />
            New
          </button>
        </div>
      </div>

      {/* Stats header bar — aggregate cluster metrics */}
      {containers.length > 0 && (
        <div className="flex items-center gap-6 px-6 py-2.5 border-b border-[#1f2937] bg-[#0d1117] shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
            <Server size={12} className="text-[#10b981]" />
            <span className="font-semibold text-[#e8e6e3]">{running}</span>
            <span>running</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
            <Box size={12} className="text-[#6b7280]" />
            <span className="font-semibold text-[#e8e6e3]">{containers.length - running}</span>
            <span>stopped</span>
          </div>
          {Object.values(stats).length > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
                <Cpu size={12} className="text-[#3b82f6]" />
                <span className="font-semibold text-[#e8e6e3]">
                  {(Object.values(stats).reduce((acc, s) => acc + s.cpu_percent, 0) / Object.values(stats).length).toFixed(1)}%
                </span>
                <span>avg CPU</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
                <HardDrive size={12} className="text-[#8b5cf6]" />
                <span className="font-semibold text-[#e8e6e3]">
                  {formatBytes(Object.values(stats).reduce((acc, s) => acc + s.memory_usage, 0))}
                </span>
                <span>used</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
                <ArrowUpDown size={12} className="text-[#6b7280]" />
                <span className="font-semibold text-[#e8e6e3]">
                  {formatBytes(Object.values(stats).reduce((acc, s) => acc + s.network_rx + s.network_tx, 0))}
                </span>
                <span>network I/O</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && containers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#6b7280] text-sm">
            Loading containers...
          </div>
        ) : containers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[#6b7280]">
            <Box size={40} className="opacity-30" />
            <p className="text-sm">No containers found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {containers.map((c) => {
              const name = c.Names?.replace(/^\//, "") || c.Id.slice(0, 12);
              const s = stats[name];
              return (
                <div
                  key={c.Id}
                  className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 flex flex-col gap-3 hover:border-[#374151] transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <H2 variant="sm" className="text-[#e8e6e3] truncate">
                        {name}
                      </H2>
                      <H2 variant="sm" className="text-[#6b7280] truncate">
                        {c.Image}
                      </H2>
                    </div>
                    <span className={`text-xs font-mono font-semibold shrink-0 ${containerStateColor(c.State)}`}>
                      {c.State}
                    </span>
                  </div>

                  <H2 variant="sm" className="text-[#6b7280]">
                    {c.Status}
                  </H2>

                  {c.Ports && (
                    <H2 variant="sm" className="text-[#6b7280]">
                      Ports: {c.Ports}
                    </H2>
                  )}

                  {/* Resource stats — only for running containers */}
                  {c.State === "running" && s ? (
                    <div className="flex flex-col gap-1.5 py-2 border-t border-[#1f2937]">
                      <StatBar label="CPU" value={s.cpu_percent} max={100} color="bg-[#3b82f6]" />
                      <StatBar label="Memory" value={s.memory_percent} max={100} color="bg-[#8b5cf6]" />
                      <div className="flex items-center gap-4 text-[10px] text-[#6b7280] pt-1">
                        <span className="flex items-center gap-1">
                          <Activity size={10} />
                          {s.cpu_percent}% CPU
                        </span>
                        <span>
                          {formatBytes(s.memory_usage)} / {formatBytes(s.memory_limit)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Wifi size={10} />
                          ↓{formatBytes(s.network_rx)} ↑{formatBytes(s.network_tx)}
                        </span>
                        <span>PIDs: {s.pids}</span>
                      </div>
                    </div>
                  ) : c.State === "running" ? (
                    <div className="py-1.5 text-[10px] text-[#6b7280] border-t border-[#1f2937]">
                      Loading stats...
                    </div>
                  ) : null}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1 border-t border-[#1f2937]">
                    {c.State !== "running" && (
                      <ActionBtn icon={Play} label="Start" onClick={() => doAction(c.Id, "start")} loading={actionInFlight === c.Id} />
                    )}
                    {c.State === "running" && (
                      <ActionBtn icon={Square} label="Stop" onClick={() => doAction(c.Id, "stop")} loading={actionInFlight === c.Id} />
                    )}
                    <ActionBtn icon={RotateCw} label="Restart" onClick={() => doAction(c.Id, "restart")} loading={actionInFlight === c.Id} />
                    <ActionBtn icon={Trash2} label="Remove" onClick={() => doAction(c.Id, "remove")} loading={actionInFlight === c.Id} danger />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, loading, danger
}: {
  icon: React.ElementType; label: string; onClick: () => void;
  loading: boolean; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] transition-all ${
        danger
          ? "text-red-400 hover:bg-red-400/10"
          : "text-[#9ca3af] hover:text-[#e8e6e3] hover:bg-[#374151]"
      } disabled:opacity-30`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

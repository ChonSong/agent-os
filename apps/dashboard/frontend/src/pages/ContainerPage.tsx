/**
 * Container management page — redesigned as a proper Bento dashboard.
 * Shows aggregate cluster metrics in a card grid, then container cards below.
 */
import { useEffect, useState, useCallback } from "react";
import { Box, Play, Square, RotateCw, Trash2, Plus, RefreshCw, Activity, Wifi, Server, Cpu, HardDrive, ArrowUpDown, Zap, Circle } from "lucide-react";
import { H2 } from "@/components/NouiTypography";
import { onContainerUpdate, type ContainerUpdate } from "@/lib/socket";

interface Container {
  Id: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string | Record<string, unknown>[] | null;
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

function formatBytes(n: number): string {
  if (n === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${(n / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function containerStateBadge(state: string): { label: string; cls: string } {
  switch (state?.toLowerCase()) {
    case "running": return { label: "Running", cls: "bg-[#16A34A]/10 text-[#16A34A] border-[#16A34A]/20" };
    case "exited":  return { label: "Stopped", cls: "bg-[#6B7280]/10 text-[#6B7280] border-[#6B7280]/20" };
    case "paused":  return { label: "Paused", cls: "bg-[#D97706]/10 text-[#D97706] border-[#D97706]/20" };
    default:        return { label: state || "Unknown", cls: "bg-[#9CA3AF]/10 text-[#9CA3AF] border-[#9CA3AF]/20" };
  }
}

function MetricCard({ icon: Icon, label, value, sub, accent, span = "" }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; accent?: string; span?: string;
}) {
  return (
    <div className={`bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 flex flex-col gap-3 ${span}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#6B7280] uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent || "bg-[#FAD4C0]/20"}`}>
          <Icon size={16} className={accent ? "" : "text-[#D97706]"} style={accent ? { color: accent } : {}} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-[#111827] tracking-tight">{value}</span>
        {sub && <span className="text-sm text-[#9CA3AF] mb-1">{sub}</span>}
      </div>
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

  useEffect(() => {
    if (!live) { setConnected(false); return; }
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

  const running = containers.filter(c => c.State === "running");
  const stopped = containers.filter(c => c.State !== "running");
  const totalStats = Object.values(stats);
  const avgCpu = totalStats.length > 0 ? (totalStats.reduce((a, s) => a + s.cpu_percent, 0) / totalStats.length).toFixed(1) : "—";
  const totalMem = formatBytes(totalStats.reduce((a, s) => a + s.memory_usage, 0));
  const totalNet = formatBytes(totalStats.reduce((a, s) => a + s.network_rx + s.network_tx, 0));
  const healthy = running.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0E6D8] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#111827]">Dashboard</H2>
          <H2 variant="sm" className="text-[#6B7280]">agent-os container cluster</H2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLive(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              live
                ? "bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20"
                : "bg-[#FFF5E6] text-[#9CA3AF] border border-[#F0E6D8] hover:border-[#D4C8B8]"
            }`}
          >
            <Activity size={12} className={live && connected ? "animate-pulse" : ""} />
            {live ? (connected ? "Live" : "Connecting...") : "Auto-refresh"}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FFF5E6] text-xs text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F0E6D8] transition-all border border-[#F0E6D8]"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main content — scrollable */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Bento grid — metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={Server}
            label="Running"
            value={running.length}
            sub="containers"
            accent="#16A34A"
          />
          <MetricCard
            icon={Circle}
            label="Stopped"
            value={stopped.length}
            sub="containers"
            accent="#9CA3AF"
          />
          <MetricCard
            icon={Cpu}
            label="Avg CPU"
            value={`${avgCpu}%`}
            sub="across running"
            accent="#2563EB"
          />
          <MetricCard
            icon={HardDrive}
            label="Memory"
            value={totalMem}
            sub="used total"
            accent="#7C3AED"
          />
        </div>

        {/* Network I/O + healthy status row */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <MetricCard
            icon={Zap}
            label="Network I/O"
            value={totalNet}
            sub="total throughput"
            accent="#D97706"
          />
          <MetricCard
            icon={Activity}
            label="Total Containers"
            value={containers.length}
            sub={`${healthy} healthy`}
            accent="#FAD4C0"
          />
          <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#6B7280] uppercase tracking-wider">Health Status</span>
              <div className="w-8 h-8 rounded-xl bg-[#16A34A]/10 flex items-center justify-center">
                <Circle size={16} className="text-[#16A34A]" />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-[#16A34A] tracking-tight">
                {healthy}/{containers.length}
              </span>
              <span className="text-sm text-[#9CA3AF] mb-1">healthy</span>
            </div>
          </div>
        </div>

        {/* Section header */}
        <div className="flex items-center gap-3 mb-4">
          <H2 variant="sm" className="text-[#111827]">All Containers</H2>
          <div className="flex-1 h-px bg-[#F0E6D8]" />
        </div>

        {/* Container cards grid */}
        {loading && containers.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-[#6B7280] text-sm">
            Loading containers...
          </div>
        ) : containers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-[#6B7280]">
            <Box size={40} className="opacity-30" />
            <p className="text-sm">No containers found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {containers.map((c) => {
              const name = c.Names?.replace(/^\//, "") || c.Id.slice(0, 12);
              const s = stats[name];
              const badge = containerStateBadge(c.State);
              return (
                <div
                  key={c.Id}
                  className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-4 flex flex-col gap-3 hover:border-[#D4C8B8] transition-all group"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <H2 variant="sm" className="text-[#111827] truncate font-semibold">
                          {name}
                        </H2>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${badge.cls}`}>
                          {c.State === "running" && <Circle size={6} className="fill-current" />}
                          {badge.label}
                        </span>
                      </div>
                      <H2 variant="sm" className="text-[#9CA3AF] truncate font-mono">
                        {c.Image}
                      </H2>
                    </div>
                  </div>

                  <H2 variant="sm" className="text-[#6B7280]">
                    {c.Status}
                  </H2>

                  {c.Ports && (() => {
                      const ports = typeof c.Ports === "object" ? c.Ports : JSON.parse(c.Ports || "[]");
                      if (!ports || ports.length === 0) return null;
                      return (
                        <H2 variant="sm" className="text-[#6B7280] font-mono">
                          {ports.map((p: any) =>
                            p.PublicPort
                              ? `${p.PublicPort}:${p.PrivatePort}/${p.Type}`
                              : `${p.PrivatePort}/${p.Type}`
                          ).join(", ")}
                        </H2>
                      );
                    })()}

                  {/* Resource stats */}
                  {c.State === "running" && s ? (
                    <div className="flex flex-col gap-2 py-2 border-t border-[#F0E6D8]">
                      {/* Mini bar row */}
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-[#6B7280] w-12 shrink-0">CPU</span>
                        <div className="flex-1 h-1.5 bg-[#FFF5E6] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#2563EB]/70" style={{ width: `${Math.min(100, s.cpu_percent)}%` }} />
                        </div>
                        <span className="text-[10px] text-[#9CA3AF] w-10 text-right shrink-0">{s.cpu_percent.toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-[#6B7280] w-12 shrink-0">Memory</span>
                        <div className="flex-1 h-1.5 bg-[#FFF5E6] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#7C3AED]/70" style={{ width: `${Math.min(100, s.memory_percent)}%` }} />
                        </div>
                        <span className="text-[10px] text-[#9CA3AF] w-10 text-right shrink-0">{s.memory_percent.toFixed(1)}%</span>
                      </div>
                      {/* I/O stats row */}
                      <div className="flex items-center gap-4 text-[10px] text-[#9CA3AF]">
                        <span className="flex items-center gap-1">
                          <Wifi size={9} />
                          ↓{formatBytes(s.network_rx)}
                        </span>
                        <span>↑{formatBytes(s.network_tx)}</span>
                        <span>PIDs: {s.pids}</span>
                        <span className="ml-auto font-mono text-[#111827]">{formatBytes(s.memory_usage)}</span>
                      </div>
                    </div>
                  ) : c.State === "running" ? (
                    <div className="py-2 text-[10px] text-[#9CA3AF] border-t border-[#F0E6D8]">
                      Loading stats...
                    </div>
                  ) : null}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-[#F0E6D8]">
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
      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-medium transition-all ${
        danger
          ? "text-[#DC2626] hover:bg-[#DC2626]/10"
          : "text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F0E6D8]"
      } disabled:opacity-30`}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}

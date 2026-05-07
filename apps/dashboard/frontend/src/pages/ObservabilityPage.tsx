/**
 * Observability — real-time agent metrics, session history, and event feed
 * backed by PostgreSQL via /api/analytics/real, /api/status, /api/tunnel, /api/db/health.
 */
import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Zap,
  Terminal,
  Globe,
} from "lucide-react";
import { H2 } from "@/components/NouiTypography";
import { api } from "@/lib/api";
import type { DockerContainerStats } from "@/lib/api";
import { onRealtimeEvent, onCronUpdate } from "@/lib/socket";

// ── Types ────────────────────────────────────────────────────────────────────

interface TunnelInfo {
  tunnel_id: string;
  url: string;
  connected: boolean | null;
}

interface DbHealth {
  ok: boolean;
  source: string;
}

interface SessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
}

interface EventBreakdownRow {
  type: string;
  count: string;
  first_seen: string;
  last_seen: string;
}

interface AnalyticsData {
  sessions: SessionRow[];
  event_breakdown: EventBreakdownRow[];
  source: string;
}

interface StatusData {
  gateway_running: boolean;
  gateway_health_url: string | null;
  active_sessions: number;
  version: string;
}

interface DockerInfo {
  ContainersRunning: number;
  ContainersPaused: number;
  ContainersStopped: number;
  Images: number;
  NCPU: number;
  MemTotal: number;
  OperatingSystem: string;
  KernelVersion: string;
  ServerVersion: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "text-[#10b981]",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[#6b7280] font-medium">
          {label}
        </span>
        <Icon className={`w-3.5 h-3.5 ${accent}`} />
      </div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#4b5563]">{sub}</div>}
    </div>
  );
}

function StatusBadge({
  ok,
  label,
}: {
  ok: boolean | null;
  label: string;
}) {
  if (ok === null)
    return (
      <span className="flex items-center gap-1 text-[10px] text-[#6b7280]">
        <Clock className="w-3 h-3" /> {label}: unknown
      </span>
    );
  return (
    <span
      className={`flex items-center gap-1 text-[10px] font-medium ${
        ok ? "text-[#10b981]" : "text-[#ef4444]"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {label}
    </span>
  );
}

function EventBar({
  type,
  count,
  max,
}: {
  type: string;
  count: number;
  max: number;
}) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  const color =
    type === "tool_call"
      ? "bg-[#3b82f6]"
      : type === "task_complete"
      ? "bg-[#10b981]"
      : type === "delegation"
      ? "bg-[#a855f7]"
      : type === "drift"
      ? "bg-[#f59e0b]"
      : "bg-[#6b7280]";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#9ca3af] w-28 shrink-0 truncate font-mono">
        {type}
      </span>
      <div className="flex-1 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-[#6b7280] w-8 text-right">{count}</span>
    </div>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [tunnel, setTunnel] = useState<TunnelInfo | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealth | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [containerStats, setContainerStats] = useState<DockerContainerStats[]>([]);
  // Dashboard sessions come from /api/sessions (separate from agent_sessions)
  const [dashboardSessions, setDashboardSessions] = useState<SessionRow[]>([]);
  const [recentEvents, setRecentEvents] = useState<Array<{id:string; session:string|null; type:string; ts:string; name:string|null; data:Record<string,unknown>}>>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<{role:string;content:string}[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, tunnelRes, dbRes, statusRes, sessionsRes, eventsRes, dockerRes, statsRes] = await Promise.all([
        fetch("/api/analytics/real").catch(() => null),
        fetch("/api/tunnel").catch(() => null),
        fetch("/api/db/health").catch(() => null),
        fetch("/api/status").catch(() => null),
        fetch("/api/sessions?limit=20").catch(() => null),
        fetch("/api/events/recent?limit=50").catch(() => null),
        fetch("/api/docker/info").catch(() => null),
        fetch("/api/docker/stats").catch(() => null),
      ]);
      if (analyticsRes?.ok) setAnalytics(await analyticsRes.json());
      if (tunnelRes?.ok) setTunnel(await tunnelRes.json());
      if (dbRes?.ok) setDbHealth(await dbRes.json());
      if (statusRes?.ok) setStatus(await statusRes.json());
      if (sessionsRes?.ok) {
        const data = await sessionsRes.json();
        setDashboardSessions(data.sessions ?? []);
      }
      if (eventsRes?.ok) {
        const evData = await eventsRes.json();
        setRecentEvents(Array.isArray(evData) ? evData : []);
      }
      if (dockerRes?.ok) setDockerInfo(await dockerRes.json());
      if (statsRes?.ok) {
        const statsData = await statsRes.json();
        setContainerStats(statsData.stats ?? []);
      }
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    if (selectedSession === sessionId) { setSelectedSession(null); return; }
    setSelectedSession(sessionId);
    try {
      const r = await fetch(`/api/sessions/${sessionId}/messages`);
      if (r.ok) {
        const data = await r.json();
        setSessionMessages(data.messages ?? []);
      }
    } catch { setSessionMessages([]); }
  }, [selectedSession]);

  useEffect(() => {
    load();
    // Subscribe to real-time events — prepend to live timeline (no full data refresh)
    const unsubEvent = onRealtimeEvent((ev) => {
      setRecentEvents(prev => [ev as unknown as {id:string; session:string|null; type:string; ts:string; name:string|null; data:Record<string,unknown>}, ...prev.slice(0, 49)]);
      // No load() here — we only prepend the event. Full refresh only on cron updates.
    });
    // Cron changes affect job counts — refresh on those
    const unsubCron = onCronUpdate(() => load());
    return () => { unsubEvent(); unsubCron(); };
  }, [load]);

  const totalEvents =
    analytics?.event_breakdown.reduce((s, r) => s + parseInt(r.count || "0"), 0) ?? 0;
  const maxEvents =
    Math.max(
      ...(analytics?.event_breakdown.map((r) => parseInt(r.count || "0")) ?? [1]),
      1
    );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#e8e6e3]">
            Observability
          </H2>
          <H2 variant="sm" className="text-[#6b7280]">
            Agent metrics & event feed — backed by PostgreSQL
          </H2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-[#4b5563]">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f2937] hover:bg-[#374151] border border-[#1f2937] hover:border-[#4b5563] rounded-lg text-[10px] text-[#9ca3af] transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 space-y-5">
          {/* ── Top-level status row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard
              label="Gateway"
              value={status?.gateway_running ? "Online" : "Offline"}
              icon={Globe}
              accent={status?.gateway_running ? "text-[#10b981]" : "text-[#ef4444]"}
            />
            <MetricCard
              label="Sessions"
              value={analytics?.sessions?.length ?? "—"}
              sub={`${dashboardSessions.reduce((a, s) => a + (s.message_count ?? 0), 0)} messages`}
              icon={Activity}
              accent="text-[#3b82f6]"
            />
            <MetricCard
              label="Total Events"
              value={totalEvents}
              sub="last 7 days"
              icon={Zap}
              accent="text-[#a855f7]"
            />
            <MetricCard
              label="DB Source"
              value={dbHealth ? "PostgreSQL" : "Mock"}
              icon={CheckCircle2}
              accent={dbHealth ? "text-[#10b981]" : "text-[#f59e0b]"}
            />
          </div>

          {/* ── Docker system row ── */}
          {dockerInfo && (
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px]">
              <span className="text-[#4b5563] uppercase tracking-wider font-medium mr-1 shrink-0">
                Docker
              </span>
              <span className="text-[#9ca3af]">
                <span className="text-[#10b981] font-semibold">{dockerInfo.ContainersRunning}</span> running
              </span>
              <span className="text-[#6b7280]">/</span>
              <span className="text-[#9ca3af]">
                <span className="text-[#6b7280]">{dockerInfo.ContainersPaused}</span> paused
              </span>
              <span className="text-[#6b7280]">/</span>
              <span className="text-[#9ca3af]">
                <span className="text-[#6b7280]">{dockerInfo.ContainersStopped}</span> stopped
              </span>
              <span className="text-[#6b7280] mx-1">·</span>
              <span className="text-[#9ca3af]">
                <span className="font-semibold text-[#e8e6e3]">{dockerInfo.NCPU}</span> CPUs
              </span>
              <span className="text-[#6b7280] mx-1">·</span>
              <span className="text-[#9ca3af]">
                <span className="font-semibold text-[#e8e6e3]">{(dockerInfo.MemTotal / 1024**3).toFixed(1)} GB</span> RAM
              </span>
              <span className="text-[#6b7280] mx-1">·</span>
              <span className="text-[#9ca3af]">
                <span className="font-semibold text-[#e8e6e3]">{dockerInfo.Images}</span> images
              </span>
              <span className="text-[#6b7280] mx-1">·</span>
              <span className="text-[#9ca3af]">
                {dockerInfo.OperatingSystem} · {dockerInfo.KernelVersion}
              </span>
              <span className="text-[#4b5563] ml-auto shrink-0">
                Docker {dockerInfo.ServerVersion}
              </span>
            </div>
          )}

          {/* ── Container resource metrics ── */}
          {containerStats.length > 0 && (
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-[#3b82f6]" />
                <span className="text-[11px] font-semibold text-[#e8e6e3]">
                  Container Resources
                </span>
                <span className="text-[10px] text-[#4b5563] ml-auto">
                  source: {containerStats[0] ? 'dockerode live' : '—'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-[#4b5563] uppercase tracking-wider border-b border-[#1f2937]">
                      <th className="text-left pb-2 pr-4 font-medium">Container</th>
                      <th className="text-center pb-2 px-2 font-medium w-16">State</th>
                      <th className="text-right pb-2 px-2 font-medium w-16">CPU %</th>
                      <th className="text-right pb-2 px-2 font-medium w-16">Mem %</th>
                      <th className="text-right pb-2 px-2 font-medium w-20">Memory</th>
                      <th className="text-right pb-2 px-2 font-medium w-16">PIDs</th>
                      <th className="text-right pb-2 pl-2 font-medium w-20">Net I/O</th>
                    </tr>
                  </thead>
                  <tbody>
                    {containerStats.map((c) => {
                      const cpu = parseFloat(c.cpu_percent);
                      const mem = parseFloat(c.memory_percent);
                      const memUsed = (c.memory_usage / 1024 / 1024).toFixed(0);
                      const memLim = (c.memory_limit / 1024 / 1024).toFixed(0);
                      const netRx = c.network_rx > 1024 * 1024
                        ? `${(c.network_rx / 1024 / 1024).toFixed(1)} MB`
                        : `${(c.network_rx / 1024).toFixed(0)} KB`;
                      const netTx = c.network_tx > 1024 * 1024
                        ? `${(c.network_tx / 1024 / 1024).toFixed(1)} MB`
                        : `${(c.network_tx / 1024).toFixed(0)} KB`;
                      const stateColor = c.state === 'running' ? 'text-[#10b981]'
                        : c.state === 'paused' ? 'text-[#f59e0b]' : 'text-[#6b7280]';
                      const cpuColor = cpu > 80 ? 'text-[#ef4444]' : cpu > 50 ? 'text-[#f59e0b]' : 'text-[#9ca3af]';
                      const memColor = mem > 80 ? 'text-[#ef4444]' : mem > 50 ? 'text-[#f59e0b]' : 'text-[#9ca3af]';
                      const shortName = c.name.replace('/agent-os-', '');
                      return (
                        <tr key={c.id} className="border-b border-[#1f2937]/50 last:border-0 hover:bg-[#1f2937]/30">
                          <td className="py-1.5 pr-4 text-[#e8e6e3] font-mono font-medium">{shortName}</td>
                          <td className={`py-1.5 px-2 text-center font-medium ${stateColor}`}>{c.state}</td>
                          <td className={`py-1.5 px-2 text-right font-mono font-medium ${cpuColor}`}>{c.cpu_percent}%</td>
                          <td className={`py-1.5 px-2 text-right font-mono font-medium ${memColor}`}>{c.memory_percent}%</td>
                          <td className="py-1.5 px-2 text-right text-[#9ca3af] font-mono">{memUsed}/{memLim} MB</td>
                          <td className="py-1.5 px-2 text-right text-[#9ca3af] font-mono">{c.pids}</td>
                          <td className="py-1.5 pl-2 text-right text-[#9ca3af] font-mono">{netRx}/{netTx}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── System status row ── */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px]">
            <span className="text-[#4b5563] uppercase tracking-wider font-medium mr-1">
              System
            </span>
            <StatusBadge ok={status?.gateway_running ?? null} label="Gateway" />
            <StatusBadge ok={dbHealth?.ok ?? null} label="PostgreSQL" />
            <StatusBadge
              ok={
                tunnel
                  ? tunnel.connected === null
                    ? null
                    : tunnel.connected
                  : null
              }
              label={`Tunnel: ${tunnel?.url ?? "loading..."}`}
            />
            <span className="ml-auto text-[#4b5563]">
              v{status?.version ?? "—"}
            </span>
          </div>

          {/* ── Event breakdown ── */}
          {analytics && analytics.event_breakdown.length > 0 && (
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Terminal className="w-4 h-4 text-[#a855f7]" />
                <span className="text-[11px] font-semibold text-[#e8e6e3]">
                  Event Breakdown
                </span>
                <span className="text-[10px] text-[#4b5563] ml-1">
                  — {analytics.source}
                </span>
              </div>
              <div className="space-y-2">
                {analytics.event_breakdown.map((row) => (
                  <EventBar
                    key={row.type}
                    type={row.type}
                    count={parseInt(row.count || "0")}
                    max={maxEvents}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Live event timeline ── */}
          {recentEvents.length > 0 && (
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-[#f59e0b]" />
                <span className="text-[11px] font-semibold text-[#e8e6e3]">
                  Live Event Timeline
                </span>
                <span className="text-[10px] text-[#4b5563]">— {recentEvents.length} most recent</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {recentEvents.map((ev) => {
                  const color =
                    ev.type === 'task_complete' ? 'text-[#10b981]' :
                    ev.type === 'tool_call'    ? 'text-[#3b82f6]' :
                    ev.type === 'container_state_change' ? 'text-[#6b7280]' :
                    'text-[#9ca3af]';
                  const label =
                    ev.type === 'container_state_change' && ev.name
                      ? `${ev.name} ${ev.data?.state ?? ''}`.trim()
                      : ev.type;
                  return (
                    <div key={ev.id} className="flex items-start gap-2 text-[10px]">
                      <span className="text-[#4b5563] shrink-0 w-36">
                        {formatAge(ev.ts)}
                      </span>
                      <span className={`shrink-0 font-mono ${color}`}>
                        {ev.type}
                      </span>
                      <span className="text-[#6b7280] truncate">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Session history ── */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-[#3b82f6]" />
              <span className="text-[11px] font-semibold text-[#e8e6e3]">
                Recent Sessions
              </span>
            </div>

            {!dashboardSessions || dashboardSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="w-8 h-8 text-[#374151] mb-2" />
                <p className="text-[11px] text-[#6b7280]">
                  No sessions yet — start chatting with the agent
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-[#4b5563] border-b border-[#1f2937]">
                      <th className="text-left pb-2 font-medium uppercase tracking-wider">
                        Title
                      </th>
                      <th className="text-right pb-2 font-medium uppercase tracking-wider">
                        Messages
                      </th>
                      <th className="text-right pb-2 font-medium uppercase tracking-wider">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {dashboardSessions.map((session) => (
                      <tr
                        key={session.id}
                        className="hover:bg-[#1f2937]/50 transition-colors cursor-pointer"
                        onClick={() => loadSessionMessages(session.id)}
                      >
                        <td className="py-2 text-[#9ca3af] truncate max-w-[240px]">
                          {session.title || "New conversation"}
                        </td>
                        <td className="py-2 text-right text-[#6b7280]">
                          {session.message_count ?? "—"}
                        </td>
                        <td className="py-2 text-right text-[#6b7280]">
                          {formatAge(session.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Session message detail (click a row) ── */}
          {selectedSession && (
            <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-[#e8e6e3]">
                  Session: {dashboardSessions.find(s => s.id === selectedSession)?.title ?? selectedSession}
                </span>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="text-[10px] text-[#6b7280] hover:text-[#9ca3af] transition-colors"
                >
                  Close
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sessionMessages.length === 0 ? (
                  <p className="text-[10px] text-[#4b5563]">No messages</p>
                ) : sessionMessages.map((msg, i) => (
                  <div key={i} className="flex gap-2 text-[10px]">
                    <span className={`shrink-0 font-medium ${msg.role === 'user' ? 'text-[#10b981]' : msg.role === 'assistant' ? 'text-[#3b82f6]' : 'text-[#6b7280]'}`}>
                      {msg.role}:
                    </span>
                    <span className="text-[#9ca3af]">{String(msg.content ?? '').slice(0, 200)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Event timeline ── */}
          {analytics &&
            analytics.event_breakdown.length > 0 &&
            analytics.event_breakdown.map((row) => (
              <div
                key={row.type}
                className="bg-[#111827] border border-[#1f2937] rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-[#e8e6e3] font-mono">
                    {row.type}
                  </span>
                  <span className="text-[10px] text-[#6b7280]">
                    {formatAge(row.first_seen)} → {formatAge(row.last_seen)}
                  </span>
                </div>
                <div className="text-[10px] text-[#4b5563]">
                  {row.count} events · first seen{" "}
                  {new Date(row.first_seen).toLocaleString()} · last seen{" "}
                  {new Date(row.last_seen).toLocaleString()}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

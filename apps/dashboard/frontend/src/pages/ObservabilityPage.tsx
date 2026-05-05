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
  session_key: string;
  created_at: string;
  message_count: string;
  total_chars: string;
  metadata: Record<string, unknown>;
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
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, tunnelRes, dbRes, statusRes] = await Promise.all([
        fetch("/api/analytics/real").catch(() => null),
        fetch("/api/tunnel").catch(() => null),
        fetch("/api/db/health").catch(() => null),
        fetch("/api/status").catch(() => null),
      ]);
      if (analyticsRes?.ok) setAnalytics(await analyticsRes.json());
      if (tunnelRes?.ok) setTunnel(await tunnelRes.json());
      if (dbRes?.ok) setDbHealth(await dbRes.json());
      if (statusRes?.ok) setStatus(await statusRes.json());
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000); // poll every 30s
    return () => clearInterval(id);
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
              sub={`${status?.active_sessions ?? 0} active`}
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

          {/* ── Session history ── */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-[#3b82f6]" />
              <span className="text-[11px] font-semibold text-[#e8e6e3]">
                Recent Sessions
              </span>
            </div>

            {!analytics || analytics.sessions.length === 0 ? (
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
                        Session
                      </th>
                      <th className="text-right pb-2 font-medium uppercase tracking-wider">
                        Messages
                      </th>
                      <th className="text-right pb-2 font-medium uppercase tracking-wider">
                        Chars
                      </th>
                      <th className="text-right pb-2 font-medium uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {analytics.sessions.map((session) => (
                      <tr
                        key={session.id}
                        className="hover:bg-[#1f2937]/50 transition-colors"
                      >
                        <td className="py-2 font-mono text-[#9ca3af] truncate max-w-[200px]">
                          {session.session_key}
                        </td>
                        <td className="py-2 text-right text-[#6b7280]">
                          {session.message_count}
                        </td>
                        <td className="py-2 text-right text-[#6b7280]">
                          {parseInt(session.total_chars || "0").toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-[#6b7280]">
                          {formatAge(session.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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

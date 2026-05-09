/**
 * DashboardPage — Aggregated metrics overview with KPI cards, session activity,
 * model mix, and quick access to system health.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  MessageSquare,
  Cpu,
  HardDrive,
  Clock,
  Zap,
  Brain,
  Activity,
  TrendingUp,
  Server,
  RefreshCw,
} from 'lucide-react';
import { H2 } from '@/components/NouiTypography';
import { api } from '@/lib/api';
import { io, type Socket } from 'socket.io-client';

interface AnalyticsData {
  sessions: Array<{
    id: string;
    session_key: string;
    created_at: string;
    message_count: number;
    total_chars: number;
  }>;
  event_breakdown: Array<{
    type: string;
    count: number;
  }>;
}

interface UsageData {
  total_sessions: number;
  total_messages: number;
  total_tokens: number;
  avg_tokens_per_session: number;
  sessions_last_7d: number;
}

interface StatusData {
  gateway_running?: boolean;
  version?: string;
  uptime?: number;
}

interface KPI {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
  color: string;
}

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [containerStats, setContainerStats] = useState<Record<string, any>>({});
  const [containers, setContainers] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, usageRes, statusRes] = await Promise.allSettled([
        fetch('/api/analytics/real').then(r => r.json()),
        api.getAnalytics(7),
        api.getStatus(),
      ]);

      if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value);
      if (usageRes.status === 'fulfilled') setUsage(usageRes.value);
      if (statusRes.status === 'fulfilled') setStatus(statusRes.value);
    } catch { /* handled by Promise.allSettled */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();

    // Connect to Socket.IO for real-time container stats
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = io(`${protocol}//${window.location.host}`);

    socket.on('docker:containers', (data: { containers: any[]; stats: Record<string, any> }) => {
      setContainers(data.containers || []);
      setContainerStats(data.stats || {});
    });

    return () => { socket.disconnect(); };
  }, [loadData]);

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const kpis: KPI[] = [
    {
      label: 'Total Sessions',
      value: usage?.total_sessions ?? analytics?.sessions?.length ?? '—',
      icon: MessageSquare,
      trend: usage?.sessions_last_7d ? `${usage.sessions_last_7d} this week` : undefined,
      color: 'bg-blue-500/10 text-blue-400',
    },
    {
      label: 'Total Messages',
      value: usage?.total_messages ?? '—',
      icon: Brain,
      color: 'bg-purple-500/10 text-purple-400',
    },
    {
      label: 'Total Tokens',
      value: usage?.total_tokens ? formatTokens(usage.total_tokens) : '—',
      icon: Zap,
      trend: usage?.avg_tokens_per_session ? `~${formatTokens(usage.avg_tokens_per_session)}/session` : undefined,
      color: 'bg-amber-500/10 text-amber-400',
    },
    {
      label: 'Uptime',
      value: formatUptime((status as any)?.started_at ? Math.floor((Date.now() - (status as any).started_at * 1000) / 1000) : undefined),
      icon: Clock,
      color: 'bg-green-500/10 text-green-400',
    },
    {
      label: 'Containers',
      value: containers.length,
      icon: Server,
      trend: `${containers.filter(c => c.State === 'running').length} running`,
      color: 'bg-cyan-500/10 text-cyan-400',
    },
    {
      label: 'Events (7d)',
      value: analytics?.event_breakdown?.reduce((sum, e) => sum + e.count, 0) ?? '—',
      icon: Activity,
      color: 'bg-rose-500/10 text-rose-400',
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5" />
          <H2 variant="xl">Dashboard</H2>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="bento-card p-4 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#6B7280]">
                  {kpi.label}
                </span>
                <div className={`p-1.5 rounded-lg ${kpi.color}`}>
                  <kpi.icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <span className="stat-value text-xl">{kpi.value}</span>
              {kpi.trend && (
                <span className="text-[11px] text-[#9CA3AF]">{kpi.trend}</span>
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Container Status */}
          <div className="bento-card p-5">
            <div className="flex items-center gap-2 pb-3">
              <Server className="w-4 h-4 text-[#6B7280]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#6B7280]">
                Containers
              </span>
            </div>
            <div className="space-y-2">
              {containers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                containers.map((c) => {
                  const name = (c.Names?.[0] || '').replace(/^\//, '');
                  const stats = containerStats[name];
                  return (
                    <div key={c.Id} className="flex items-center justify-between py-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${c.State === 'running' ? 'bg-green-400' : 'bg-gray-400'}`} />
                        <span className="font-mono text-xs">{name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[#9CA3AF]">
                        {stats && (
                          <>
                            <span>CPU {stats.cpu_percent}%</span>
                            <span>MEM {stats.memory_percent}%</span>
                          </>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          c.State === 'running' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                        }`}>
                          {c.State}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Event Breakdown */}
          <div className="bento-card p-5">
            <div className="flex items-center gap-2 pb-3">
              <Activity className="w-4 h-4 text-[#6B7280]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#6B7280]">
                Events (7 days)
              </span>
            </div>
            <div className="space-y-2">
              {!analytics?.event_breakdown?.length ? (
                <p className="text-sm text-muted-foreground">No events recorded</p>
              ) : (
                analytics.event_breakdown.slice(0, 8).map((event) => (
                  <div key={event.type} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="font-mono text-xs">{event.type}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#F0E6D8] text-[11px] font-medium">
                      {event.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="bento-card p-5 lg:col-span-2">
            <div className="flex items-center gap-2 pb-3">
              <MessageSquare className="w-4 h-4 text-[#6B7280]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#6B7280]">
                Recent Sessions
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Session</th>
                    <th className="text-left py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Created</th>
                    <th className="text-right py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Messages</th>
                    <th className="text-right py-2 text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">Chars</th>
                  </tr>
                </thead>
                <tbody>
                  {!analytics?.sessions?.length ? (
                    <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No sessions</td></tr>
                  ) : (
                    analytics.sessions.slice(0, 10).map((s) => (
                      <tr key={s.id} className="border-b last:border-b-0 hover:bg-[#FFF5E6]">
                        <td className="py-2 font-mono text-xs truncate max-w-[300px]">{s.session_key}</td>
                        <td className="py-2 text-xs text-[#9CA3AF]">
                          {new Date(s.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-right text-xs">{s.message_count}</td>
                        <td className="py-2 text-right text-xs">{s.total_chars > 1000 ? `${(s.total_chars / 1000).toFixed(1)}K` : s.total_chars}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

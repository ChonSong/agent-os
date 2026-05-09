import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { BarChart3, Brain, Cpu, RefreshCw, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type {
  AnalyticsResponse,
  AnalyticsDailyEntry,
  AnalyticsModelEntry,
  AnalyticsSkillEntry,
} from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Stats } from "@nous-research/ui/ui/components/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useI18n } from "@/i18n";
import { PluginSlot } from "@/plugins";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

const CHART_HEIGHT_PX = 160;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(day: string): string {
  // day may be "2026-05-01" (date-only) or an ISO timestamp
  try {
    // If day looks like a date-only string, append T00:00:00
    const d = /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? new Date(day + "T00:00:00")
      : new Date(day);
    if (Number.isNaN(d.getTime())) return day;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return day;
  }
}

function TokenBarChart({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const { t } = useI18n();
  if (daily.length === 0) return null;

  const maxTokens = Math.max(
    ...daily.map((d) => d.input_tokens + d.output_tokens),
    1,
  );

  return (
    <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm hover:shadow-bento-md transition-shadow">
      <div className="flex flex-col gap-3 pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <span className="text-base font-semibold">
            {t.analytics.dailyTokenUsage}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 bg-[#ffe6cb]" />
            {t.analytics.input}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 bg-emerald-500" />
            {t.analytics.output}
          </div>
        </div>
      </div>
      <div>
        <div
          className="flex items-end gap-[2px]"
          style={{ height: CHART_HEIGHT_PX }}
        >
          {daily.map((d) => {
            const total = d.input_tokens + d.output_tokens;
            const inputH = Math.round(
              (d.input_tokens / maxTokens) * CHART_HEIGHT_PX,
            );
            const outputH = Math.round(
              (d.output_tokens / maxTokens) * CHART_HEIGHT_PX,
            );
            return (
              <div
                key={d.day}
                className="flex-1 min-w-0 group relative flex flex-col justify-end"
                style={{ height: CHART_HEIGHT_PX }}
              >
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 pointer-events-none">
                  <div className="bg-card border border-border px-2.5 py-1.5 text-[10px] text-foreground shadow-lg whitespace-nowrap">
                    <div className="font-medium">{formatDate(d.day)}</div>
                    <div>
                      {t.analytics.input}: {formatTokens(d.input_tokens)}
                    </div>
                    <div>
                      {t.analytics.output}: {formatTokens(d.output_tokens)}
                    </div>
                    <div>
                      {t.analytics.total}: {formatTokens(total)}
                    </div>
                  </div>
                </div>

                <div
                  className="w-full bg-[#ffe6cb]/70"
                  style={{ height: Math.max(inputH, total > 0 ? 1 : 0) }}
                />

                <div
                  className="w-full bg-emerald-500/70"
                  style={{
                    height: Math.max(outputH, d.output_tokens > 0 ? 1 : 0),
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
          <span>{daily.length > 0 ? formatDate(daily[0].day) : ""}</span>
          {daily.length > 2 && (
            <span>{formatDate(daily[Math.floor(daily.length / 2)].day)}</span>
          )}
          <span>
            {daily.length > 1 ? formatDate(daily[daily.length - 1].day) : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function DailyTable({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const { t } = useI18n();
  if (daily.length === 0) return null;

  const sorted = [...daily].reverse();

  return (
    <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm hover:shadow-bento-md transition-shadow">
      <div className="flex items-center gap-2 pb-3">
        <TrendingUp className="h-5 w-5 text-muted-foreground" />
        <span className="text-base font-semibold">
          {t.analytics.dailyBreakdown}
        </span>
      </div>
      <div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 pr-4 font-medium">
                  {t.analytics.date}
                </th>
                <th className="text-right py-2 px-4 font-medium">
                  {t.sessions.title}
                </th>
                <th className="text-right py-2 px-4 font-medium">
                  {t.analytics.input}
                </th>
                <th className="text-right py-2 pl-4 font-medium">
                  {t.analytics.output}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => {
                return (
                  <tr
                    key={d.day}
                    className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                  >
                    <td className="py-2 pr-4 font-medium">
                      {formatDate(d.day)}
                    </td>
                    <td className="text-right py-2 px-4 text-muted-foreground">
                      {d.sessions}
                    </td>
                    <td className="text-right py-2 px-4">
                      <span className="text-[#ffe6cb]">
                        {formatTokens(d.input_tokens)}
                      </span>
                    </td>
                    <td className="text-right py-2 pl-4">
                      <span className="text-emerald-400">
                        {formatTokens(d.output_tokens)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ModelTable({ models }: { models: AnalyticsModelEntry[] }) {
  const { t } = useI18n();
  if (models.length === 0) return null;

  const sorted = [...models].sort(
    (a, b) =>
      b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens),
  );

  return (
    <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm hover:shadow-bento-md transition-shadow">
      <div className="flex items-center gap-2 pb-3">
        <Cpu className="h-5 w-5 text-muted-foreground" />
        <span className="text-base font-semibold">
          {t.analytics.perModelBreakdown}
        </span>
      </div>
      <div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 pr-4 font-medium">
                  {t.analytics.model}
                </th>
                <th className="text-right py-2 px-4 font-medium">
                  {t.sessions.title}
                </th>
                <th className="text-right py-2 pl-4 font-medium">
                  {t.analytics.tokens}
                </th>
                <th className="text-right py-2 pl-4 font-medium">
                  Est. Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr
                  key={m.model}
                  className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                >
                  <td className="py-2 pr-4">
                    <span className="font-mono-ui text-xs">{m.model}</span>
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">
                    {m.sessions}
                  </td>
                  <td className="text-right py-2 pl-4">
                    <span className="text-[#ffe6cb]">
                      {formatTokens(m.input_tokens)}
                    </span>
                    {" / "}
                    <span className="text-emerald-400">
                      {formatTokens(m.output_tokens)}
                    </span>
                  </td>
                  <td className="text-right py-2 pl-4 text-[#10b981] font-mono-ui text-xs">
                    {m.estimated_cost != null ? `$${Number(m.estimated_cost).toFixed(4)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SkillTable({ skills }: { skills: AnalyticsSkillEntry[] }) {
  const { t } = useI18n();
  if (skills.length === 0) return null;

  return (
    <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm hover:shadow-bento-md transition-shadow">
      <div className="flex items-center gap-2 pb-3">
        <Brain className="h-5 w-5 text-muted-foreground" />
        <span className="text-base font-semibold">{t.analytics.topSkills}</span>
      </div>
      <div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 pr-4 font-medium">
                  {t.analytics.skill}
                </th>
                <th className="text-right py-2 px-4 font-medium">
                  {t.analytics.loads}
                </th>
                <th className="text-right py-2 px-4 font-medium">
                  {t.analytics.edits}
                </th>
                <th className="text-right py-2 px-4 font-medium">
                  {t.analytics.total}
                </th>
                <th className="text-right py-2 pl-4 font-medium">
                  {t.analytics.lastUsed}
                </th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <tr
                  key={skill.skill}
                  className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                >
                  <td className="py-2 pr-4">
                    <span className="font-mono-ui text-xs">{skill.skill}</span>
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">
                    {skill.view_count}
                  </td>
                  <td className="text-right py-2 px-4 text-muted-foreground">
                    {skill.manage_count}
                  </td>
                  <td className="text-right py-2 px-4">{skill.total_count}</td>
                  <td className="text-right py-2 pl-4 text-muted-foreground">
                    {skill.last_used_at ? timeAgo(skill.last_used_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  const { setAfterTitle, setEnd } = usePageHeader();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getAnalytics(days)
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [days]);

  useLayoutEffect(() => {
    const periodLabel =
      PERIODS.find((p) => p.days === days)?.label ?? `${days}d`;
    setAfterTitle(
      <span className="flex items-center gap-2">
        {loading && <Spinner className="shrink-0 text-base text-primary" />}
        <Badge tone="secondary" className="text-[10px]">
          {periodLabel}
        </Badge>
      </span>,
    );
    setEnd(
      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODS.map((p) => (
            <Button
              key={p.label}
              type="button"
              size="sm"
              outlined={days !== p.days}
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          outlined
          onClick={load}
          disabled={loading}
          prefix={loading ? <Spinner /> : <RefreshCw />}
        >
          {t.common.refresh}
        </Button>
      </div>,
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [days, loading, load, setAfterTitle, setEnd, t.common.refresh]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PluginSlot name="analytics:top" />
      {loading && !data && (
        <div className="flex items-center justify-center py-24">
          <div className="bento-card rounded-2xl p-8 flex flex-col items-center gap-3 shadow-bento-md">
            <Spinner className="text-2xl text-primary" />
            <p className="text-[12px] text-[#6b7280]">Loading analytics...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bento-card rounded-2xl p-5 shadow-bento-sm border-[#DC2626]/30 bg-red-50">
          <p className="text-sm text-[#DC2626] text-center font-medium">{error}</p>
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm hover:shadow-bento-md transition-shadow">
              <div className="py-0">
                <Stats
                  items={[
                    {
                      label: t.analytics.totalTokens,
                      value: formatTokens(
                        data.totals.total_input + data.totals.total_output,
                      ),
                    },
                    {
                      label: t.analytics.input,
                      value: formatTokens(data.totals.total_input),
                    },
                    {
                      label: t.analytics.output,
                      value: formatTokens(data.totals.total_output),
                    },
                    {
                      label: t.analytics.totalSessions,
                      value: `${data.totals.total_sessions} (~${(data.totals.total_sessions / days).toFixed(1)}${t.analytics.perDayAvg})`,
                    },
                    {
                      label: t.analytics.apiCalls,
                      value: String(
                        data.totals.total_api_calls ??
                          data.daily.reduce((sum, d) => sum + d.sessions, 0),
                      ),
                    },
                    {
                      label: t.analytics.totalCost ?? "Est. Cost",
                      value: data.totals.total_estimated_cost != null
                        ? `$${Number(data.totals.total_estimated_cost).toFixed(4)}`
                        : "—",
                    },
                  ]}
                />
              </div>
            </div>

            <TokenBarChart daily={data.daily} />
          </div>

          <DailyTable daily={data.daily} />
          <ModelTable models={data.by_model} />
          <SkillTable skills={data.skills.top_skills} />
        </>
      )}

      {data &&
        data.daily.length === 0 &&
        data.by_model.length === 0 &&
        data.skills.top_skills.length === 0 && (
          <div className="bento-card rounded-2xl p-5 shadow-bento-md">
            <div className="flex flex-col items-center text-[#6b7280] py-12">
              <BarChart3 className="h-10 w-10 mb-3 opacity-40 text-[#6b7280]" />
              <p className="text-sm font-semibold text-[#111827]">{t.analytics.noUsageData}</p>
              <p className="text-[11px] mt-2 text-[#6b7280]">
                {t.analytics.startSession}
              </p>
            </div>
          </div>
        )}
      <PluginSlot name="analytics:bottom" />
    </div>
  );
}

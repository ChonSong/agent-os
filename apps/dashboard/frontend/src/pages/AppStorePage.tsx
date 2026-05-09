/**
 * Agent Task Launcher — one-click schedule agent tasks as cron jobs.
 * Each "app" is a predefined task template. Installing = creating a cron job.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Zap, Clock, LayoutGrid, Search, CheckCircle2, Plus, Star,
  Brain, Terminal, Globe, BarChart3, FileText, RefreshCw,
  Trash2, Calendar,
} from "lucide-react";
import { H2 } from "@/components/NouiTypography";

interface TaskTemplate {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: string;
  description: string;
  prompt: string;
  schedule_kind: string;
  schedule_expr: string;
  rating: number;
  installed: boolean;
  installed_job_id?: string;
}

interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule_kind: string;
  schedule_expr: string;
  enabled: boolean;
  state: string;
}

const TASK_TEMPLATES: Omit<TaskTemplate, "installed" | "installed_job_id">[] = [
  {
    id: "daily-briefing",
    name: "Morning Briefing",
    icon: <SunIcon />,
    category: "Research",
    description: "Daily world news, weather, and your personalized agenda",
    prompt: "Give me a comprehensive morning briefing. Include: 1) Top 3 world news stories, 2) Today's weather for Sydney Australia, 3) Any pending tasks or reminders, 4) A motivational quote to start the day.",
    schedule_kind: "cron",
    schedule_expr: "0 8 * * *",
    rating: 5.0,
  },
  {
    id: "github-review",
    name: "GitHub PR Review",
    icon: <GitIcon />,
    category: "Development",
    description: "Review open PRs across all repos and highlight changes",
    prompt: "Review all open Pull Requests in the ChonSong GitHub account. For each PR: summarize the changes, note any potential issues, and indicate whether you recommend merging. Post summary to this session.",
    schedule_kind: "cron",
    schedule_expr: "0 9 * * 1-5",
    rating: 4.8,
  },
  {
    id: "system-audit",
    name: "System Audit",
    icon: <Terminal />,
    category: "DevOps",
    description: "Check container health, disk space, and service uptime",
    prompt: "Run a comprehensive system audit. Check: 1) Docker container status for all containers, 2) Disk usage on the host, 3) PostgreSQL connection and recent query stats, 4) Memory and CPU pressure. Report any anomalies.",
    schedule_kind: "cron",
    schedule_expr: "0 */4 * * *",
    rating: 4.7,
  },
  {
    id: "code-quality",
    name: "Code Quality Scan",
    icon: <ShieldIcon />,
    category: "Development",
    description: "Static analysis, lint warnings, and tech debt tracking",
    prompt: "Run a code quality scan on the agent-os repository. Check for: 1) Any TypeScript compilation errors, 2) Missing error handling, 3) TODO comments older than 7 days, 4) Large files over 500 lines that should be split. Report findings.",
    schedule_kind: "cron",
    schedule_expr: "0 10 * * 1",
    rating: 4.6,
  },
  {
    id: "web-research",
    name: "Web Research Digest",
    icon: <Globe />,
    category: "Research",
    description: "Curated tech/AI news from Hacker News and arXiv",
    prompt: "Research what's new in AI and data science. Check Hacker News top 10 and arXiv cs.AI recent papers. Summarize the 3 most interesting developments and explain why they matter.",
    schedule_kind: "cron",
    schedule_expr: "0 11 * * FRI",
    rating: 4.5,
  },
  {
    id: "repo-sync",
    name: "Repo Sync Check",
    icon: <SyncIcon />,
    category: "Development",
    description: "Check for updates to agent-os and nanobot dependencies",
    prompt: "Check the agent-os monorepo for: 1) Any outdated npm packages (npm outdated), 2) New commits on main since last check, 3) Any stalled branches that need attention, 4) CI/CD health. Summarize action items.",
    schedule_kind: "cron",
    schedule_expr: "0 9 * * 0",
    rating: 4.4,
  },
  {
    id: "analytics-report",
    name: "Analytics Digest",
    icon: <BarChart3 />,
    category: "Analytics",
    description: "Weekly summary of agent activity, tokens, and sessions",
    prompt: "Generate an analytics report. Query the dashboard database for: 1) Total sessions this week vs last week, 2) Token usage breakdown by model, 3) Most active hours, 4) Failed cron jobs. Format as a clean markdown report.",
    schedule_kind: "cron",
    schedule_expr: "0 10 * * 3",
    rating: 4.3,
  },
  {
    id: "memory-maintenance",
    name: "Memory Maintenance",
    icon: <Brain />,
    category: "AI",
    description: "Review and consolidate agent knowledge files",
    prompt: "Review the agent knowledge files in /opt/data/memory/. Check for: 1) Outdated information older than 30 days, 2) Contradictions between files, 3) Missing context that should be added. Update the index.md with cleaned knowledge.",
    schedule_kind: "cron",
    schedule_expr: "0 2 * * 0",
    rating: 4.2,
  },
  {
    id: "session-cleanup",
    name: "Session Cleanup",
    icon: <Trash2 />,
    category: "DevOps",
    description: "Archive or delete stale/abandoned sessions from the database",
    prompt: "Query the dashboard database for sessions with no activity in 14+ days. List them and archive (soft-delete) any that are confirmed stale. Report how many were cleaned up vs total scanned.",
    schedule_kind: "cron",
    schedule_expr: "0 3 * * 0",
    rating: 4.0,
  },
  {
    id: "skills-audit",
    name: "Skills Audit",
    icon: <Zap />,
    category: "AI",
    description: "Review nanobot skill health, usage stats, and detect unused skills",
    prompt: "Audit the nanobot skills directory at /app/packages/nanobot/nanobot/skills/. For each skill: 1) Check if SKILL.md is present and complete, 2) Check last modified date, 3) Review the skill content for quality. Report any skills that are broken, incomplete, or haven't been used in 30+ days.",
    schedule_kind: "cron",
    schedule_expr: "0 4 * * 0",
    rating: 3.9,
  },
  {
    id: "disk-space-check",
    name: "Disk Space Alert",
    icon: <BarChart3 />,
    category: "DevOps",
    description: "Monitor disk usage and alert if any mount exceeds 85% capacity",
    prompt: "Check disk space on all mounted volumes: df -h. Flag any partition above 85% usage. For partitions above 85%, list the top 5 largest files or directories. Report findings with actionable recommendations.",
    schedule_kind: "cron",
    schedule_expr: "0 */6 * * *",
    rating: 4.5,
  },
];

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#fbbf24]">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
function GitIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-[#111827]">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#34d399]">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function SyncIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#a78bfa]">
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
    </svg>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  Research: "bg-[#60a5fa]/10 text-[#3B82F6] border-[#60a5fa]/20",
  Development: "bg-[#34d399]/10 text-[#34d399] border-[#34d399]/20",
  DevOps: "bg-[#f59e0b]/10 text-[#D97706] border-[#f59e0b]/20",
  Analytics: "bg-[#f472b6]/10 text-[#f472b6] border-[#f472b6]/20",
  AI: "bg-[#a78bfa]/10 text-[#a78bfa] border-[#a78bfa]/20",
};

function scheduleLabel(kind: string, expr: string): string {
  const map: Record<string, string> = {
    "0 8 * * *": "Daily 8:00 AM",
    "0 9 * * 1-5": "Weekdays 9:00 AM",
    "0 */4 * * *": "Every 4 hours",
    "0 10 * * 1": "Mon 10:00 AM",
    "0 10 * * 3": "Wed 10:00 AM",
    "0 11 * * FRI": "Fridays 11:00 AM",
    "0 9 * * 0": "Sundays 9:00 AM",
    "0 10 * * 2": "Tuesdays 10:00 AM",
    "0 2 * * 0": "Sundays 2:00 AM",
    "0 3 * * 0": "Sundays 3:00 AM",
    "0 4 * * 0": "Sundays 4:00 AM",
    "0 */6 * * *": "Every 6 hours",
  };
  return map[expr] ?? `${kind}: ${expr}`;
}

export default function AppStorePage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [installing, setInstalling] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/cron/jobs");
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const categories = ["All", ...Array.from(new Set(TASK_TEMPLATES.map(t => t.category)))];

  const templates = TASK_TEMPLATES.map(t => {
    const installedJob = jobs.find(j => j.prompt === t.prompt);
    return { ...t, installed: !!installedJob, installed_job_id: installedJob?.id };
  });

  const filtered = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
                          t.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === "All" || t.category === category;
    return matchesSearch && matchesCategory;
  });

  async function install(template: TaskTemplate) {
    if (template.installed) return;
    setInstalling(template.id);
    try {
      const res = await fetch("/api/cron/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          prompt: template.prompt,
          schedule_kind: template.schedule_kind,
          schedule_expr: template.schedule_expr,
        }),
      });
      if (res.ok) {
        await loadJobs();
      }
    } finally {
      setInstalling(null);
    }
  }

  async function uninstall(jobId: string) {
    try {
      await fetch(`/api/cron/jobs/${jobId}`, { method: "DELETE" });
      await loadJobs();
    } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0E6D8] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#111827]">Task Launcher</H2>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            {templates.filter(t => t.installed).length}/{templates.length} tasks scheduled
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#6B7280]" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[#FFFBF5] border border-[#F0E6D8] rounded-lg text-[10px] text-[#111827] placeholder-[#4b5563] focus:outline-none focus:border-[#60a5fa] w-44"
            />
          </div>
          <button
            onClick={() => loadJobs()}
            className="p-2 rounded-lg bg-[#FFF5E6] hover:bg-[#F0E6D8] text-[#9CA3AF] hover:text-[#111827] transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-[#F0E6D8] shrink-0 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1 rounded-lg text-[10px] whitespace-nowrap transition-all ${
              category === cat
                ? "bg-[#FFF5E6] text-[#111827]"
                : "text-[#6B7280] hover:text-[#9CA3AF]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Task grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && templates.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 animate-spin text-[#6B7280]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(template => (
              <div
                key={template.id}
                className={`bg-[#FFFBF5] border rounded-xl p-4 flex flex-col gap-3 transition-all hover:border-[#D4C8B8] ${
                  template.installed ? "border-[#34d399]/30" : "border-[#F0E6D8]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#FFF5E6] flex items-center justify-center shrink-0">
                    {template.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <H2 variant="sm" className="text-[#111827]">{template.name}</H2>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[8px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[template.category] ?? "bg-[#FFF5E6] text-[#9CA3AF] border-[#F0E6D8]"}`}>
                        {template.category}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Star size={9} className="text-[#D97706] fill-yellow-400" />
                        <span className="text-[9px] text-[#6B7280]">{template.rating}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-[#9CA3AF] leading-relaxed">{template.description}</p>

                <div className="flex items-center gap-1.5 text-[9px] text-[#6B7280]">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>{scheduleLabel(template.schedule_kind, template.schedule_expr)}</span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#F0E6D8]">
                  {template.installed ? (
                    <>
                      <div className="flex items-center gap-1 text-[#34d399]">
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="text-[10px]">Scheduled</span>
                      </div>
                      <button
                        onClick={() => template.installed_job_id && uninstall(template.installed_job_id)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] text-[#DC2626] hover:bg-[#DC2626]/10 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => install(template)}
                      disabled={installing === template.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16A34A] text-[10px] text-[#0a0e14] font-semibold hover:bg-[#15803D] transition-all disabled:opacity-50 w-full justify-center"
                    >
                      {installing === template.id ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Calendar className="w-3 h-3" />
                      )}
                      Schedule Task
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-[#6B7280]">
            <LayoutGrid size={36} className="opacity-30" />
            <p className="text-sm">No tasks match your search</p>
          </div>
        )}
      </div>
    </div>
  );
}

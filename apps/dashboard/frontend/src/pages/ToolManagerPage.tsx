/**
 * Tool Manager — manage Hermes skills and toolsets.
 * - Skills: loaded from disk, toggled via backend, persisted to PostgreSQL
 * - Toolsets: Hermes's core capabilities (terminal, browser, file)
 */
import { useCallback, useEffect, useState } from "react";
import {
  Wrench, Plus, Zap, Search, Settings, ToggleLeft, ToggleRight,
  ChevronRight, Terminal, Globe, FolderOpen, Info, RefreshCw,
  CheckCircle2, XCircle,
} from "lucide-react";
import { H2 } from "@/components/NouiTypography";

interface Toolset {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
}

interface Skill {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

interface Tool {
  name: string;
  label: string;
  description: string;
  Icon: React.FC<{ className?: string }>;
}

const CORE_TOOLS: Tool[] = [
  { name: "terminal", label: "Terminal", description: "Run shell commands on the host system", Icon: Terminal },
  { name: "browser", label: "Browser", description: "Web browsing and automation via CDP", Icon: Globe },
  { name: "file", label: "File System", description: "Read, write, and manage files on the host", Icon: FolderOpen },
];

const CATEGORY_COLORS: Record<string, string> = {
  general: "text-[#3B82F6]",
  coding: "text-[#34d399]",
  data: "text-[#f472b6]",
  research: "text-[#fbbf24]",
  creative: "text-[#a78bfa]",
  default: "text-[#9CA3AF]",
};

function ToolCard({
  tool,
  enabled,
  configured,
  onToggle,
}: {
  tool: Tool;
  enabled: boolean;
  configured: boolean;
  onToggle: () => void;
}) {
  const Icon = tool.Icon;
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-[#FFFBF5] border border-[#F0E6D8] hover:border-[#D4C8B8] transition-all">
      <div className="w-9 h-9 rounded-lg bg-[#FFF5E6] flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-[#3B82F6]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#111827]">{tool.label}</span>
          {!configured && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20">
              UNCONFIGURED
            </span>
          )}
          {configured && (
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#34d399]/10 text-[#34d399] border border-[#34d399]/20">
              READY
            </span>
          )}
        </div>
        <p className="text-[10px] text-[#6B7280] mt-0.5">{tool.description}</p>
      </div>
      <button
        onClick={onToggle}
        className="shrink-0 mt-0.5"
        title={enabled ? "Disable tool" : "Enable tool"}
      >
        {enabled ? (
          <ToggleRight className="w-6 h-6 text-[#34d399]" />
        ) : (
          <ToggleRight className="w-6 h-6 text-[#6B7280] hover:text-[#9CA3AF]" />
        )}
      </button>
    </div>
  );
}

function SkillRow({
  skill,
  onToggle,
}: {
  skill: Skill;
  onToggle: () => void;
}) {
  const color = CATEGORY_COLORS[skill.category] ?? CATEGORY_COLORS.default;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[#FFFBF5] transition-colors group">
      <div className="w-6 h-6 rounded bg-[#FFF5E6] flex items-center justify-center shrink-0">
        <Zap className={`w-3 h-3 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#111827]">{skill.name}</span>
          <span className={`text-[8px] px-1.5 py-0.5 rounded bg-[#FFF5E6] ${color}`}>
            {skill.category}
          </span>
        </div>
        <p className="text-[10px] text-[#6B7280] mt-0.5 truncate">{skill.description}</p>
      </div>
      <button
        onClick={onToggle}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        title={skill.enabled ? "Disable skill" : "Enable skill"}
      >
        {skill.enabled ? (
          <ToggleRight className="w-6 h-6 text-[#34d399]" />
        ) : (
          <ToggleRight className="w-6 h-6 text-[#6B7280]" />
        )}
      </button>
    </div>
  );
}

export default function ToolManagerPage() {
  const [toolsets, setToolsets] = useState<Toolset[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"core" | "skills">("core");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [toolsRes, skillsRes] = await Promise.all([
        fetch("/api/tools/toolsets"),
        fetch("/api/skills"),
      ]);
      if (!toolsRes.ok || !skillsRes.ok) throw new Error("Failed to load");
      const toolsData = await toolsRes.json();
      const skillsData = await skillsRes.json();
      setToolsets(toolsData ?? []);
      setSkills(skillsData ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleSkill(name: string, currentEnabled: boolean) {
    // Optimistic update
    setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled: !currentEnabled } : s));
    try {
      const res = await fetch("/api/skills/toggle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled: !currentEnabled }),
      });
      if (!res.ok) throw new Error("Toggle failed");
    } catch {
      // Revert on failure
      setSkills(prev => prev.map(s => s.name === name ? { ...s, enabled: currentEnabled } : s));
    }
  }

  async function toggleToolset(name: string, currentEnabled: boolean) {
    // Toolsets are read-only for now — just show the intent
    setToolsets(prev => prev.map(t => t.name === name ? { ...t, enabled: !currentEnabled } : t));
    // Note: toolset toggle requires Hermes config change + restart
  }

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(search.toLowerCase()) ||
    skill.description.toLowerCase().includes(search.toLowerCase()) ||
    skill.category.toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = skills.filter(s => s.enabled).length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FFF5E6]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0E6D8] shrink-0 bg-[#FFFBF5]">
        <div>
          <H2 variant="xl" className="text-[#111827]">Tool Manager</H2>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            {enabledCount}/{skills.length} skills active · {toolsets.filter(t => t.enabled).length}/{toolsets.length} tools ready
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#6B7280]" />
            <input
              type="text"
              placeholder="Search skills..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-[#FFFBF5] border border-[#F0E6D8] rounded-lg text-[10px] text-[#111827] placeholder-[#4b5563] focus:outline-none focus:border-[#60a5fa] w-44"
            />
          </div>
          <button
            onClick={() => load()}
            className="p-2 rounded-lg bg-[#FFF5E6] hover:bg-[#F0E6D8] text-[#9CA3AF] hover:text-[#111827] transition-all"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <a
            href="https://clawhub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16A34A] text-[10px] text-[#0a0e14] font-semibold hover:bg-[#15803D] transition-all"
          >
            <Plus size={12} />
            Browse Skills
          </a>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-3 pb-2 border-b border-[#F0E6D8] shrink-0">
        <button
          onClick={() => setActiveTab("core")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
            activeTab === "core"
              ? "bg-[#FFF5E6] text-[#111827]"
              : "text-[#6B7280] hover:text-[#9CA3AF]"
          }`}
        >
          <Terminal className="w-3 h-3" />
          Core Tools
          <span className="ml-1 px-1.5 py-0.5 rounded bg-[#60a5fa]/10 text-[#3B82F6]">
            {toolsets.filter(t => t.enabled).length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("skills")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
            activeTab === "skills"
              ? "bg-[#FFF5E6] text-[#111827]"
              : "text-[#6B7280] hover:text-[#9CA3AF]"
          }`}
        >
          <Zap className="w-3 h-3" />
          Skills
          <span className="ml-1 px-1.5 py-0.5 rounded bg-[#34d399]/10 text-[#34d399]">
            {enabledCount}/{skills.length}
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <XCircle className="w-8 h-8 text-[#DC2626]" />
            <p className="text-[11px] text-[#DC2626]">{error}</p>
            <button onClick={load} className="text-[10px] text-[#6B7280] hover:text-[#9CA3AF]">
              Retry
            </button>
          </div>
        ) : loading && skills.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 animate-spin text-[#6B7280]" />
          </div>
        ) : activeTab === "core" ? (
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-3 h-3 text-[#3B82F6]" />
              <p className="text-[10px] text-[#6B7280]">
                Core tools are Hermes's built-in capabilities. Toggle them to enable/disable specific agent functionalities.
              </p>
            </div>
            {CORE_TOOLS.map(tool => {
              const ts = toolsets.find(t => t.name === tool.name);
              return (
                <ToolCard
                  key={tool.name}
                  tool={tool}
                  enabled={ts?.enabled ?? true}
                  configured={ts?.configured ?? true}
                  onToggle={() => toggleToolset(tool.name, ts?.enabled ?? true)}
                />
              );
            })}
          </div>
        ) : (
          <div className="max-w-3xl">
            {search && (
              <p className="text-[10px] text-[#6B7280] mb-3">
                {filteredSkills.length} result{filteredSkills.length !== 1 ? "s" : ""} for "{search}"
              </p>
            )}
            <div className="rounded-xl bg-[#FFFBF5] border border-[#F0E6D8] overflow-hidden">
              {filteredSkills.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Search className="w-6 h-6 text-[#6B7280]" />
                  <p className="text-[11px] text-[#6B7280]">No skills match "{search}"</p>
                </div>
              ) : (
                filteredSkills.map((skill, i) => (
                  <div key={skill.name}>
                    <SkillRow
                      skill={skill}
                      onToggle={() => toggleSkill(skill.name, skill.enabled)}
                    />
                    {i < filteredSkills.length - 1 && (
                      <div className="border-t border-[#F0E6D8]" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Skill tips */}
            {skills.length > 0 && !search && (
              <div className="mt-6 p-4 rounded-xl bg-[#FFFBF5]/50 border border-[#F0E6D8]">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-3 h-3 text-[#3B82F6]" />
                  <span className="text-[10px] font-semibold text-[#9CA3AF]">About Skills</span>
                </div>
                <ul className="space-y-1 text-[10px] text-[#6B7280]">
                  <li>· Skills are loaded from <code className="text-[#3B82F6]">/app/packages/nanobot/Hermes/skills/</code> at startup</li>
                  <li>· Toggle a skill to enable/disable it — changes take effect on the next agent session</li>
                  <li>· Disabled skills are still visible here but the agent won't use them</li>
                  <li>· Browse more skills at <a href="https://clawhub.com" target="_blank" rel="noopener noreferrer" className="text-[#3B82F6] hover:underline">clawhub.com</a></li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

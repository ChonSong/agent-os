import { useEffect, useLayoutEffect, useState, useMemo } from "react";
import {
  Package,
  Search,
  Wrench,
  X,
  Cpu,
  Globe,
  Shield,
  Eye,
  Paintbrush,
  Brain,
  Blocks,
  Code,
  Zap,
  Filter,
  Plus,
  Trash,
  Download,
  Star,
} from "lucide-react";
import { api } from "@/lib/api";
import type { SkillInfo, ToolsetInfo } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { Toast } from "@/components/Toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { ListItem } from "@nous-research/ui/ui/components/list-item";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { PluginSlot } from "@/plugins";

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

const CATEGORY_LABELS: Record<string, string> = {
  mlops: "MLOps",
  "mlops/cloud": "MLOps / Cloud",
  "mlops/evaluation": "MLOps / Evaluation",
  "mlops/inference": "MLOps / Inference",
  "mlops/models": "MLOps / Models",
  "mlops/training": "MLOps / Training",
  "mlops/vector-databases": "MLOps / Vector DBs",
  mcp: "MCP",
  "red-teaming": "Red Teaming",
  ocr: "OCR",
  p5js: "p5.js",
  ai: "AI",
  ux: "UX",
  ui: "UI",
};

function prettyCategory(
  raw: string | null | undefined,
  generalLabel: string,
): string {
  if (!raw) return generalLabel;
  if (CATEGORY_LABELS[raw]) return CATEGORY_LABELS[raw];
  return raw
    .split(/[-_/]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const TOOLSET_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  computer: Cpu,
  web: Globe,
  security: Shield,
  vision: Eye,
  design: Paintbrush,
  ai: Brain,
  integration: Blocks,
  code: Code,
  automation: Zap,
};

function toolsetIcon(
  name: string,
): React.ComponentType<{ className?: string }> {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(TOOLSET_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return Wrench;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"skills" | "toolsets">("skills");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [togglingSkills, setTogglingSkills] = useState<Set<string>>(new Set());
  const { toast, showToast } = useToast();
  const { t } = useI18n();
  const { setAfterTitle, setEnd } = usePageHeader();

  // Create skill dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createContent, setCreateContent] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingSkills, setDeletingSkills] = useState<Set<string>>(new Set());

  // Marketplace modal
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  const openCreateDialog = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateContent("");
    setCreateError(null);
    setShowCreateDialog(true);
  };

  const closeCreateDialog = () => {
    setShowCreateDialog(false);
    setCreateError(null);
  };

  // Sync template when name or description changes (only if content hasn't been manually edited yet)
  useEffect(() => {
    if (showCreateDialog && !createLoading) {
      setCreateContent(`---
name: ${createName || "my-new-skill"}
description: ${createDescription || "Describe when to use this skill and what it does."}
---

# My New Skill

## When to Use
Use this skill when the user asks about...

## How to Use
Describe the workflow or provide examples.

## Notes
- Keep concise — the agent is already smart
- Only add context the agent doesn't already have
`);
    }
  }, [createName, createDescription, showCreateDialog, createLoading]);

  const handleCreateSkill = async () => {
    if (!createName.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const kebabName = createName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      await api.createSkill(kebabName, createDescription, createContent);
      showToast(`Skill "${kebabName}" created`, "success");
      closeCreateDialog();
      // Refresh skills list
      const updated = await api.getSkills();
      setSkills(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([api.getSkills(), api.getToolsets()])
      .then(([s, tsets]) => {
        setSkills(s);
        setToolsets(tsets);
      })
      .catch(() => showToast(t.common.loading, "error"))
      .finally(() => setLoading(false));
  }, []);

  /* ---- Toggle skill ---- */
  const handleToggleSkill = async (skill: SkillInfo) => {
    setTogglingSkills((prev) => new Set(prev).add(skill.name));
    try {
      await api.toggleSkill(skill.name, !skill.enabled);
      setSkills((prev) =>
        prev.map((s) =>
          s.name === skill.name ? { ...s, enabled: !s.enabled } : s,
        ),
      );
      showToast(
        `${skill.name} ${skill.enabled ? t.common.disabled : t.common.enabled}`,
        "success",
      );
    } catch {
      showToast(`${t.common.failedToToggle} ${skill.name}`, "error");
    } finally {
      setTogglingSkills((prev) => {
        const next = new Set(prev);
        next.delete(skill.name);
        return next;
      });
    }
  };

  /* ---- Delete skill ---- */
  const handleDeleteSkill = async (skill: SkillInfo) => {
    if (!window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return;
    setDeletingSkills((prev) => new Set(prev).add(skill.name));
    try {
      await api.deleteSkill(skill.name);
      setSkills((prev) => prev.filter((s) => s.name !== skill.name));
      showToast(`Deleted "${skill.name}"`, "success");
    } catch {
      showToast(`Failed to delete "${skill.name}"`, "error");
    } finally {
      setDeletingSkills((prev) => {
        const next = new Set(prev);
        next.delete(skill.name);
        return next;
      });
    }
  };

  /* ---- Derived data ---- */
  const lowerSearch = search.toLowerCase();
  const isSearching = search.trim().length > 0;

  const searchMatchedSkills = useMemo(() => {
    if (!isSearching) return [];
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerSearch) ||
        s.description.toLowerCase().includes(lowerSearch) ||
        (s.category ?? "").toLowerCase().includes(lowerSearch),
    );
  }, [skills, isSearching, lowerSearch]);

  const activeSkills = useMemo(() => {
    if (isSearching) return [];
    if (!activeCategory)
      return [...skills].sort((a, b) => a.name.localeCompare(b.name));
    return skills
      .filter((s) =>
        activeCategory === "__none__"
          ? !s.category
          : s.category === activeCategory,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [skills, activeCategory, isSearching]);

  const allCategories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const s of skills) {
      const key = s.category || "__none__";
      cats.set(key, (cats.get(key) || 0) + 1);
    }
    return [...cats.entries()]
      .sort((a, b) => {
        if (a[0] === "__none__") return -1;
        if (b[0] === "__none__") return 1;
        return a[0].localeCompare(b[0]);
      })
      .map(([key, count]) => ({
        key,
        name: prettyCategory(key === "__none__" ? null : key, t.common.general),
        count,
      }));
  }, [skills, t]);

  const enabledCount = skills.filter((s) => s.enabled).length;

  useLayoutEffect(() => {
    if (loading) {
      setAfterTitle(null);
      setEnd(null);
      return;
    }
    setAfterTitle(
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {t.skills.enabledOf
          .replace("{enabled}", String(enabledCount))
          .replace("{total}", String(skills.length))}
      </span>,
    );
    setEnd(
      <div className="relative w-full min-w-0 sm:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          className="h-8 pl-8 pr-7 text-xs"
          placeholder={t.common.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <Button
            ghost
            size="xs"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setSearch("")}
            aria-label={t.common.clear}
          >
            <X />
          </Button>
        )}
      </div>,
    );
    return () => {
      setAfterTitle(null);
      setEnd(null);
    };
  }, [enabledCount, loading, search, setAfterTitle, setEnd, skills.length, t]);

  const filteredToolsets = useMemo(() => {
    return toolsets.filter(
      (ts) =>
        !search ||
        ts.name.toLowerCase().includes(lowerSearch) ||
        ts.label.toLowerCase().includes(lowerSearch) ||
        ts.description.toLowerCase().includes(lowerSearch),
    );
  }, [toolsets, search, lowerSearch]);

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PluginSlot name="skills:top" />
      <Toast toast={toast} />

      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <aside aria-label={t.skills.title} className="sm:w-56 sm:shrink-0">
          <div className="sm:sticky sm:top-0">
            <div
              className={`
                flex flex-col
                border border-border bg-muted/20
              `}
            >
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 border-b border-border">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <span className="font-mondwest text-[0.65rem] tracking-[0.12em] uppercase text-muted-foreground">
                  {t.skills.filters}
                </span>
              </div>

              <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-x-visible scrollbar-none p-2">
                <PanelItem
                  icon={Package}
                  label={`${t.skills.all} (${skills.length})`}
                  active={view === "skills" && !isSearching}
                  onClick={() => {
                    setView("skills");
                    setActiveCategory(null);
                    setSearch("");
                  }}
                />
                <PanelItem
                  icon={Wrench}
                  label={`${t.skills.toolsets} (${toolsets.length})`}
                  active={view === "toolsets"}
                  onClick={() => {
                    setView("toolsets");
                    setSearch("");
                  }}
                />
              </div>

              {view === "skills" &&
                !isSearching &&
                allCategories.length > 0 && (
                  <div className="hidden sm:flex flex-col border-t border-border">
                    <div className="px-3 pt-2 pb-1 font-mondwest text-[0.6rem] tracking-[0.12em] uppercase text-muted-foreground/70">
                      {t.skills.categories}
                    </div>
                    <div className="flex flex-col p-2 pt-1 gap-px max-h-[calc(100vh-340px)] overflow-y-auto">
                      {allCategories.map(({ key, name, count }) => {
                        const isActive = activeCategory === key;

                        return (
                          <ListItem
                            key={key}
                            active={isActive}
                            onClick={() =>
                              setActiveCategory(isActive ? null : key)
                            }
                            className="rounded-sm px-2 py-1 text-[11px]"
                          >
                            <span className="flex-1 truncate">{name}</span>
                            <span
                              className={`text-[10px] tabular-nums ${
                                isActive
                                  ? "text-foreground/60"
                                  : "text-muted-foreground/50"
                              }`}
                            >
                              {count}
                            </span>
                          </ListItem>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {isSearching ? (
            <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  {t.skills.title}
                </span>
                <Badge tone="secondary" className="text-[10px]">
                  {t.skills.resultCount
                    .replace("{count}", String(searchMatchedSkills.length))
                    .replace(
                      "{s}",
                      searchMatchedSkills.length !== 1 ? "s" : "",
                    )}
                </Badge>
              </div>
              <div>
                {searchMatchedSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t.skills.noSkillsMatch}
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {searchMatchedSkills.map((skill) => (
                      <SkillRow
                        key={skill.name}
                        skill={skill}
                        toggling={togglingSkills.has(skill.name)}
                        deleting={deletingSkills.has(skill.name)}
                        onToggle={() => handleToggleSkill(skill)}
                        onDelete={() => handleDeleteSkill(skill)}
                        noDescriptionLabel={t.skills.noDescription}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) :          view === "skills" ? (
            /* Skills list */
            <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {activeCategory
                    ? prettyCategory(
                        activeCategory === "__none__" ? null : activeCategory,
                        t.common.general,
                      )
                    : t.skills.all}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setMarketplaceOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#5e6ad2] hover:bg-[#828fff] text-white transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Browse Marketplace
                    </button>
                    <Button size="xs" onClick={openCreateDialog}>
                      <Plus className="h-3 w-3" />
                      Create Skill
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                {activeSkills.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {skills.length === 0
                      ? t.skills.noSkills
                      : t.skills.noSkillsMatch}
                  </p>
                ) : (
                  <div className="grid gap-1">
                    {activeSkills.map((skill) => (
                      <SkillRow
                        key={skill.name}
                        skill={skill}
                        toggling={togglingSkills.has(skill.name)}
                        deleting={deletingSkills.has(skill.name)}
                        onToggle={() => handleToggleSkill(skill)}
                        onDelete={() => handleDeleteSkill(skill)}
                        noDescriptionLabel={t.skills.noDescription}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Toolsets grid */
            <>
              {filteredToolsets.length === 0 ? (
                <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm">
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      {t.skills.noToolsetsMatch}
                    </div>
                  </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredToolsets.map((ts) => {
                    const TsIcon = toolsetIcon(ts.name);
                    const labelText =
                      ts.label.replace(/^[\p{Emoji}\s]+/u, "").trim() ||
                      ts.name;

                    return (
                      <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-4 shadow-bento-sm hover:shadow-bento-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <div className="flex items-start gap-3">
                            <TsIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">
                                  {labelText}
                                </span>
                                <Badge
                                  tone={ts.enabled ? "success" : "outline"}
                                  className="text-[10px]"
                                >
                                  {ts.enabled
                                    ? t.common.active
                                    : t.common.inactive}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">
                                {ts.description}
                              </p>
                              {ts.enabled && !ts.configured && (
                                <p className="text-[10px] text-amber-300/80 mb-2">
                                  {t.skills.setupNeeded}
                                </p>
                              )}
                              {ts.tools.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {ts.tools.map((tool) => (
                                    <Badge
                                      key={tool}
                                      tone="secondary"
                                      className="text-[10px] font-mono"
                                    >
                                      {tool}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {ts.tools.length === 0 && (
                                <span className="text-[10px] text-muted-foreground/60">
                                  {ts.enabled
                                    ? t.skills.toolsetLabel.replace(
                                        "{name}",
                                        ts.name,
                                      )
                                    : t.skills.disabledForCli}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <PluginSlot name="skills:bottom" />

      {/* Create Skill Dialog */}
      {showCreateDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCreateDialog();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-skill-title"
        >
          <div className="relative w-full max-w-2xl mx-4 border border-border bg-card shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2
                id="create-skill-title"
                className="font-expanded text-sm font-bold tracking-[0.08em] uppercase blend-lighter"
              >
                Create Skill
              </h2>
              <Button
                ghost
                size="icon"
                onClick={closeCreateDialog}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t.common.close}
              >
                <X />
              </Button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill-name">Name</Label>
                <Input
                  id="skill-name"
                  placeholder="my-new-skill"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground">
                  Auto-converts to kebab-case
                </p>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill-description">Description</Label>
                <Input
                  id="skill-description"
                  placeholder="Describe when to use this skill..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                />
              </div>

              {/* Content */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill-content">SKILL.md Content</Label>
                <textarea
                  id="skill-content"
                  className={cn(
                    "flex min-h-[320px] w-full border border-border bg-background/40 px-3 py-2 font-courier text-sm transition-colors",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30 focus-visible:border-foreground/25",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "resize-y",
                  )}
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  placeholder="SKILL.md content..."
                />
              </div>

              {/* Error */}
              {createError && (
                <div className="border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {createError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
              <Button outlined onClick={closeCreateDialog} disabled={createLoading}>
                Cancel
              </Button>
              <Button onClick={handleCreateSkill} disabled={createLoading}>
                {createLoading ? "…" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <MarketplaceModal
        open={marketplaceOpen}
        onClose={() => setMarketplaceOpen(false)}
        onImport={async (name, description, content) => {
          await api.createSkill(name, description, content);
          setSkills((prev) => [...prev, { name, description, category: 'general', enabled: true, is_custom: true }]);
          showToast(`"${name}" imported!`, 'success');
        }}
        existingSkills={skills.map((s) => s.name)}
      />
    </div>
  );
}

function MarketplaceModal({
  open,
  onClose,
  onImport,
  existingSkills,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (name: string, description: string, content: string) => Promise<void>;
  existingSkills: string[];
}) {
  const [tab, setTab] = useState<'featured' | 'import'>('featured');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const FEATURED_SKILLS = [
    {
      name: 'weather-assistant',
      description: 'Query weather forecasts for any city with multi-day forecasts and life index',
      category: 'utilities',
      stars: 240,
      author: 'builtin',
      content: `# SKILL.md
name: weather-assistant
description: Advanced weather queries for any city with multi-day forecasts and life index
trigger: user
\`\`\`
Available commands:
- "weather [city]" → current weather + 7-day forecast
- "should I bring umbrella in [city]" → precipitation advice
- "air quality [city]" → AQI and pollution levels
\`\`\`
`,
    },
    {
      name: 'code-reviewer',
      description: 'AI-powered code review with security vulnerability detection and best-practice suggestions',
      category: 'development',
      stars: 890,
      author: 'builtin',
      content: `# SKILL.md
name: code-reviewer
description: AI-powered code review with security vulnerability detection and best-practice suggestions
trigger: user
\`\`\`
Review any code by pasting it or providing a GitHub URL.
Detects: SQL injection, XSS, hardcoded secrets, logic bugs,
        performance issues, and style violations.
\`\`\`
`,
    },
    {
      name: 'meeting-notes',
      description: 'Structured meeting notes with action item extraction, owner assignment, and follow-up reminders',
      category: 'productivity',
      stars: 520,
      author: 'builtin',
      content: `# SKILL.md
name: meeting-notes
description: Structured meeting notes with action item extraction and follow-up reminders
trigger: user
\`\`\`
Paste transcript or meeting summary to generate:
- Key decisions made
- Action items with owners
- Follow-up dates
- Next meeting agenda
\`\`\`
`,
    },
    {
      name: 'devops-dashboard',
      description: 'Docker, Kubernetes, and CI/CD pipeline status monitoring and alerting',
      category: 'devops',
      stars: 1100,
      author: 'builtin',
      content: `# SKILL.md
name: devops-dashboard
description: Docker, Kubernetes, and CI/CD pipeline status monitoring and alerting
trigger: user
\`\`\`
Commands:
- "container status" → all Docker containers
- "docker logs [name]" → recent logs
- "ci status" → GitHub Actions pipelines
- "restart [container]" → recreate a container
\`\`\`
`,
    },
    {
      name: 'data-analyst',
      description: 'Analyze CSVs, JSON, and databases. Generates summary stats, correlations, and visualizations',
      category: 'data-science',
      stars: 730,
      author: 'builtin',
      content: `# SKILL.md
name: data-analyst
description: Analyze CSVs, JSON, and databases with statistical summaries and visualizations
trigger: user
\`\`\`
Upload or paste data to get:
- Summary statistics (mean, median, std, quartiles)
- Correlation matrix
- Missing value report
- Top 5 anomalies
- Suggested visualizations
\`\`\`
`,
    },
    {
      name: 'git-helper',
      description: 'Interactive git workflow assistant — branching, rebasing, resolving conflicts, crafting commits',
      category: 'development',
      stars: 1450,
      author: 'builtin',
      content: `# SKILL.md
name: git-helper
description: Interactive git workflow assistant for branching, rebasing, conflict resolution, and commit crafting
trigger: user
\`\`\`
Ask me anything about git:
- "what is my current branch"
- "create branch feature-x from main"
- "rebase my branch onto latest main"
- "help me write a good commit message"
- "show me commits I haven't pushed"
\`\`\`
`,
    },
    {
      name: 'security-scanner',
      description: 'Scan code, configs, and dependencies for security issues. CVE lookup and remediation advice',
      category: 'security',
      stars: 670,
      author: 'builtin',
      content: `# SKILL.md
name: security-scanner
description: Security scanning for code, configs, and dependencies with CVE lookup and remediation advice
trigger: user
\`\`\`
Commands:
- "scan [code/text]" → find security issues
- "check CVE [id]" → look up vulnerability details
- "audit dependencies" → check package.json/requirements.txt
- "secure checklist" → OWASP top 10 review
\`\`\`
`,
    },
    {
      name: 'readme-writer',
      description: 'Generates beautiful README.md from project structure, auto-detecting tech stack and features',
      category: 'documentation',
      stars: 390,
      author: 'builtin',
      content: `# SKILL.md
name: readme-writer
description: Generates beautiful README.md from project structure with auto-detected tech stack
trigger: user
\`\`\`
Paste your project structure or provide a GitHub repo URL.
Generates:
- Project overview and features
- Tech stack badges
- Installation instructions
- Usage examples
- Contributing guidelines
- License recommendation
\`\`\`
`,
    },
  ];

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      let name = importUrl.split('/').pop()?.replace(/\.md$/i, '') ?? 'imported-skill';
      let description = `Imported from ${importUrl}`;
      let content = '';

      try {
        const res = await fetch(importUrl);
        if (res.ok) {
          const text = await res.text();
          const nameMatch = text.match(/^name:\s*(.+)/im);
          const descMatch = text.match(/^description:\s*(.+)/im);
          name = nameMatch?.[1]?.trim() ?? name;
          description = descMatch?.[1]?.trim() ?? description;
          content = text;
        } else {
          throw new Error('URL not accessible');
        }
      } catch {
        name = importUrl.split('/').pop() ?? 'imported-skill';
        description = `Imported skill from ${importUrl}`;
        content = `# SKILL.md\nname: ${name}\ndescription: ${description}\ntrigger: user\n`;
      }

      await onImport(name, description, content);
      setImportSuccess(`"${name}" imported successfully!`);
      setImportUrl('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80" />
      <div
        className="relative bg-[#0f1011] border border-[rgba(255,255,255,0.08)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <div>
            <h2 className="text-sm font-semibold text-[#f7f8f8]">Skill Marketplace</h2>
            <p className="text-xs text-[#8a8f98] mt-0.5">Discover, import, and share skills</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-[#8a8f98] hover:text-[#f7f8f8] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-4 pb-2 border-b border-[rgba(255,255,255,0.06)]">
          {(['featured', 'import'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                tab === t
                  ? 'bg-[#5e6ad2] text-white'
                  : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[rgba(255,255,255,0.04)]'
              }`}
            >
              {t === 'featured' ? 'Featured Skills' : 'Import from URL'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'featured' ? (
            <div className="grid gap-3">
              {FEATURED_SKILLS.map((skill) => {
                const isInstalled = existingSkills.includes(skill.name);
                return (
                  <div
                    key={skill.name}
                    className="group flex items-start gap-3 p-3 rounded-lg border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#f7f8f8]">{skill.name}</span>
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-[rgba(94,106,210,0.15)] text-[#5e6ad2] font-medium">
                          {skill.category}
                        </span>
                        {isInstalled && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-[rgba(16,185,129,0.15)] text-[#10b981] font-medium">
                            Installed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#8a8f98] mt-1 leading-relaxed">{skill.description}</p>
                      <div className="flex items-center gap-1 mt-2 text-[#62666d]">
                        <Star className="h-3 w-3" />
                        <span className="text-[11px]">{skill.stars.toLocaleString()}</span>
                        <span className="text-[11px] mx-1">·</span>
                        <span className="text-[11px]">by {skill.author}</span>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await onImport(skill.name, skill.description, skill.content);
                        } catch (err) {
                          console.error('Import failed:', err);
                        }
                      }}
                      disabled={isInstalled}
                      className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                        isInstalled
                          ? 'bg-[rgba(255,255,255,0.04)] text-[#62666d] cursor-default'
                          : 'bg-[#5e6ad2] hover:bg-[#828fff] text-white hover:shadow-lg hover:shadow-[#5e6ad2]/20'
                      }`}
                    >
                      <Download className="h-3 w-3" />
                      {isInstalled ? 'Installed' : 'Import'}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#d0d6e0] mb-1.5">
                  GitHub Raw URL or File URL
                </label>
                <input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/user/repo/main/skills/my-skill/SKILL.md"
                  className="w-full px-3 py-2 text-sm bg-[#191a1b] border border-[rgba(255,255,255,0.08)] rounded-md text-[#f7f8f8] placeholder-[#62666d] focus:outline-none focus:border-[#5e6ad2] focus:ring-1 focus:ring-[#5e6ad2]/30 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleImport()}
                />
                <p className="text-[11px] text-[#62666d] mt-1.5">
                  Paste a raw GitHub URL to a SKILL.md file to import it
                </p>
              </div>

              {importError && (
                <div className="px-3 py-2 rounded-md bg-[rgba(235,69,69,0.1)] border border-[rgba(235,69,69,0.2)] text-xs text-[#eb4545]">
                  {importError}
                </div>
              )}
              {importSuccess && (
                <div className="px-3 py-2 rounded-md bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.2)] text-xs text-[#10b981]">
                  {importSuccess}
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={importing || !importUrl.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-[#5e6ad2] hover:bg-[#828fff] disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                {importing ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Import Skill
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkillRow({
  skill,
  toggling,
  deleting,
  onToggle,
  onDelete,
  noDescriptionLabel,
}: SkillRowProps) {
  return (
    <div className="group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
      <div className="pt-0.5 shrink-0">
        <Switch
          checked={skill.enabled}
          onCheckedChange={onToggle}
          disabled={toggling}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`font-mono-ui text-sm ${
              skill.enabled ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {skill.name}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {skill.description || noDescriptionLabel}
        </p>
      </div>
      {skill.is_custom && (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-red-500/20 text-red-400/60 hover:text-red-400"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title={`Delete ${skill.name}`}
          disabled={deleting}
        >
          <Trash className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function PanelItem({ active, icon: Icon, label, onClick }: PanelItemProps) {
  return (
    <ListItem
      active={active}
      onClick={onClick}
      className={cn(
        "rounded-sm whitespace-nowrap px-2.5 py-1.5",
        "font-mondwest text-[0.7rem] tracking-[0.08em] uppercase",
        active && "bg-foreground/90 text-background hover:text-background",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
    </ListItem>
  );
}

interface PanelItemProps {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}

interface SkillRowProps {
  noDescriptionLabel: string;
  onToggle: () => void;
  onDelete: () => void;
  skill: SkillInfo;
  toggling: boolean;
  deleting: boolean;
}

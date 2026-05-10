/**
 * Settings page — agent config, system info, tunnel status, and quick-access controls.
 * Shows real-time Hermes configuration, Docker info, cloudflared tunnel,
 * and interactive controls for commonly-used settings.
 */
import { useEffect, useState } from "react";
import { Cpu, Globe, HardDrive, Monitor, RefreshCw, Save, Shield, Zap, Palette } from "lucide-react";
import { H2 } from "@/components/NouiTypography";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { api } from "@/lib/api";
import { Toast } from "@/components/Toast";
import { useToast } from "@/hooks/useToast";
import { useTheme, type ThemeName, THEMES } from "@/context/ThemeContext";

interface AgentConfig {
  agents?: { defaults?: Record<string, unknown> };
  providers?: Record<string, Record<string, unknown>>;
  channels?: Record<string, unknown>;
  version?: string;
}

interface DockerInfo {
  ServerVersion?: string;
  OSType?: string;
  Architecture?: string;
  MemTotal?: number;
  NCPU?: number;
  Containers?: number;
  ContainersRunning?: number;
  Images?: number;
}

interface TunnelInfo {
  tunnel_id: string;
  url: string;
  connected: boolean | null;
}

interface DbHealth {
  ok: boolean;
  source: string;
}

interface StatusData {
  gateway_running?: boolean;
  version?: string;
  started_at?: number;
}

/** Quick-access setting field for boolean toggles */
function SettingToggle({
  label,
  description,
  value,
  onChange,
  saving,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[11px] font-semibold text-[#111827]">{label}</span>
        {description && (
          <span className="text-[10px] text-[#6b7280]">{description}</span>
        )}
      </div>
      <Switch
        checked={value}
        onCheckedChange={onChange}
        disabled={saving}
        className="shrink-0"
      />
    </div>
  );
}

/** Quick-access setting field for string/number inputs */
function SettingInput({
  label,
  description,
  value,
  onChange,
  type = "text",
  placeholder,
  saving,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  saving: boolean;
}) {
  return (
    <div className="grid gap-1 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[#111827]">{label}</span>
      </div>
      {description && (
        <span className="text-[9px] text-[#6b7280]">{description}</span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={saving}
        className="input-bento"
      />
    </div>
  );
}

function bytesToGB(b: number): string {
  return (b / 1024 / 1024 / 1024).toFixed(1);
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof Monitor; children: React.ReactNode }) {
  return (
    <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm">
      <div className="flex items-center gap-2 pb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-bold text-[#111827]">{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SettingRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-[#6b7280]">{label}</span>
      <span className={`text-[10px] font-mono ${accent ?? 'text-[#6b7280]'}`}>{value}</span>
    </div>
  );
}

function LoadingSpinner() {
  return <RefreshCw className="w-4 h-4 animate-spin text-[#9CA3AF]" />;
}

/** Theme Picker — lets users switch between available themes */
function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="bento-card bg-[#FFFBF5] border border-[#F0E6D8] rounded-2xl p-5 shadow-bento-sm mb-4">
      <div className="flex items-center gap-2 pb-3">
        <Palette className="w-4 h-4 text-[#6B7280]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#6B7280]">Theme</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {THEMES.map((t) => (
          <button
            key={t.name}
            onClick={() => setTheme(t.name as ThemeName)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              theme === t.name
                ? 'bg-[#FAD4C0] text-[#111827] shadow-sm'
                : 'bg-[#FFF5E6] text-[#6B7280] hover:bg-[#F0E6D8]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [agentCfg, setAgentCfg] = useState<AgentConfig | null>(null);
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null);
  const [tunnel, setTunnel] = useState<TunnelInfo | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealth | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();

  // Quick-access editable settings (derived from agentCfg)
  const [sendProgress, setSendProgress] = useState(true);
  const [timezone, setTimezone] = useState("");
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsModified, setSettingsModified] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [cfgRes, dockerRes, tunnelRes, dbRes, statusRes] = await Promise.all([
        fetch("/api/agent/config").catch(() => null),
        fetch("/api/docker/info").catch(() => null),
        fetch("/api/tunnel").catch(() => null),
        fetch("/api/db/health").catch(() => null),
        fetch("/api/status").catch(() => null),
      ]);
      if (cfgRes?.ok) {
        const cfg = await cfgRes.json();
        setAgentCfg(cfg);
        // Initialize quick-access fields from loaded config
        const ch = cfg.channels ?? {};
        setSendProgress(ch.sendProgress !== false);
        const ag = cfg.agents?.defaults ?? {};
        setTimezone(String(ag.timezone ?? ""));
        setTemperature(ag.temperature != null ? (Math.round(Number(ag.temperature) * 100) / 100).toString() : "");
        setMaxTokens(ag.maxTokens != null ? String(ag.maxTokens) : "");
      }
      if (dockerRes?.ok) setDockerInfo(await dockerRes.json());
      if (tunnelRes?.ok) setTunnel(await tunnelRes.json());
      if (dbRes?.ok) setDbHealth(await dbRes.json());
      if (statusRes?.ok) setStatus(await statusRes.json());
    } finally {
      setLoading(false);
      setSettingsModified(false);
    }
  }

  // Persist quick-access settings back to the agent config
  async function saveQuickSettings() {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        channels: { sendProgress },
        agents: {
          defaults: {
            ...(agentCfg?.agents?.defaults ?? {}),
            timezone: timezone || undefined,
            temperature: temperature !== "" ? Number(temperature) : undefined,
            maxTokens: maxTokens !== "" ? Number(maxTokens) : undefined,
          },
        },
      };
      await api.saveConfig(updates);
      showToast("Settings saved", "success");
      setSettingsModified(false);
      await load();
    } catch (e) {
      showToast(`Save failed: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, []);

  function markModified() { setSettingsModified(true); }

  if (loading && !agentCfg && !dockerInfo) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 bg-[#FFF5E6]">
        <div className="bento-card rounded-2xl p-8 flex flex-col items-center gap-3">
          <LoadingSpinner />
          <p className="text-[12px] text-[#6b7280]">Loading settings...</p>
        </div>
      </div>
    );
  }

  const defaults = agentCfg?.agents?.defaults as Record<string, unknown> | undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FFF5E6]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0E6D8] shrink-0 bg-[#FFFBF5]">
        <div>
          <H2 variant="xl" className="text-[#111827]">Settings</H2>
          <H2 variant="sm" className="text-[#6b7280]">
            Agent configuration & system overview
          </H2>
        </div>
        <div className="flex items-center gap-2">
          {settingsModified && (
            <button
              onClick={saveQuickSettings}
              disabled={saving}
              className="btn-bento-primary text-[11px] flex items-center gap-1.5"
            >
              <Save className="w-3 h-3" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
          <button
            onClick={load}
            className="btn-bento-secondary text-[11px] flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-[#FFF5E6]">
        {/* ── Theme Picker ── */}
        <ThemePicker />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">

          {/* ── Quick-access Agent Settings (interactive) ── */}
          <SectionCard title="Agent Settings" icon={Zap}>
            <div className="space-y-0">
              <SettingToggle
                label="Send Progress"
                description="Report task progress to channels"
                value={sendProgress}
                onChange={(v) => { setSendProgress(v); markModified(); }}
                saving={saving}
              />
              <SettingInput
                label="Timezone"
                description="IANA timezone (e.g. America/New_York)"
                value={timezone}
                onChange={(v) => { setTimezone(v); markModified(); }}
                placeholder="UTC, America/New_York, Europe/London..."
                saving={saving}
              />
              <SettingInput
                label="Temperature"
                description="Sampling temperature (0.0–2.0, lower = more deterministic)"
                value={temperature}
                onChange={(v) => { setTemperature(v); markModified(); }}
                type="number"
                placeholder="0.7"
                saving={saving}
              />
              <SettingInput
                label="Max Tokens"
                description="Maximum tokens in response (blank = provider default)"
                value={maxTokens}
                onChange={(v) => { setMaxTokens(v); markModified(); }}
                type="number"
                placeholder="8192"
                saving={saving}
              />
            </div>
          </SectionCard>

          {/* ── Agent config (read-only summary) ── */}
          <SectionCard title="Agent Configuration" icon={Zap}>
            {!agentCfg ? (
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#9CA3AF]">Unavailable</span></div>
            ) : (
              <>
                <SettingRow label="Provider" value={String(defaults?.provider ?? 'unknown')} />
                <SettingRow label="Model" value={String(defaults?.model ?? 'unknown')} />
                <SettingRow label="Temperature" value={String(defaults?.temperature ?? '—')} />
                <SettingRow label="Max Tokens" value={String(defaults?.maxTokens ?? '—')} />
                <SettingRow label="Timezone" value={String(defaults?.timezone ?? '—')} />
                <SettingRow label="Workspace" value={String(defaults?.workspace ?? '—')} />
                {agentCfg.channels && (
                  <SettingRow label="Send Progress" value={String(agentCfg.channels.sendProgress ?? '—')} />
                )}
              </>
            )}
          </SectionCard>

          {/* ── System info ── */}
          <SectionCard title="System Resources" icon={Cpu}>
            {!dockerInfo ? (
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#9CA3AF]">Unavailable</span></div>
            ) : (
              <>
                <SettingRow label="Docker Version" value={dockerInfo.ServerVersion ?? '—'} />
                <SettingRow label="OS" value={dockerInfo.OSType ?? '—'} />
                <SettingRow label="Arch" value={dockerInfo.Architecture ?? '—'} />
                <SettingRow label="CPU Cores" value={String(dockerInfo.NCPU ?? '—')} />
                <SettingRow label="Total Memory" value={`${bytesToGB(dockerInfo.MemTotal ?? 0)} GB`} />
                <SettingRow label="Containers" value={`${dockerInfo.ContainersRunning ?? 0} / ${dockerInfo.Containers ?? 0}`} />
                <SettingRow label="Images" value={String(dockerInfo.Images ?? '—')} />
              </>
            )}
          </SectionCard>

          {/* ── Tunnel status ── */}
          <SectionCard title="Cloudflare Tunnel" icon={Globe}>
            {!tunnel ? (
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#9CA3AF]">Loading...</span></div>
            ) : (
              <>
                <SettingRow
                  label="Status"
                  value={tunnel.connected === true ? 'Connected' : tunnel.connected === false ? 'Disconnected' : 'Unknown'}
                  accent={tunnel.connected === true ? 'text-[#16A34A]' : tunnel.connected === false ? 'text-[#DC2626]' : 'text-[#D97706]'}
                />
                <SettingRow label="Tunnel ID" value={tunnel.tunnel_id ?? '—'} />
                <SettingRow label="URL" value={tunnel.url ?? '—'} />
              </>
            )}
          </SectionCard>

          {/* ── Database ── */}
          <SectionCard title="Database" icon={HardDrive}>
            {!dbHealth ? (
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#9CA3AF]">Loading...</span></div>
            ) : (
              <>
                <SettingRow
                  label="PostgreSQL"
                  value={dbHealth.ok ? 'Connected' : 'Disconnected'}
                  accent={dbHealth.ok ? 'text-[#16A34A]' : 'text-[#DC2626]'}
                />
                <SettingRow label="Source" value={dbHealth.source ?? '—'} />
                <SettingRow
                  label="Gateway"
                  value={status?.gateway_running ? 'Online' : 'Offline'}
                  accent={status?.gateway_running ? 'text-[#16A34A]' : 'text-[#DC2626]'}
                />
              </>
            )}
          </SectionCard>

          {/* ── Gateway / backend status ── */}
          <SectionCard title="Backend Status" icon={Monitor}>
            {!status ? (
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#9CA3AF]">Loading...</span></div>
            ) : (
              <>
                <SettingRow label="Version" value={status.version ?? '—'} />
                <SettingRow label="Gateway" value={status.gateway_running ? 'Running' : 'Stopped'} accent={status.gateway_running ? 'text-[#16A34A]' : 'text-[#DC2626]'} />
                {status.started_at && (
                  <SettingRow
                    label="Uptime"
                    value={`${Math.floor((Date.now() - status.started_at) / 86400000)}d ${Math.floor(((Date.now() - status.started_at) % 86400000) / 3600000)}h`}
                  />
                )}
              </>
            )}
          </SectionCard>

          {/* ── Security notice ── */}
          <SectionCard title="Security" icon={Shield}>
            <div className="space-y-1.5">
              <p className="text-[11px] text-[#6b7280]">
                API keys are redacted in the agent config above.
              </p>
              <p className="text-[11px] text-[#6b7280]">
                WebSocket connections from external clients may be blocked by Cloudflare's bot protection on free-tier tunnels.
              </p>
            </div>
          </SectionCard>

        </div>
      </div>

      <Toast toast={toast} />
    </div>
  );
}

/**
 * Settings page — agent config, system info, tunnel status, and quick-access controls.
 * Shows real-time nanobot configuration, Docker info, cloudflared tunnel,
 * and interactive controls for commonly-used settings.
 */
import { useEffect, useState } from "react";
import { Cpu, Globe, HardDrive, Monitor, RefreshCw, Save, Shield, Zap } from "lucide-react";
import { H2 } from "@/components/NouiTypography";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { api } from "@/lib/api";
import { Toast } from "@/components/Toast";
import { useToast } from "@/hooks/useToast";

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
        <span className="text-[10px] font-medium text-[#e8e6e3]">{label}</span>
        {description && (
          <span className="text-[9px] text-[#6b7280]">{description}</span>
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
        <span className="text-[10px] font-medium text-[#e8e6e3]">{label}</span>
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
        className="w-full bg-[#1f2937] border border-[#374151] rounded px-2 py-1 text-[10px] text-[#e8e6e3] placeholder:text-[#4b5563] focus:outline-none focus:border-[#3b82f6] disabled:opacity-50"
      />
    </div>
  );
}

function bytesToGB(b: number): string {
  return (b / 1024 / 1024 / 1024).toFixed(1);
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof Monitor; children: React.ReactNode }) {
  return (
    <Card className="bg-[#111827] border-[#1f2937]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-[11px] font-semibold text-[#e8e6e3]">
          <Icon className="w-4 h-4 text-[#3b82f6]" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  );
}

function SettingRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] text-[#6b7280]">{label}</span>
      <span className={`text-[10px] font-mono ${accent ?? 'text-[#9ca3af]'}`}>{value}</span>
    </div>
  );
}

function LoadingSpinner() {
  return <RefreshCw className="w-4 h-4 animate-spin text-[#4b5563]" />;
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
        setTemperature(ag.temperature != null ? String(ag.temperature) : "");
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
      <div className="flex flex-col h-full items-center justify-center gap-3">
        <LoadingSpinner />
        <p className="text-[11px] text-[#6b7280]">Loading settings...</p>
      </div>
    );
  }

  const defaults = agentCfg?.agents?.defaults as Record<string, unknown> | undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] shrink-0">
        <div>
          <H2 variant="xl" className="text-[#e8e6e3]">Settings</H2>
          <H2 variant="sm" className="text-[#6b7280]">
            Agent configuration & system overview
          </H2>
        </div>
        <div className="flex items-center gap-2">
          {settingsModified && (
            <button
              onClick={saveQuickSettings}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3b82f6] hover:bg-[#2563eb] border border-[#3b82f6] hover:border-[#2563eb] rounded-lg text-[10px] text-white transition-all disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f2937] hover:bg-[#374151] border border-[#1f2937] hover:border-[#4b5563] rounded-lg text-[10px] text-[#9ca3af] transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
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
              />
              <SettingInput
                label="Temperature"
                description="Sampling temperature (0.0–2.0, lower = more deterministic)"
                value={temperature}
                onChange={(v) => { setTemperature(v); markModified(); }}
                type="number"
                placeholder="0.7"
              />
              <SettingInput
                label="Max Tokens"
                description="Maximum tokens in response (blank = provider default)"
                value={maxTokens}
                onChange={(v) => { setMaxTokens(v); markModified(); }}
                type="number"
                placeholder="8192"
              />
            </div>
          </SectionCard>

          {/* ── Agent config (read-only summary) ── */}
          <SectionCard title="Agent Configuration" icon={Zap}>
            {!agentCfg ? (
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#4b5563]">Unavailable</span></div>
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
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#4b5563]">Unavailable</span></div>
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
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#4b5563]">Loading...</span></div>
            ) : (
              <>
                <SettingRow
                  label="Status"
                  value={tunnel.connected === true ? 'Connected' : tunnel.connected === false ? 'Disconnected' : 'Unknown'}
                  accent={tunnel.connected === true ? 'text-[#10b981]' : tunnel.connected === false ? 'text-[#ef4444]' : 'text-[#f59e0b]'}
                />
                <SettingRow label="Tunnel ID" value={tunnel.tunnel_id ?? '—'} />
                <SettingRow label="URL" value={tunnel.url ?? '—'} />
              </>
            )}
          </SectionCard>

          {/* ── Database ── */}
          <SectionCard title="Database" icon={HardDrive}>
            {!dbHealth ? (
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#4b5563]">Loading...</span></div>
            ) : (
              <>
                <SettingRow
                  label="PostgreSQL"
                  value={dbHealth.ok ? 'Connected' : 'Disconnected'}
                  accent={dbHealth.ok ? 'text-[#10b981]' : 'text-[#ef4444]'}
                />
                <SettingRow label="Source" value={dbHealth.source ?? '—'} />
                <SettingRow
                  label="Gateway"
                  value={status?.gateway_running ? 'Online' : 'Offline'}
                  accent={status?.gateway_running ? 'text-[#10b981]' : 'text-[#ef4444]'}
                />
              </>
            )}
          </SectionCard>

          {/* ── Gateway / backend status ── */}
          <SectionCard title="Backend Status" icon={Monitor}>
            {!status ? (
              <div className="flex items-center gap-2 py-2"><LoadingSpinner /><span className="text-[10px] text-[#4b5563]">Loading...</span></div>
            ) : (
              <>
                <SettingRow label="Version" value={status.version ?? '—'} />
                <SettingRow label="Gateway" value={status.gateway_running ? 'Running' : 'Stopped'} accent={status.gateway_running ? 'text-[#10b981]' : 'text-[#ef4444]'} />
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
              <p className="text-[10px] text-[#6b7280]">
                API keys are redacted in the agent config above.
              </p>
              <p className="text-[10px] text-[#6b7280]">
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

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import http from 'http';
import { execSync } from 'child_process';

// Raise global HTTP agent max sockets to handle concurrent nanobot chat requests.
// Default maxSockets=5 is too low; 50 allows multi-user concurrency without exhaustion.
http.globalAgent.maxSockets = 50;

// Timeout wrapper for fetch calls to nanobot — AbortController ensures no indefinite hangs.
async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 60_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import Docker from 'dockerode';
import { Pool } from 'pg';
import cronParser from 'cron-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ── DB Migrations ────────────────────────────────────────────────────────────
// Runs all unapplied .sql migrations from infra/postgres/migrations/ on startup.
// Idempotent: tracks applied versions in schema_migrations table.
async function runMigrations(): Promise<void> {
  if (!pgPool) { console.log('[pg] No pool — skipping migrations'); return; }
  try {
    const migrationFiles = ['001_initial.sql','002_observability_tables.sql','003_dashboard_sessions.sql','004_pg_cron_jobs.sql','005_skill_settings.sql','006_profiles_soul.sql','007_optimize_queries.sql','008_fix_indexes.sql'];
    for (const file of migrationFiles) {
      // Check if already applied
      const { rows } = await pgPool!.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name=$1) AS exists`,
        [file]
      );
      if (rows[0]?.exists) { console.log(`[pg] Migration ${file} already applied`); continue; }
      // Read and execute migration file from mounted repo
      const filePath = path.join('/opt/agent-os', 'infra', 'postgres', 'migrations', file);
      const sql = await fs.promises.readFile(filePath, 'utf8');
      await pgPool!.query(sql);
      await pgPool!.query(`INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
      console.log(`[pg] Applied migration: ${file}`);
    }
  } catch (err) {
    console.error('[pg] Migration error:', err);
  }
}

// PostgreSQL connection pool — only created if DATABASE_URL is set
let pgPool: Pool | null = null;
if (process.env.DATABASE_URL) {
  try {
    pgPool = new Pool({ connectionString: process.env.DATABASE_URL });
    pgPool.on('error', (err) => console.error('[pg] Unexpected pool error:', err));
    console.log('[pg] PostgreSQL pool initialized');
  } catch (err) {
    console.warn('[pg] Failed to create pool, database features disabled:', err);
  }
}

// Run migrations after pool is ready
if (pgPool) runMigrations().catch(console.error);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ── Self-updating deploy: poll GHCR for new image digest ─────────────────
let currentDigest = '';
let lastCheckedAt: Date | null = null;
let isUpdating = false;

async function getRemoteDigest(): Promise<string | null> {
  try {
    // Use docker -H to access host Docker socket so GHCR is reachable
    const { execSync } = await import('child_process');
    const out = execSync(
      '/usr/bin/docker -H unix:///var/run/docker.sock pull ghcr.io/chonsong/agent-os:latest 2>&1'
    ).toString();
    // Docker outputs "Status: Image is up to date" or "Digest: sha256:..."
    const digestMatch = out.match(/Digest:\s*(sha256:[a-f0-9]+)/);
    if (digestMatch) return digestMatch[1];
    // Also check via docker inspect on the pulled image
    const inspectOut = execSync(
      '/usr/bin/docker -H unix:///var/run/docker.sock inspect ghcr.io/chonsong/agent-os:latest --format "{{index .RepoDigests 0}}" 2>/dev/null'
    ).toString().trim();
    const digestPart = inspectOut.match(/@(sha256:[a-f0-9]+)/);
    return digestPart ? digestPart[1] : null;
  } catch {
    return null;
  }
}

async function checkForUpdate(): Promise<{ hasUpdate: boolean; newDigest: string | null }> {
  const remoteDigest = await getRemoteDigest();
  if (!remoteDigest) return { hasUpdate: false, newDigest: null };
  return {
    hasUpdate: remoteDigest !== currentDigest,
    newDigest: remoteDigest,
  };
}

async function performUpdate(): Promise<void> {
  if (isUpdating) return;
  isUpdating = true;
  console.log('[deploy] New image detected, triggering update via sentinel...');
  try {
    const fs = await import('fs');
    fs.writeFileSync('/dev/shm/agent-os-deploy-trigger', new Date().toISOString());
    console.log('[deploy] Sentinel written to /dev/shm — host cron will handle pull+recreate');
  } finally {
    isUpdating = false;
  }
}

function startDeployPolling(intervalMs = 60_000): void {
  // Initial check on startup
  getRemoteDigest().then(digest => {
    if (digest) {
      currentDigest = digest;
      console.log(`[deploy] Watching ghcr.io/chonsong/agent-os:latest @ ${digest.slice(0, 16)}...`);
    }
  });

  setInterval(async () => {
    if (isUpdating) return;
    lastCheckedAt = new Date();
    const { hasUpdate, newDigest } = await checkForUpdate();
    if (hasUpdate && newDigest) {
      console.log(`[deploy] Digest changed: ${currentDigest.slice(0, 16)} → ${newDigest.slice(0, 16)}`);
      currentDigest = newDigest;
      await performUpdate();
    }
  }, intervalMs);
}

// ── Cron Scheduler (PostgreSQL-backed) ───────────────────────────────────────
// Loads jobs from PostgreSQL, schedules setTimeout timers for each, updates
// last_run_at/next_run_at after each execution. Pause/resume/trigger endpoints
// manage the timers in memory.

interface ScheduledJob {
  id: string;
  timer: ReturnType<typeof setTimeout> | null;
  nextRunAt: Date | null;
}

// In-memory scheduler state
const scheduledJobs = new Map<string, ScheduledJob>();
const SCHEDULE_CHECK_MS = 30_000; // re-check schedule every 30s (for newly added jobs)

function getNextRun(expr: string): Date | null {
  try {
    return cronParser.parseExpression(expr).next().toDate();
  } catch {
    return null;
  }
}

async function executeCronJob(jobId: string, prompt: string): Promise<void> {
  if (!pgPool) return;
  try {
    await pgPool.query(
      `UPDATE cron_jobs SET state='running', last_run_at=NOW() WHERE id=$1`,
      [jobId]
    );
    // Call nanobot chat to execute the task
    const nanobotUrl = process.env.NANOBOT_API_URL || 'http://nanobot:8900';
    const response = await fetch(`${nanobotUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
    });
    if (!response.ok) throw new Error(`Nanobot returned ${response.status}`);
    await pgPool.query(
      `UPDATE cron_jobs SET state='idle', next_run_at=$1 WHERE id=$2`,
      [getNextRunFromDb(jobId)?.toISOString() ?? null, jobId]
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await pgPool.query(
      `UPDATE cron_jobs SET state='error', last_error=$1 WHERE id=$2`,
      [msg, jobId]
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNextRunFromDb(jobId: string): Date | null {
  return null; // implemented below using pgPool
}

let scheduleCheckTimer: ReturnType<typeof setInterval> | null = null;

async function loadAndScheduleJobs(): Promise<void> {
  if (!pgPool) return;
  try {
    const { rows } = await pgPool.query(
      `SELECT id, prompt, schedule_expr, enabled, state FROM cron_jobs WHERE enabled=true AND state!='paused'`
    );
    for (const job of rows) {
      await scheduleJob(job.id, job.prompt, job.schedule_expr);
    }
  } catch { /* ignore */ }
}

async function scheduleJob(id: string, prompt: string, expr: string): Promise<void> {
  // Cancel existing timer if any
  const existing = scheduledJobs.get(id);
  if (existing?.timer) { clearTimeout(existing.timer); existing.timer = null; }

  const next = getNextRun(expr);
  if (!next) return;

  const delay = next.getTime() - Date.now();
  const timer = setTimeout(async () => {
    await executeCronJob(id, prompt);
    // Re-schedule
    scheduledJobs.delete(id);
    await scheduleJob(id, prompt, expr);
  }, Math.max(delay, 0));

  const entry: ScheduledJob = { id, timer, nextRunAt: next };
  scheduledJobs.set(id, entry);

  // Persist next_run_at to DB
  if (pgPool) {
    try {
      await pgPool.query(
        `UPDATE cron_jobs SET next_run_at=$1 WHERE id=$2`,
        [next.toISOString(), id]
      );
    } catch { /* ignore */ }
  }
}

async function unscheduleJob(id: string): Promise<void> {
  const entry = scheduledJobs.get(id);
  if (entry?.timer) { clearTimeout(entry.timer); }
  scheduledJobs.delete(id);
}

async function initializeScheduler(): Promise<void> {
  await loadAndScheduleJobs();
  // Periodically check for new/updated jobs (every 30s)
  scheduleCheckTimer = setInterval(async () => {
    if (!pgPool) return;
    try {
      const { rows } = await pgPool.query(
        `SELECT id, prompt, schedule_expr, enabled, state FROM cron_jobs WHERE enabled=true AND state!='paused'`
      );
      for (const job of rows) {
        if (!scheduledJobs.has(job.id)) {
          await scheduleJob(job.id, job.prompt, job.schedule_expr);
        }
      }
      // Unschedule jobs that are no longer enabled
      for (const [id] of scheduledJobs) {
        if (!rows.find(r => r.id === id)) {
          await unscheduleJob(id);
        }
      }
    } catch { /* ignore */ }
  }, SCHEDULE_CHECK_MS);
}

// Start polling after server is fully up
setTimeout(() => { startDeployPolling(); initializeScheduler(); }, 5_000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve static frontend files
const staticPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(staticPath));

// ── In-memory data store (persists while container runs) ─────────────────────
interface CronJobRecord {
  id: string;
  name?: string;
  prompt: string;
  schedule_kind: string;
  schedule_expr: string;
  schedule_display: string;
  enabled: boolean;
  state: string;
  deliver?: string;
  last_run_at?: string | null;
  next_run_at?: string | null;
  last_error?: string | null;
}

interface EnvVarRecord {
  is_set: boolean;
  redacted_value: string | null;
  description: string;
  url: string | null;
  category: string;
  is_password: boolean;
  tools: string[];
  advanced: boolean;
}

interface ProfileRecord {
  name: string;
  path: string;
  is_default: boolean;
  model: string | null;
  provider: string | null;
  has_env: boolean;
  skill_count: number;
}

interface SkillRecord {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  is_custom: boolean;
}

interface ToolsetRecord {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
}

interface PluginRecord {
  name: string;
  version: string;
  enabled: boolean;
}

interface SessionRecord {
  id: string;
  source: string | null;
  model: string | null;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  last_active: number;
  is_active: boolean;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  preview: string | null;
}

interface ThemeRecord {
  current: string;
  available: Array<{ id: string; label: string; primary: string; secondary: string }>;
}

interface ConfigRecord {
  theme: string;
  language: string;
  timezone: string;
  model: string;
  provider: string;
}

const store: {
  sessions: SessionRecord[];
  cronJobs: CronJobRecord[];
  envVars: Record<string, EnvVarRecord>;
  profiles: ProfileRecord[];
  skills: SkillRecord[];
  config: ConfigRecord;
  toolsets: ToolsetRecord[];
  themes: ThemeRecord;
  plugins: PluginRecord[];
} = {
  sessions: [
    {
      id: 'demo-session-1',
      source: 'chat',
      model: 'claude-3-5-sonnet-20241022',
      title: 'Demo Session',
      started_at: Date.now() - 3600000,
      ended_at: null,
      last_active: Date.now(),
      is_active: true,
      message_count: 12,
      tool_call_count: 3,
      input_tokens: 1847,
      output_tokens: 2341,
      preview: 'How do I configure the dashboard?',
    },
  ],
  cronJobs: [
    {
      id: 'cron-1',
      name: 'Morning Briefing',
      prompt: 'Generate morning briefing',
      schedule_kind: 'cron',
      schedule_expr: '0 9 * * *',
      schedule_display: 'Daily at 9:00 AM',
      enabled: true,
      state: 'idle',
      deliver: undefined,
      last_run_at: null,
      next_run_at: new Date(Date.now() + 9 * 3600000).toISOString(),
      last_error: null,
    },
  ],
  envVars: {
    OPENAI_API_KEY: {
      is_set: true,
      redacted_value: 'sk-***',
      description: 'OpenAI API key for GPT models',
      url: 'https://platform.openai.com',
      category: 'providers',
      is_password: true,
      tools: ['chat', 'completion'],
      advanced: false,
    },
    ANTHROPIC_API_KEY: {
      is_set: false,
      redacted_value: null,
      description: 'Anthropic API key for Claude models',
      url: 'https://console.anthropic.com',
      category: 'providers',
      is_password: true,
      tools: ['chat'],
      advanced: false,
    },
  } as Record<string, { is_set: boolean; redacted_value: string | null; description: string; url: string | null; category: string; is_password: boolean; tools: string[]; advanced: boolean }>,
  profiles: [
    {
      name: 'default',
      path: '/app/profiles/default',
      is_default: true,
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      has_env: true,
      skill_count: 14,
    },
  ],
  skills: [
    { name: 'coder', description: 'Code generation and review', category: 'development', enabled: true, is_custom: false },
    { name: 'researcher', description: 'Web and data research', category: 'research', enabled: true, is_custom: false },
    { name: 'planner', description: 'Task decomposition', category: 'productivity', enabled: true, is_custom: false },
    { name: 'journal', description: 'Daily journaling', category: 'productivity', enabled: false, is_custom: false },
  ],
  config: {
    theme: 'dark',
    language: 'en',
    timezone: 'Australia/Sydney',
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
  },
  toolsets: [
    { name: 'terminal', label: 'Terminal', description: 'Run shell commands', enabled: true, configured: true },
    { name: 'browser', label: 'Browser', description: 'Web browsing and automation', enabled: true, configured: true },
    { name: 'file', label: 'File System', description: 'Read, write, and manage files', enabled: true, configured: true },
  ],
  themes: {
    current: 'dark',
    available: [
      { id: 'dark', label: 'Dark', primary: '#6366f1', secondary: '#8b5cf6' },
      { id: 'light', label: 'Light', primary: '#6366f1', secondary: '#8b5cf6' },
      { id: 'midnight', label: 'Midnight', primary: '#0ea5e9', secondary: '#6366f1' },
    ],
  },
  plugins: [
    { name: 'docker-widget', version: '1.0.0', enabled: true },
    { name: 'system-stats', version: '1.0.0', enabled: true },
  ],
};

// Load skills from disk (after store is initialized, after migrations run)
if (pgPool) { runMigrations().then(() => loadSkillsFromDisk()).catch(console.error); }
else { loadSkillsFromDisk().catch(console.error); }

// ── Dynamic Skill Loader ─────────────────────────────────────────────────────
// Loads skill metadata from SKILL.md files on disk (bundled in container).
// Merges with persisted enable/disable state from PostgreSQL.

async function loadSkillsFromDisk(): Promise<void> {
  const diskSkills: SkillRecord[] = [];
  // Scan both the nanobot container's skills dir and the host-backed custom-skills dir.
  // /app/packages/nanobot/nanobot/skills is inside the nanobot container image (read-only).
  // /root/.nanobot/custom-skills is the host-mounted volume (read-write, backed by /home/sean/.nanobot/custom-skills).
  const skillsRoots = ['/app/packages/nanobot/nanobot/skills', '/root/.nanobot/custom-skills'];
  for (const skillsPath of skillsRoots) {
    try {
      const entries = await fs.promises.readdir(skillsPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = path.join(skillsPath, entry.name, 'SKILL.md');
        try {
          const content = await fs.promises.readFile(skillPath, 'utf8');
          const frontmatter = content.split('---')[1] ?? '';
          const nameMatch = frontmatter.match(/name:\s*(.+)/i);
          const descMatch = frontmatter.match(/description:\s*(.+)/i);
          const name = nameMatch?.[1]?.trim() ?? entry.name;
          const description = descMatch?.[1]?.trim() ?? entry.name;
          diskSkills.push({ name, description, category: 'general', enabled: true, is_custom: skillsPath === '/root/.nanobot/custom-skills' });
        } catch { /* skip skills without SKILL.md */ }
      }
    } catch { /* skip missing roots (e.g. custom-skills if not yet created) */ }
  }
  console.log(`[skills] Loaded ${diskSkills.length} skills from disk`);

  // Merge with persisted state from PostgreSQL
  if (pgPool) {
    try {
      const { rows } = await pgPool.query('SELECT name, enabled FROM skill_settings');
      const persisted = new Map(rows.map(r => [r.name, r.enabled]));
      for (const skill of diskSkills) {
        if (persisted.has(skill.name)) skill.enabled = persisted.get(skill.name)!;
      }
    } catch { /* table may not exist yet */ }
  }

  store.skills = diskSkills;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const jsonOk = (res: express.Response, data?: unknown) =>
  res.json(typeof data === 'object' && data !== null ? data : { ok: true });

const jsonErr = (res: express.Response, status: number, msg: string) =>
  res.status(status).json({ error: msg });

// ── CasaOS Webhook Endpoint ────────────────────────────────────────────────
// Receives container state change events from webhook-emitter and stores
// them in PostgreSQL via the observability package.
// Also receives CasaOS events forwarded by the webhook-emitter.
app.post('/api/webhooks/casaos', async (req, res) => {
  const event = req.body;
  if (!event || !event.type) {
    res.status(400).json({ error: 'Missing event type' });
    return;
  }

  // Log the event
  console.log(`[webhook] CasaOS event: ${event.type} — ${event.name} → ${event.state}`);

  // Persist to PostgreSQL if available
  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO aie_events (session_id, type, data)
         VALUES (NULL, $1, $2)`,
        [event.type, JSON.stringify(event)]
      );
    } catch (err) {
      console.error('[webhook] Failed to persist CasaOS event:', err);
    }
  }

  // Broadcast to all connected WebSocket clients for real-time updates
  io.emit('events', { type: event.type, data: event, ts: new Date().toISOString() });

  // Echo back acknowledgment
  res.json({ received: true, event_type: event.type, timestamp: event.timestamp });
});

// ── Observability: Real usage data from PostgreSQL ─────────────────────────
// Replaces mock analytics with actual token/session data from the DB
app.get('/api/analytics/real', async (_req, res) => {
  if (!pgPool) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }

  try {
    // Real session + token data from PostgreSQL
    const [sessionsResult, eventsResult] = await Promise.all([
      pgPool.query(`
        SELECT
          id,
          session_key,
          created_at,
          metadata,
          (SELECT COUNT(*) FROM agent_messages WHERE session_id = agent_sessions.id) AS message_count,
          (SELECT COALESCE(SUM(LENGTH(content)), 0) FROM agent_messages WHERE session_id = agent_sessions.id) AS total_chars,
          (SELECT id FROM dashboard_sessions WHERE dashboard_sessions.id = agent_sessions.id::text LIMIT 1) IS NOT NULL AS is_dashboard_session
        FROM agent_sessions
        ORDER BY created_at DESC
        LIMIT 50
      `),
      pgPool.query(`
        SELECT
          type,
          COUNT(*) AS count,
          MIN(timestamp) AS first_seen,
          MAX(timestamp) AS last_seen
        FROM aie_events
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY type
        ORDER BY count DESC
      `),
    ]);

    res.json({
      sessions: sessionsResult.rows,
      event_breakdown: eventsResult.rows,
      source: 'postgresql',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Recent nanobot events (for live event timeline) ────────────────────────────
app.get('/api/events/recent', async (req, res) => {
  if (!pgPool) { jsonOk(res, []); return; }
  const limit = Math.min(parseInt(String(req.query.limit)) || 50, 200);
  try {
    const { rows } = await pgPool.query(
      `SELECT id, session_id, type, timestamp, data
       FROM aie_events
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit],
    );
    // Flatten data->name for instance_name
    const events = rows.map(r => ({
      id: String(r.id),
      session: r.session_id ? String(r.session_id) : null,
      type: r.type,
      ts: r.timestamp,
      name: r.data?.name ?? null,
      data: r.data,
    }));
    jsonOk(res, events);
  } catch (err) {
    jsonOk(res, []);
  }
});

// ── Deploy status (for monitoring the polling updater) ───────────────────
app.get('/api/deploy/status', (_req, res) => {
  res.json({
    polling: true,
    interval: '60s',
    currentDigest: currentDigest ? currentDigest.slice(0, 16) : null,
    lastCheckedAt: lastCheckedAt ? lastCheckedAt.toISOString() : null,
    isUpdating,
  });
});

// ── Agent lifecycle events (from nanobot AIEAgentHook via RemoteAIEventsLogger) ─
app.post('/api/events/agent', async (req, res) => {
  if (!pgPool) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }
  try {
    const body = req.body as { session_key?: string; event?: Record<string, unknown> };
    const { session_key, event } = body;
    if (!event) {
      res.status(400).json({ error: 'Missing event field' });
      return;
    }

    // Look up session_id from session_key
    let sessionId: string | null = null;
    if (session_key && session_key !== 'observability') {
      try {
        const sessResult = await pgPool.query(
          'SELECT id FROM agent_sessions WHERE session_key = $1 LIMIT 1',
          [session_key]
        );
        if (sessResult.rows.length > 0) {
          sessionId = sessResult.rows[0].id;
        }
      } catch {
        // session_key not found — leave null
      }
    }

    await pgPool.query(
      `INSERT INTO aie_events (session_id, type, data) VALUES ($1, $2, $3)`,
      [sessionId, (event.type as string) || 'unknown', JSON.stringify(event)]
    );
    res.json({ received: true, event_type: event.type, session_key });
  } catch (err) {
    console.error('[events/agent] Failed to persist agent event:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Webhook-triggered deploy ───────────────────────────────────────────
app.post('/api/deploy', express.text(), async (req, res) => {
  const deployToken = process.env.DEPLOY_TOKEN;
  const providedToken = typeof req.body === 'string' ? req.body.trim() : '';
  if (!deployToken || providedToken !== deployToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    console.log('[deploy] Webhook received — host cron handles actual deploy');
    res.json({ ok: true, received_at: new Date().toISOString() });
  } catch (err) {
    console.error('[deploy] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Database health ───────────────────────────────────────────────────────
app.get('/api/db/health', async (_req, res) => {
  if (!pgPool) {
    res.status(503).json({ error: 'Database not available' });
    return;
  }
  try {
    const result = await pgPool.query('SELECT 1 AS ok');
    res.json({ ok: result.rows[0].ok === 1, source: 'postgresql' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── System ───────────────────────────────────────────────────────────────────
app.get('/api/system/uptime', (_req, res) => {
  res.json({ uptime: process.uptime() });
});

// ── Cloudflare Tunnel ───────────────────────────────────────────────────────
app.get('/api/tunnel', async (_req, res) => {
  const TUNNEL_ID = process.env.CLOUDFLARED_TUNNEL_ID || 'fe36ddb5-cd10-46ac-8e89-b2763f845153';
  try {
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        const cp = require('child_process').execFile(
          '/usr/bin/cloudflared',
          ['tunnel', 'info', TUNNEL_ID, '--output-json'],
          { timeout: 8000 },
          (err: Error | null, stdout: string, stderr: string) => {
            if (err) reject(err);
            else resolve({ stdout, stderr });
          }
        );
      }
    );
    const info = JSON.parse(stdout);
    const url: string = info.tunnel?.connections?.[0]?.url || info.url || '';
    res.json({
      tunnel_id: TUNNEL_ID,
      url,
      connected: !!url,
    });
  } catch {
      // cloudflared not available in this container — return known static URL
      // NOTE: agent-os.chonsong.com DNS is managed separately; actual accessible URL is agent-os.codeovertcp.com
      res.json({
        tunnel_id: TUNNEL_ID,
        url: 'https://agent-os.codeovertcp.com',
        connected: null,  // unknown — cloudflared not accessible from here
      });
  }
});

// ── Status ──────────────────────────────────────────────────────────────────
app.get('/api/status', async (_req, res) => {
  try {
    const dockerInfo = await docker.info();
    const containers = await docker.listContainers({ all: true });
    jsonOk(res, {
      active_sessions: store.sessions.filter(s => s.is_active).length,
      config_path: '/app/config.yaml',
      config_version: 1,
      env_path: '/app/.env',
      gateway_exit_reason: null,
      gateway_health_url: 'http://localhost:8900/health',
      gateway_pid: null,
      gateway_platforms: {},
      gateway_running: true,
      gateway_state: 'running',
      gateway_updated_at: new Date().toISOString(),
      hermes_home: '/app',
      latest_config_version: 1,
      release_date: '2026-01-01',
      version: '1.0.0',
    });
  } catch {
    jsonOk(res, {
      active_sessions: store.sessions.filter(s => s.is_active).length,
      config_path: '/app/config.yaml',
      config_version: 1,
      env_path: '/app/.env',
      gateway_exit_reason: null,
      gateway_health_url: null,
      gateway_pid: null,
      gateway_platforms: {},
      gateway_running: false,
      gateway_state: null,
      gateway_updated_at: null,
      hermes_home: '/app',
      latest_config_version: 1,
      release_date: '2026-01-01',
      version: '1.0.0',
    });
  }
});

// ── Config ──────────────────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => jsonOk(res, store.config));
app.put('/api/config', async (req, res) => {
  const updates = req.body?.config ?? req.body ?? {};
  // Persist to nanobot config file if it exists (model/provider settings)
  const cfgPath = '/root/.nanobot/config.json';
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    let changed = false;
    if (updates.model || updates.provider) {
      cfg.agents = cfg.agents ?? {};
      cfg.agents.defaults = cfg.agents.defaults ?? {};
      if (updates.model) { cfg.agents.defaults.model = updates.model; changed = true; }
      if (updates.provider) { cfg.agents.defaults.provider = updates.provider; changed = true; }
    }
    if (changed) {
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    }
  } catch { /* non-critical if file not accessible */ }
  // Also update in-memory store for dashboard use
  store.config = { ...store.config, ...updates };
  jsonOk(res);
});
app.get('/api/config/defaults', (_req, res) => jsonOk(res, {
  theme: 'dark',
  language: 'en',
  timezone: 'UTC',
  model: 'claude-3-5-sonnet-20241022',
  provider: 'anthropic',
}));
app.get('/api/config/schema', (_req, res) => jsonOk(res, {
  fields: {
    theme: { type: 'string', enum: ['dark', 'light', 'midnight'] },
    language: { type: 'string' },
    timezone: { type: 'string' },
    model: { type: 'string' },
    provider: { type: 'string' },
  },
  category_order: ['general', 'model', 'appearance'],
}));
app.get('/api/config/raw', (_req, res) => jsonOk(res, { yaml: `# agent-os config\nversion: 1\n` }));
app.put('/api/config/raw', async (req, res) => {
  const yaml = req.body?.yaml ?? req.body?.yaml_text ?? '';
  const cfgPath = '/root/.nanobot/config.yaml';
  try { fs.writeFileSync(cfgPath, yaml); } catch { /* non-critical */ }
  jsonOk(res);
});

// ── Sessions (PostgreSQL-backed) ──────────────────────────────────────────────
app.get('/api/sessions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit)) || 20, 100);
    const offset = parseInt(String(req.query.offset)) || 0;
    const rows = await pgQuery(
    `SELECT
       s.id,
       s.title,
       s.created_at,
       s.updated_at AS last_active,
       COUNT(m.id) AS message_count,
       SUBSTRING(MAX(m.content) FROM 1 FOR 120) AS preview,
       EXTRACT(EPOCH FROM s.created_at)::bigint * 1000 AS started_at,
       CASE WHEN s.updated_at > NOW() - INTERVAL '5 minutes' THEN true ELSE false END AS is_active,
       'dashboard' AS source,
       NULL::text AS model,
       0 AS tool_call_count,
       0 AS input_tokens,
       0 AS output_tokens
     FROM dashboard_sessions s
     LEFT JOIN dashboard_messages m ON m.session_id = s.id AND m.role = 'user'
     GROUP BY s.id
     ORDER BY s.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
    );
    const countResult = await pgQuery('SELECT COUNT(*) FROM dashboard_sessions');
    jsonOk(res, { sessions: rows, total: parseInt(String((countResult[0] as {count:string})?.count ?? 0)), limit, offset });
  } catch (err) {
    console.error('Error fetching sessions:', err);
    jsonOk(res, { sessions: [], total: 0, limit: 20, offset: 0 });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await pgQuery('DELETE FROM dashboard_sessions WHERE id = $1', [req.params.id]);
    jsonOk(res, { ok: true });
  } catch (err) {
    console.error('Error deleting session:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

app.get('/api/sessions/:id/messages', async (req, res) => {
  try {
    const rows = await pgQuery(
      'SELECT id, role, content, model, tokens_used, metadata, created_at FROM dashboard_messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.id],
    );
    jsonOk(res, { session_id: req.params.id, messages: rows });
  } catch (err) {
    console.error('Error fetching messages:', err);
    jsonOk(res, { session_id: req.params.id, messages: [] });
  }
});

app.get('/api/sessions/search', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  if (!q) { jsonOk(res, { results: [], total: 0 }); return; }
  if (!pgPool) {
    const results = store.sessions.filter(s =>
      s.title?.toLowerCase().includes(q) || s.preview?.toLowerCase().includes(q)
    );
    jsonOk(res, { results, total: results.length });
    return;
  }
  try {
    const { rows } = await pgPool.query(
      `SELECT DISTINCT s.id, s.title, s.created_at, s.updated_at,
              m.content AS preview
       FROM dashboard_sessions s
       JOIN dashboard_messages m ON m.session_id = s.id
       WHERE LOWER(s.title) LIKE $1 OR LOWER(m.content) LIKE $1
       ORDER BY s.updated_at DESC
       LIMIT 20`,
      [`%${q}%`]
    );
    jsonOk(res, { results: rows, total: rows.length });
  } catch (err) {
    console.error('Session search error:', err);
    jsonOk(res, { results: [], total: 0 });
  }
});

// ── Logs ───────────────────────────────────────────────────────────────────
// ── Logs (Docker container logs) ───────────────────────────────────────────────
// Streams logs from agent-os containers + backend process output.
// Supports: lines (max), level (INFO/WARN/ERROR), component (container name).
async function getContainerLogs(containerName: string, lines: number): Promise<string[]> {
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    if (!info.State.Running) return [];
    const stream = await container.logs({
      stdout: true, stderr: true,
      since: 0, timestamps: true,
      tail: Math.min(lines, 500),
    });
    // Docker logs stream: 8-byte header per line on tty-enabled containers
    const buf = Buffer.from(stream);
    const lines_out: string[] = [];
    let offset = 0;
    while (offset < buf.length && lines_out.length < lines) {
      if (buf.length - offset < 8) { lines_out.push(buf.slice(offset).toString()); break; }
      const header = buf.slice(offset, offset + 8);
      const size = header.readUInt32BE(4);
      offset += 8;
      if (offset + size > buf.length) { lines_out.push(buf.slice(offset).toString()); break; }
      const line = buf.slice(offset, offset + size).toString();
      offset += size;
      // Strip timestamp prefix from docker timestamps (ISO 8601)
      const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s*([\s\S]*)/);
      if (tsMatch && tsMatch[2].trim()) lines_out.push(tsMatch[2].trim());
      else if (line.trim()) lines_out.push(line);
    }
    return lines_out;
  } catch { return []; }
}

// Container log stream handles — one per agent container, shared across socket connections
const containerStreams = new Map<string, NodeJS.ReadableStream>();
const AGENT_CONTAINERS = ['agent-os-backend', 'agent-os-nanobot', 'agent-os-webhook-emitter'];

function startLogStream(containerName: string, io: import('socket.io').Server) {
  if (containerStreams.has(containerName)) return;
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (!buffer) return;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    const now = new Date().toISOString();
    lines.forEach(msg => {
      if (!msg.trim()) return;
      let lvl = 'INFO';
      if (/\[ERROR\]|\[FATAL\]|error:|Error:/.test(msg)) lvl = 'ERROR';
      else if (/\[WARN\]|warn:|Warning:/.test(msg)) lvl = 'WARN';
      io.emit('log', {
        ts: now,
        level: lvl,
        component: containerName.replace('agent-os-', ''),
        msg: msg.trim().replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/, ''),
      });
    });
  };

  docker.getContainer(containerName).logs({
    stdout: true, stderr: true, follow: true, timestamps: true, tail: 0,
  }).then((stream: NodeJS.ReadableStream) => {
    containerStreams.set(containerName, stream);
    let buffer = '';
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      if (!buffer) return;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      const now = new Date().toISOString();
      lines.forEach(msg => {
        if (!msg.trim()) return;
        let lvl = 'INFO';
        if (/\[ERROR\]|\[FATAL\]|error:|Error:/.test(msg)) lvl = 'ERROR';
        else if (/\[WARN\]|warn:|Warning:/.test(msg)) lvl = 'WARN';
        io.emit('log', {
          ts: now, level: lvl,
          component: containerName.replace('agent-os-', ''),
          msg: msg.trim().replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s*/, ''),
        });
      });
    };

    stream.on('data', (chunk: Buffer) => {
      let offset = 0;
      const buf = Buffer.from(chunk);
      while (offset < buf.length) {
        if (buf.length - offset < 8) { buffer += buf.slice(offset).toString(); break; }
        const header = buf.slice(offset, offset + 8);
        const size = header.readUInt32BE(4);
        offset += 8;
        if (offset + size > buf.length) { buffer += buf.slice(offset).toString(); break; }
        const line = buf.slice(offset, offset + size).toString();
        offset += size;
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s*([\s\S]*)/);
        if (tsMatch && tsMatch[2].trim()) { buffer += tsMatch[2] + '\n'; }
        else if (line.trim()) { buffer += line + '\n'; }
      }
      if (!timer) timer = setTimeout(() => { flush(); timer = null; }, 500);
    });

    stream.on('end', () => { flush(); containerStreams.delete(containerName); });
    stream.on('error', () => { flush(); containerStreams.delete(containerName); });
  }).catch(() => { containerStreams.delete(containerName); });
}

function stopAllLogStreams() {
  for (const [name, stream] of containerStreams) {
    try { (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.(); } catch { /* ignore */ }
    containerStreams.delete(name);
  }
}

app.get('/api/logs', async (req, res) => {
  const lines = Math.min(parseInt(String(req.query.lines)) || 100, 500);
  const level = String(req.query.level || 'ALL').toUpperCase();
  const component = String(req.query.component || 'all').toLowerCase();
  const allLogs: Array<{ ts: string; level: string; component: string; msg: string }> = [];
  const sem = await Promise.allSettled(
    AGENT_CONTAINERS.map(async (name) => {
      const rawLines = await getContainerLogs(name, lines);
      const filtered = rawLines.filter(l => {
        if (level !== 'ALL' && !l.toUpperCase().includes(`[${level}]`)) return false;
        return true;
      });
      const now = new Date().toISOString();
      filtered.forEach(msg => {
        let lvl = 'INFO';
        if (/\[ERROR\]|\[FATAL\]|error:|Error:/.test(msg)) lvl = 'ERROR';
        else if (/\[WARN\]|warn:|Warning:/.test(msg)) lvl = 'WARN';
        if (level !== 'ALL' && lvl !== level) return;
        allLogs.push({ ts: now, level: lvl, component: name.replace('agent-os-', ''), msg });
      });
    })
  );
  if (sem.every(r => r.status === 'rejected')) {
    // Fallback: return demo data so UI isn't empty
    jsonOk(res, { file: 'docker', lines: Array.from({ length: Math.min(lines, 10) }, (_, i) => `[INFO] Demo log line ${i + 1}`) });
    return;
  }
  // Sort newest first (reverse since we appended oldest)
  allLogs.sort((a, b) => b.ts.localeCompare(a.ts));
  const out = allLogs.slice(0, lines).map(l => `${l.ts} [${l.level}] [${l.component}] ${l.msg}`);
  jsonOk(res, { file: 'docker', lines: out });
});

// ── Analytics (PostgreSQL-backed) ────────────────────────────────────────────
app.get('/api/analytics/usage', async (req, res) => {
  const days = parseInt(String(req.query.days)) || 7;
  const since = new Date(Date.now() - days * 86400000);
  if (!pgPool) { jsonOk(res, stubUsage(days)); return; }
  try {
    // Daily aggregates from real message tokens
    const { rows: daily } = await pgPool.query(
      `SELECT
        DATE(dm.created_at) AS day,
        COALESCE(SUM(dm.tokens_used), 0)::int AS total_tokens,
        COUNT(DISTINCT dm.session_id) AS sessions,
        COUNT(dm.id) AS api_calls
       FROM dashboard_messages dm
       WHERE dm.created_at >= $1
       GROUP BY DATE(dm.created_at)
       ORDER BY day ASC`, [since]
    );
    // Model breakdown
    const { rows: byModel } = await pgPool.query(
      `SELECT
        COALESCE(dm.model, 'unknown') AS model,
        COUNT(DISTINCT dm.session_id) AS sessions,
        COUNT(dm.id) AS api_calls,
        COALESCE(SUM(dm.tokens_used), 0)::int AS total_tokens
       FROM dashboard_messages dm
       WHERE dm.created_at >= $1 AND dm.model IS NOT NULL
       GROUP BY dm.model`, [since]
    );
    // Totals
    const { rows: [totals] } = await pgPool.query(
      `SELECT
        COALESCE(SUM(t.tokens_used), 0)::int AS total_tokens,
        COUNT(DISTINCT t.session_id) AS total_sessions,
        COUNT(t.id) AS total_api_calls
       FROM dashboard_messages t WHERE t.created_at >= $1`, [since]
    );
    const dailyData = daily.map(r => ({
      day: String(r.day),
      input_tokens: Math.floor(r.total_tokens * 0.4),
      output_tokens: Math.floor(r.total_tokens * 0.6),
      cache_read_tokens: 0,
      reasoning_tokens: 0,
      estimated_cost: +(r.total_tokens * 0.000003).toFixed(4),
      actual_cost: +(r.total_tokens * 0.000003).toFixed(4),
      sessions: Number(r.sessions),
      api_calls: Number(r.api_calls),
    }));
    const modelData = byModel.map(r => ({
      model: r.model, input_tokens: Math.floor(r.total_tokens * 0.4),
      output_tokens: Math.floor(r.total_tokens * 0.6),
      estimated_cost: +(r.total_tokens * 0.000003).toFixed(4),
      sessions: Number(r.sessions), api_calls: Number(r.api_calls),
    }));
    jsonOk(res, {
      daily: dailyData,
      by_model: modelData,
      totals: {
        total_input: Math.floor(Number(totals.total_tokens) * 0.4),
        total_output: Math.floor(Number(totals.total_tokens) * 0.6),
        total_cache_read: 0, total_reasoning: 0,
        total_estimated_cost: +(Number(totals.total_tokens) * 0.000003).toFixed(4),
        total_actual_cost: +(Number(totals.total_tokens) * 0.000003).toFixed(4),
        total_sessions: Number(totals.total_sessions),
        total_api_calls: Number(totals.total_api_calls),
      },
      skills: { summary: { total_skill_loads: 0, total_skill_edits: 0, total_skill_actions: 0, distinct_skills_used: 0 }, top_skills: [] },
    });
  } catch (err) {
    console.error('[analytics/usage]', err);
    jsonOk(res, stubUsage(days));
  }
});

app.get('/api/analytics/models', async (req, res) => {
  const days = parseInt(String(req.query.days)) || 7;
  const since = new Date(Date.now() - days * 86400000);
  if (!pgPool) { jsonOk(res, stubModels(days)); return; }
  try {
    const { rows } = await pgPool.query(
      `SELECT
        COALESCE(model, 'unknown') AS model,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(id) AS api_calls,
        COALESCE(SUM(tokens_used), 0)::int AS total_tokens
       FROM dashboard_messages
       WHERE created_at >= $1 AND model IS NOT NULL
       GROUP BY model`, [since]
    );
    const models = rows.map(r => ({
      model: r.model, provider: r.model.split('/')[0] || 'openai',
      input_tokens: Math.floor(r.total_tokens * 0.4),
      output_tokens: Math.floor(r.total_tokens * 0.6),
      cache_read_tokens: 0, reasoning_tokens: 0,
      estimated_cost: +(r.total_tokens * 0.000003).toFixed(4),
      actual_cost: +(r.total_tokens * 0.000003).toFixed(4),
      sessions: Number(r.sessions), api_calls: Number(r.api_calls),
      tool_calls: 0, last_used_at: Date.now(),
      avg_tokens_per_session: r.sessions > 0 ? Math.floor(r.total_tokens / Number(r.sessions)) : 0,
      capabilities: { supports_tools: false, supports_vision: false, supports_reasoning: false, context_window: 128000, max_output_tokens: 4096 },
    }));
    const totalTokens = rows.reduce((s, r) => s + Number(r.total_tokens), 0);
    jsonOk(res, {
      models, period_days: days,
      totals: {
        distinct_models: rows.length,
        total_input: Math.floor(totalTokens * 0.4),
        total_output: Math.floor(totalTokens * 0.6),
        total_cache_read: 0, total_reasoning: 0,
        total_estimated_cost: +(totalTokens * 0.000003).toFixed(4),
        total_actual_cost: +(totalTokens * 0.000003).toFixed(4),
        total_sessions: rows.reduce((s, r) => s + Number(r.sessions), 0),
        total_api_calls: rows.reduce((s, r) => s + Number(r.api_calls), 0),
      },
    });
  } catch (err) {
    console.error('[analytics/models]', err);
    jsonOk(res, stubModels(days));
  }
});

function stubUsage(days: number) {
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - i * 86400000);
    return { day: d.toISOString().split('T')[0], input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0, sessions: 0, api_calls: 0 };
  });
  return { daily: daily.reverse(), by_model: [], totals: { total_input: 0, total_output: 0, total_cache_read: 0, total_reasoning: 0, total_estimated_cost: 0, total_actual_cost: 0, total_sessions: 0, total_api_calls: 0 }, skills: { summary: { total_skill_loads: 0, total_skill_edits: 0, total_skill_actions: 0, distinct_skills_used: 0 }, top_skills: [] } };
}
function stubModels(days: number) {
  return { models: [], totals: { distinct_models: 0, total_input: 0, total_output: 0, total_cache_read: 0, total_reasoning: 0, total_estimated_cost: 0, total_actual_cost: 0, total_sessions: 0, total_api_calls: 0 }, period_days: days };
}

// ── Env ─────────────────────────────────────────────────────────────────────
app.get('/api/env', (_req, res) => jsonOk(res, store.envVars));
app.put('/api/env', (req, res) => {
  const { key, value } = req.body;
  if (key && typeof key === 'string') {
    store.envVars[key] = {
      is_set: true,
      redacted_value: 'sk-***',
      description: `Environment variable: ${key}`,
      url: null,
      category: 'custom',
      is_password: true,
      tools: [],
      advanced: false,
    };
  }
  jsonOk(res);
});
app.delete('/api/env', (req, res) => {
  const { key } = req.body;
  if (key && store.envVars[key]) delete store.envVars[key];
  jsonOk(res);
});
app.post('/api/env/reveal', (req, res) => {
  const { key } = req.body;
  const value = process.env[key] || store.envVars[key]?.redacted_value || '';
  jsonOk(res, { key, value: value.replace('sk-***', 'sk-live-***') });
});

// ── Cron Jobs (PostgreSQL-backed) ────────────────────────────────────────────
app.get('/api/cron/jobs', async (_req, res) => {
  if (!pgPool) { jsonOk(res, store.cronJobs); return; }
  try {
    const { rows } = await pgPool.query(
      'SELECT * FROM cron_jobs ORDER BY created_at ASC'
    );
    // Map flat DB columns to nested {schedule:{kind,expr,display}} shape
    // and enrich with live next_run_at from the in-memory scheduler
    const mapped = rows.map(r => {
      const live = scheduledJobs.get(r.id);
      return {
        ...r,
        schedule: { kind: r.schedule_kind, expr: r.schedule_expr, display: r.schedule_display || r.schedule_expr },
        next_run_at: live?.nextRunAt?.toISOString() ?? r.next_run_at ?? null,
      };
    });
    jsonOk(res, mapped);
  } catch { jsonOk(res, store.cronJobs); }
});

app.post('/api/cron/jobs', async (req, res) => {
  const id = `cron-${Date.now()}`;
  // Frontend sends { prompt, schedule, name, deliver } — map to internal fields
  const raw = req.body || {};
  const name = raw.name || 'Unnamed job';
  const prompt = raw.prompt || '';
  const schedule = raw.schedule || '';          // cron expression from frontend
  const deliver = raw.deliver;
  // Map frontend 'schedule' to internal schedule_expr; derive display from cron expression
  const schedule_kind = 'cron';
  const schedule_expr = raw.schedule_expr || schedule;
  const schedule_display = raw.schedule_display || schedule_expr;
  if (!pgPool) {
    const job = { id, name, prompt, schedule_kind, schedule_expr, schedule_display, enabled: true, state: 'idle', deliver };
    store.cronJobs.push(job);
    jsonOk(res, job);
    return;
  }
  try {
    const { rows } = await pgPool.query(
      `INSERT INTO cron_jobs (id, name, prompt, schedule_kind, schedule_expr, schedule_display)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, name, prompt, schedule_kind, schedule_expr, schedule_display]
    );
    // Schedule the new job
    await scheduleJob(id, prompt, schedule_expr);
    io.emit('cron:updated');
    const result = rows[0];
    jsonOk(res, { ...result, schedule: { kind: schedule_kind, expr: schedule_expr, display: schedule_display || schedule_expr }, deliver });
  } catch { jsonOk(res, { id, name, prompt, schedule_kind, schedule_expr, schedule_display, enabled: true, state: 'idle', deliver }); }
});

app.post('/api/cron/jobs/:id/pause', async (req, res) => {
  const { id } = req.params;
  await unscheduleJob(id);
  if (!pgPool) {
    const job = store.cronJobs.find(j => j.id === id);
    if (job) job.enabled = false;
    jsonOk(res); return;
  }
  try { await pgPool.query('UPDATE cron_jobs SET enabled=false, state=\'paused\' WHERE id=$1', [id]); } catch {}
  io.emit('cron:updated');
  jsonOk(res);
});

app.post('/api/cron/jobs/:id/resume', async (req, res) => {
  const { id } = req.params;
  if (!pgPool) {
    const job = store.cronJobs.find(j => j.id === id);
    if (job) job.enabled = true;
    jsonOk(res); return;
  }
  try {
    const { rows } = await pgPool.query('SELECT prompt, schedule_expr FROM cron_jobs WHERE id=$1', [id]);
    if (rows[0]) {
      await pgPool.query('UPDATE cron_jobs SET enabled=true, state=\'idle\' WHERE id=$1', [id]);
      await scheduleJob(id, rows[0].prompt, rows[0].schedule_expr);
      io.emit('cron:updated');
    }
  } catch {}
  jsonOk(res);
});

app.post('/api/cron/jobs/:id/trigger', async (req, res) => {
  const { id } = req.params;
  if (!pgPool) {
    const job = store.cronJobs.find(j => j.id === id);
    if (job) { job.last_run_at = new Date().toISOString(); job.state = 'running'; }
    jsonOk(res); return;
  }
  try {
    const { rows } = await pgPool.query('SELECT prompt FROM cron_jobs WHERE id=$1', [id]);
    if (rows[0]) {
      // Execute immediately (don't wait)
      executeCronJob(id, rows[0].prompt).catch(() => {});
      io.emit('cron:updated');
      jsonOk(res, { state: 'running', triggered_at: new Date().toISOString() });
      return;
    }
  } catch {}
  jsonOk(res);
});

app.delete('/api/cron/jobs/:id', async (req, res) => {
  if (!pgPool) {
    const idx = store.cronJobs.findIndex(j => j.id === req.params.id);
    if (idx !== -1) store.cronJobs.splice(idx, 1);
    jsonOk(res); return;
  }
  try { await pgPool.query('DELETE FROM cron_jobs WHERE id=$1', [req.params.id]); } catch {}
  io.emit('cron:updated');
  jsonOk(res);
});

// ── Profiles (PostgreSQL-backed) ─────────────────────────────────────────────
app.get('/api/profiles', async (_req, res) => {
  if (!pgPool) { jsonOk(res, { profiles: store.profiles }); return; }
  try {
    const { rows } = await pgPool.query('SELECT * FROM profiles ORDER BY created_at ASC');
    // Map DB columns to the shape the frontend expects
    const mapped = rows.map(r => ({
      name: r.name,
      path: `/root/.nanobot/profiles/${r.name}`,
      is_default: r.is_default ?? false,
      model: r.model ?? null,
      provider: r.provider ?? null,
      has_env: !!(r.api_key_env_var),
      skill_count: 0, // no skills table yet
    }));
    jsonOk(res, { profiles: mapped });
  } catch { jsonOk(res, { profiles: store.profiles }); }
});

app.post('/api/profiles', async (req, res) => {
  const name = req.body?.name || `profile-${Date.now()}`;
  const profile = { name, path: `/app/profiles/${name}`, is_default: false, model: null, provider: null, has_env: false, skill_count: 0 };
  if (!pgPool) {
    store.profiles.push(profile);
    jsonOk(res, { ok: true, name, path: profile.path }); return;
  }
  try {
    const { rows } = await pgPool.query(
      `INSERT INTO profiles (name, path, is_default) VALUES ($1,$2,false) RETURNING *`,
      [name, profile.path]
    );
    jsonOk(res, { ok: true, name, path: profile.path, ...rows[0] });
  } catch { jsonOk(res, { ok: true, name, path: profile.path }); }
});

app.patch('/api/profiles/:name', async (req, res) => {
  const profile = store.profiles.find(p => p.name === req.params.name);
  if (profile && req.body?.new_name) profile.name = req.body.new_name;
  if (pgPool && req.body?.new_name) {
    try { await pgPool.query('UPDATE profiles SET name=$1 WHERE name=$2', [req.body.new_name, req.params.name]); } catch {}
  }
  jsonOk(res, profile || {});
});

app.delete('/api/profiles/:name', async (req, res) => {
  const idx = store.profiles.findIndex(p => p.name === req.params.name);
  if (idx !== -1 && !store.profiles[idx].is_default) store.profiles.splice(idx, 1);
  if (pgPool) {
    try { await pgPool.query('DELETE FROM profiles WHERE name=$1 AND is_default=false', [req.params.name]); } catch {}
  }
  jsonOk(res);
});

app.get('/api/profiles/:name/setup-command', (req, res) => {
  const { name } = req.params;
  jsonOk(res, { command: `nanobot --profile ${name} setup` });
});

app.get('/api/profiles/:name/soul', async (req, res) => {
  const { name } = req.params;
  if (!pgPool) {
    const profile = store.profiles.find(p => p.name === name);
    jsonOk(res, { content: (profile as { soul?: string })?.soul ?? '', exists: !!profile });
    return;
  }
  try {
    const { rows } = await pgPool.query<{ soul: string }>(
      'SELECT soul FROM profiles WHERE name=$1', [name]
    );
    jsonOk(res, { content: rows[0]?.soul ?? '', exists: rows.length > 0 });
  } catch {
    jsonOk(res, { content: '', exists: false });
  }
});

app.put('/api/profiles/:name/soul', async (req, res) => {
  const { name } = req.params;
  const { content } = req.body ?? {};
  if (typeof content !== 'string') { res.status(400).json({ error: 'content required' }); return; }
  if (!pgPool) {
    const profile = store.profiles.find(p => p.name === name);
    if (profile) (profile as { soul?: string }).soul = content;
    jsonOk(res); return;
  }
  try {
    await pgPool.query(
      'UPDATE profiles SET soul=$1, updated_at=NOW() WHERE name=$2',
      [content, name]
    );
    jsonOk(res);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── Skills ──────────────────────────────────────────────────────────────────
app.get('/api/skills', (_req, res) => jsonOk(res, store.skills));
app.put('/api/skills/toggle', async (req, res) => {
  const skill = store.skills.find(s => s.name === req.body.name);
  if (skill) skill.enabled = req.body.enabled;
  if (pgPool) {
    try {
      await pgPool.query(
        `INSERT INTO skill_settings (name, enabled) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET enabled = EXCLUDED.enabled`,
        [req.body.name, req.body.enabled]
      );
    } catch (e) {
      console.error('[skills] Failed to persist toggle:', e);
    }
  }
  jsonOk(res);
});

// ── Skill Creator — write SKILL.md directly into nanobot container ───────
app.post('/api/skills/create', async (req, res) => {
  const { name, description, content } = req.body as {
    name?: string;
    description?: string;
    content?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!content?.trim()) {
    res.status(400).json({ error: 'content (SKILL.md) is required' });
    return;
  }
  // Sanitize: lowercase kebab-case, alphanumeric + hyphens only
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!safeName) {
    res.status(400).json({ error: 'name must contain at least one alphanumeric character' });
    return;
  }

  // Write the SKILL.md file to the persistent custom-skills directory on the host.
  // Backend has /home/sean/.nanobot mounted from host — write directly to host path.
  // Nanobot reads from /app/packages/nanobot/nanobot/skills/custom via docker volume mount.
  try {
    const skillDir = `/home/sean/.nanobot/custom-skills/${safeName}`;
    const skillFile = `${skillDir}/SKILL.md`;
    const fileContent = content.trim();
    const fs = await import('fs');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillFile, fileContent, 'utf8');
    console.log(`[skill-creator] Created skill '${safeName}' at ${skillFile}`);

    // Reload skills in store
    await loadSkillsFromDisk();

    jsonOk(res, { name: safeName, path: skillFile });
  } catch (err) {
    console.error('[skill-creator] Failed to create skill:', err);
    res.status(500).json({ error: `Failed to create skill: ${(err as Error).message}` });
  }
});

app.delete('/api/skills/:name', async (req, res) => {
  const { name } = req.params;
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  // Only allow deleting skills in the custom-skills directory (host path)
  const skillDir = `/home/sean/.nanobot/custom-skills/${name}`;
  const skillFile = `${skillDir}/SKILL.md`;
  try {
    const fs = await import('fs');
    if (!fs.existsSync(skillFile)) {
      res.status(404).json({ error: `Skill '${name}' not found in custom-skills` });
      return;
    }
    fs.rmSync(skillDir, { recursive: true });
    console.log(`[skill-creator] Deleted skill '${name}' at ${skillDir}`);
    // Reload skills in store
    await loadSkillsFromDisk();
    jsonOk(res, { deleted: name });
  } catch (err) {
    console.error('[skill-creator] Failed to delete skill:', err);
    res.status(500).json({ error: `Failed to delete skill: ${(err as Error).message}` });
  }
});

// ── Model (proxied from nanobot) ────────────────────────────────────────────
app.get('/api/model/info', async (_req, res) => {
  // Get current model from nanobot config
  let model = store.config?.model ?? 'MiniMax-M2.7';
  let provider = store.config?.provider ?? 'minimax';
  try {
    const cfgPath = '/root/.nanobot/config.json';
    const content = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(content);
    model = cfg?.agents?.defaults?.model ?? model;
    provider = cfg?.agents?.defaults?.provider ?? provider;
  } catch {}
  // Fetch capabilities from nanobot /v1/models
  let supports_tools = true, supports_vision = false, supports_reasoning = false;
  try {
    const resp = await fetch(`${process.env.NANOBOT_API_URL ?? 'http://nanobot:8900'}/v1/models`);
    if (resp.ok) {
      const data = await resp.json() as { data?: Array<{ id: string }> };
      const current = data?.data?.find((m: { id: string }) => m.id === model);
      if (current?.id.includes('vision')) supports_vision = true;
      if (current?.id.includes('reasoning') || current?.id.includes('o1') || current?.id.includes('o3')) supports_reasoning = true;
    }
  } catch {}
  jsonOk(res, {
    model,
    provider,
    capabilities: { supports_tools, supports_vision, supports_reasoning },
  });
});

app.get('/api/model/options', async (_req, res) => {
  // Fetch available models from nanobot's OpenAI-compatible endpoint
  try {
    const resp = await fetch(`${process.env.NANOBOT_API_URL ?? 'http://nanobot:8900'}/v1/models`);
    if (resp.ok) {
      const data = await resp.json() as { data?: Array<{ id: string }> };
      const models = data?.data?.map((m: { id: string }) => m.id) ?? [];
      if (models.length > 0) {
        jsonOk(res, {
          providers: [{ id: 'nanobot', label: 'Nanobot', models }],
        });
        return;
      }
    }
  } catch {}
  // Fallback
  jsonOk(res, { providers: [{ id: 'minimax', label: 'MiniMax', models: ['MiniMax-M2.7', 'MiniMax-M2.0'] }] });
});

app.get('/api/model/auxiliary', (_req, res) => jsonOk(res, { models: [] }));

app.post('/api/model/set', (req, res) => {
  if (req.body?.model) store.config = { ...store.config, model: req.body.model, provider: req.body.provider ?? store.config?.provider };
  jsonOk(res, { ok: true });
});

// ── OAuth ───────────────────────────────────────────────────────────────────
app.get('/api/providers/oauth', (_req, res) => jsonOk(res, { providers: [] }));
app.delete('/api/providers/oauth/:providerId', (req, res) => jsonOk(res, { ok: true, provider: req.params.providerId }));
app.post('/api/providers/oauth/:providerId/start', (req, res) => jsonOk(res, { auth_url: `https://example.com/oauth/${req.params.providerId}` }));
app.post('/api/providers/oauth/:providerId/submit', (req, res) => jsonOk(res, { ok: true, provider: req.params.providerId }));
app.get('/api/providers/oauth/:providerId/poll/:sessionId', (req, res) => jsonOk(res, { status: 'pending', provider: req.params.providerId }));
app.delete('/api/providers/oauth/sessions/:sessionId', (req, res) => jsonOk(res));

// ── Toolsets ───────────────────────────────────────────────────────────────
app.get('/api/tools/toolsets', (_req, res) => jsonOk(res, store.toolsets));

// ── Gateway / Actions ───────────────────────────────────────────────────────
app.post('/api/gateway/restart', (_req, res) => jsonOk(res, { name: 'gateway-restart', ok: true, pid: 0 }));
app.post('/api/hermes/update', (_req, res) => jsonOk(res, { name: 'hermes-update', ok: true, pid: 0 }));
app.get('/api/actions/:name/status', (_req, res) => jsonOk(res, { name: 'action', exit_code: null, lines: [], pid: null, running: false }));

// ── Dashboard Plugins ──────────────────────────────────────────────────────
app.get('/api/dashboard/plugins', (_req, res) => jsonOk(res, store.plugins.map(p => ({ manifest: p, name: p.name, version: p.version, enabled: p.enabled }))));
app.post('/api/dashboard/plugins/rescan', (_req, res) => jsonOk(res, { ok: true, count: store.plugins.length }));

// ── Dashboard Themes ────────────────────────────────────────────────────────
app.get('/api/dashboard/themes', (_req, res) => jsonOk(res, { themes: store.themes.available, current: store.themes.current }));
app.put('/api/dashboard/theme', (req, res) => { store.themes.current = req.body.name; jsonOk(res, { ok: true, theme: req.body.name }); });

// ── Database helpers ──────────────────────────────────────────────────────────

async function pgQuery(sql: string, params: unknown[] = []): Promise<unknown[]> {
  if (!pgPool) return [];
  const result = await pgPool.query(sql, params);
  return result.rows;
}

// ── Agent / Nanobot proxy ─────────────────────────────────────────────────────
// Proxies chat requests to nanobot's SSE streaming API, so the frontend
// never needs to know about port 8900. This keeps the embedded chat working
// even when the backend is accessed via the Cloudflare tunnel.
app.post('/api/agent/chat', async (req, res) => {
  const { text, session_id, stream = true } = req.body as {
    text?: string;
    session_id?: string;
    stream?: boolean;
  };

  if (!text?.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  // Derive or create session
  let sid = session_id;
  if (!sid) {
    sid = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
  // Always ensure the session row exists before inserting messages
  // (handles both auto-generated and client-provided session_ids)
  await pgQuery(
    'INSERT INTO dashboard_sessions (id, title) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [sid, sid === session_id ? `Chat ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` : text.slice(0, 60) + (text.length > 60 ? '…' : '')],
  );

  // Build conversation context from session history (last N messages, skip last assistant since we're adding a new one)
  let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
  if (sid) {
    try {
      const rows = await pgQuery(
        'SELECT role, content FROM dashboard_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 20',
        [sid],
      );
      // Include all but the very last assistant message (it's the response to the previous turn)
      // Actually include everything — nanobot will see the prior assistant turn as context
      conversationHistory = (rows as { role: string; content: string }[])
        .filter((r) => r.role === 'user' || r.role === 'assistant')
        .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
    } catch {
      // ignore — proceed without context
    }
  }

  // Estimate tokens from content length if not tracked
  const userTokens = Math.max(1, Math.ceil(text.length / 4));
  // Store user message
  await pgQuery(
    'INSERT INTO dashboard_messages (session_id, role, content, model, tokens_used) VALUES ($1, $2, $3, $4, $5)',
    [sid, 'user', text, store.config.model ?? 'unknown', userTokens],
  );

  const nanobotUrl = `http://nanobot:8900/v1/chat/completions`;
  // Nanobot's handle_chat_completions expects OpenAI messages format.
  // Include conversationHistory as prior context so nanobot understands multi-turn conversations.
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];
  const payload = {
    model: undefined,
    messages,
    session_id: sid ?? "dashboard",
    stream,
  };

  try {
    // Forward to nanobot — use timeout wrapper to prevent hangs
    const nanobotRes = await fetchWithTimeout(nanobotUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!nanobotRes.ok) {
      const body = await nanobotRes.text();
      return res.status(nanobotRes.status).json({ error: `Nanobot error: ${body}` });
    }

    if (!stream) {
      // Blocking response — nanobot returns OpenAI-compatible JSON
      const data = await nanobotRes.json();
      // Store assistant response
      const assistantContent = data.choices?.[0]?.message?.content;
      const assistantTokens = Math.max(1, Math.ceil(assistantContent.length / 4));
      const actualModel = data.model || store.config.model || 'unknown';
      if (assistantContent) {
        pgQuery(
          'INSERT INTO dashboard_messages (session_id, role, content, model, tokens_used) VALUES ($1, $2, $3, $4, $5)',
          [sid, 'assistant', assistantContent, actualModel, assistantTokens],
        ).catch(err => console.error('[/api/agent/chat] failed to store assistant message:', err));
      }
      return res.json(data);
    }

    // Streaming — pipe SSE tokens back as SSE, accumulate for DB storage
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Emit session_id as the very first event so the frontend knows it
    res.write(`data: ${JSON.stringify({ session_id: sid })}\n\n`);

    const reader = nanobotRes.body?.getReader();
    if (!reader) {
      return res.status(502).json({ error: 'Nanobot returned no stream body' });
    }

    const decoder = new TextDecoder();
    let closed = false;
    let fullResponse = '';
    let lineBuffer = '';

    const close = () => {
      if (closed) return;
      closed = true;
      reader.cancel().catch(() => {});
      // Store assistant response asynchronously — don't block the close
      if (fullResponse.trim()) {
        const streamTokens = Math.max(1, Math.ceil(fullResponse.length / 4));
        pgQuery(
          'INSERT INTO dashboard_messages (session_id, role, content, model, tokens_used) VALUES ($1, $2, $3, $4, $5)',
          [sid, 'assistant', fullResponse, store.config.model ?? 'unknown', streamTokens],
        ).catch(err => console.error('[/api/agent/chat] failed to store assistant message:', err));
      }
      res.end();
    };

    req.on('close', close);
    req.on('error', close);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        lineBuffer += chunk;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (json === '[DONE]') continue;
          // Extract text delta from SSE token
          try {
            const parsed = JSON.parse(json);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) fullResponse += delta;
          } catch {
            // not JSON or no content delta
          }
          // Relay raw SSE to client
          res.write(rawLine + '\n');
        }
      }
      // Flush final newline
      if (lineBuffer.trim()) res.write(lineBuffer + '\n');
    } catch {
      // Stream interrupted
    } finally {
      close();
    }
  } catch (err) {
    console.error('[/api/agent/chat]', err);
    if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
  }
});

// ── Docker proxy ────────────────────────────────────────────────────────────
app.get('/api/docker/containers/json', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const containers = await docker.listContainers({ all });
    // Normalize Names from array to string for frontend compatibility
    const normalized = containers.map(c => ({ ...c, Names: c.Names?.[0] || c.Names?.join(',') || '' }));
    res.json(normalized);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.post('/api/docker/containers/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  // Safety: prevent backend from stopping/restarting/removing itself
  try {
    const self = await docker.getContainer(id);
    const selfInfo = await self.inspect();
    const backendId = process.env.HOSTNAME || selfInfo.Id.slice(0, 12);
    if (id === backendId || id === selfInfo.Id.slice(0, 12)) {
      res.status(400).json({ error: 'Cannot control the backend container from itself' });
      return;
    }
  } catch { /* inspect may fail for other containers */ }

  try {
    const container = docker.getContainer(id);
    if (action === 'start') await container.start();
    else if (action === 'stop') await container.stop();
    else if (action === 'restart') await container.restart();
    else if (action === 'remove') await container.remove({ force: true });
    else { res.status(400).json({ error: `Unknown action: ${action}` }); return; }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.get('/api/docker/system', async (_req, res) => {
  try {
    const [info, version] = await Promise.all([docker.info(), docker.version()]);
    res.json({ version: version.Version, apiVersion: version.ApiVersion, os: info.OperatingSystem, kernel: info.KernelVersion, containers: { total: info.Containers, running: info.ContainersRunning, paused: info.ContainersPaused, stopped: info.ContainersStopped }, images: info.Images, memory: { total: info.MemTotal, used: info.MemUsage, limit: info.MemLimit }, cpus: info.NCPU, dockerRoot: info.DockerRootDir });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.get('/api/docker/info', async (_req, res) => {
  try { res.json(await docker.info()); }
  catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.get('/api/docker/version', async (_req, res) => {
  try { res.json(await docker.version()); }
  catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.get('/api/docker/stats', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: false });
    const stats = await Promise.all(
      containers.map(async (c) => {
        try {
          const container = docker.getContainer(c.Id);
          const [stats, info] = await Promise.all([
            container.stats({ stream: false }),
            container.inspect(),
          ]);
          const memUsage = stats.memory_stats?.usage || 0;
          const memLimit = stats.memory_stats?.limit || 1;
          const cpuDelta = stats.cpu_stats?.cpu_usage?.total_usage - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
          const systemDelta = stats.cpu_stats?.system_cpu_usage - (stats.precpu_stats?.system_cpu_usage || 0);
          const numCpus = stats.cpu_stats?.online_cpus || 1;
          const cpuPct = systemDelta > 0 ? Math.round((cpuDelta / systemDelta) * numCpus * 100) : 0;
          return {
            id: c.Id.slice(0, 12),
            name: c.Names?.[0] || c.Names?.join(',') || c.Id.slice(0, 12),
            state: info.State?.Status,
            cpu_percent: cpuPct,
            memory_usage: memUsage,
            memory_limit: memLimit,
            memory_percent: Math.round((memUsage / memLimit) * 100),
            network_rx: stats.networks
              ? Object.values(stats.networks).reduce((s: number, n: { rx_bytes?: number }) => s + (n.rx_bytes || 0), 0)
              : 0,
            network_tx: stats.networks
              ? Object.values(stats.networks).reduce((s: number, n: { tx_bytes?: number }) => s + (n.tx_bytes || 0), 0)
              : 0,
            pids: stats.pids_stats?.current || 0,
          };
        } catch {
          return { id: c.Id.slice(0, 12), name: (c.Names?.[0] || '').replace(/^\//, ''), state: 'unknown', cpu_percent: 0, memory_usage: 0, memory_limit: 0, memory_percent: 0, network_rx: 0, network_tx: 0, pids: 0 };
        }
      })
    );
    res.json({ stats, source: 'dockerode' });
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// ── Agent / nanobot config ───────────────────────────────────────────────────
app.get('/api/agent/config', async (_req, res) => {
  try {
    const cfgPath = '/root/.nanobot/config.json';
    const content = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(content);
    // Strip API keys before returning
    if (cfg.providers) {
      for (const [k, v] of Object.entries(cfg.providers) as [string, Record<string,unknown>][]) {
        if ((v as Record<string,unknown>).apiKey) (v as Record<string,unknown>).apiKey = '***';
      }
    }
    jsonOk(res, cfg);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── File browser (read-only) ────────────────────────────────────────────────
// NOTE: specific /api/files/read/* route MUST come before the wildcard /api/files/*
// to prevent the wildcard from consuming read requests (Express matches in order)
app.get('/api/files/read/*', async (req, res) => {
  const safeRoots = ['/opt/data', '/home/sean'];
  const requestedPath = '/' + req.params[0];
  const resolved = path.resolve(requestedPath);
  if (!safeRoots.some(root => resolved.startsWith(root))) {
    res.status(403).json({ error: 'Path outside allowed directories' }); return;
  }
  try {
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) { res.status(400).json({ error: 'Not a file' }); return; }
    if (stat.size > 1024 * 1024) { res.status(400).json({ error: 'File too large (>1MB)' }); return; }
    const content = await fs.promises.readFile(resolved, 'utf8');
    jsonOk(res, { content, size: stat.size, mtime: stat.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/files/*', async (req, res) => {
  // Only allow browsing within /opt/data and /home/sean
  const safeRoots = ['/opt/data', '/home/sean'];
  const requestedPath = '/' + req.params[0];
  const resolved = path.resolve(requestedPath);
  if (!safeRoots.some(root => resolved.startsWith(root))) {
    res.status(403).json({ error: 'Path outside allowed directories' });
    return;
  }
  try {
    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
      const files = await Promise.all(entries.map(async e => {
        try {
          const s = await fs.promises.stat(path.join(resolved, e.name));
          return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size: s.size, mtime: s.mtime.toISOString() };
        } catch { return { name: e.name, type: e.isDirectory() ? 'dir' : 'file', size: 0, mtime: null }; }
      }));
      jsonOk(res, files);
    } else {
      res.status(400).json({ error: 'Not a directory' });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/files/*', async (req, res) => {
  const safeRoots = ['/opt/data', '/home/sean'];
  const requestedPath = '/' + req.params[0];
  const resolved = path.resolve(requestedPath);
  if (!safeRoots.some(root => resolved.startsWith(root))) {
    res.status(403).json({ error: 'Path outside allowed directories' }); return;
  }
  try {
    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      const entries = await fs.promises.readdir(resolved);
      if (entries.length > 0) {
        res.status(400).json({ error: 'Directory not empty — delete files first' }); return;
      }
      await fs.promises.rmdir(resolved);
    } else {
      await fs.promises.unlink(resolved);
    }
    jsonOk(res, { ok: true, path: requestedPath });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/files/write/*', express.text({ type: '*/*', limit: '2mb' }), async (req, res) => {
  const safeRoots = ['/opt/data', '/home/sean'];
  const requestedPath = '/' + req.params[0];
  const resolved = path.resolve(requestedPath);
  if (!safeRoots.some(root => resolved.startsWith(root))) {
    res.status(403).json({ error: 'Path outside allowed directories' }); return;
  }
  try {
    const dir = path.dirname(resolved);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(resolved, req.body, 'utf8');
    const stat = await fs.promises.stat(resolved);
    jsonOk(res, { ok: true, path: requestedPath, size: stat.size, mtime: stat.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── SPA fallback (must be LAST) ─────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════
// Terminal — Docker exec-based PTY terminal via Socket.IO
// ═══════════════════════════════════════════════════════════════════
const terminalSessions = new Map<string, any>();

async function createTerminalSession(containerName: string, cols: number, rows: number): Promise<string> {
  const container = docker.getContainer(containerName);
  const exec = await container.exec({
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Cmd: ['/bin/bash'],
    Env: [`COLUMNS=${cols}`, `LINES=${rows}`, 'TERM=xterm-256color'],
  });
  const sessionId = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  terminalSessions.set(sessionId, { exec, containerName, cols, rows });
  return sessionId;
}

async function startTerminalStream(sessionId: string, socket: any) {
  const session = terminalSessions.get(sessionId);
  if (!session) return;

  let outputClosed = false;
  try {
    const stream = await session.exec.start({
      hijack: true,
      stdin: true,
      stream: true,
    });

    // Docker exec multiplexes stdout/stderr with 8-byte headers
    const demux = new TerminalDemux();
    stream.on('data', (chunk: Buffer) => {
      if (outputClosed) return;
      const text = demux.demux(chunk);
      if (text) {
        socket.emit('terminal:data', { sessionId, data: text });
      }
    });
    stream.on('end', () => {
      outputClosed = true;
      socket.emit('terminal:exit', { sessionId });
    });
    stream.on('error', (err: Error) => {
      outputClosed = true;
      socket.emit('terminal:error', { sessionId, error: err.message });
    });

    // Handle stdin from client
    socket.on('terminal:stdin', (payload: { sessionId: string; data: string }) => {
      if (payload.sessionId !== sessionId || outputClosed) return;
      stream.write(Buffer.from(payload.data));
    });

    // Handle resize from client
    socket.on('terminal:resize', (payload: { sessionId: string; cols: number; rows: number }) => {
      if (payload.sessionId !== sessionId) return;
      session.cols = payload.cols;
      session.rows = payload.rows;
      // Docker doesn't support resize natively, so we just store the new size
    });
  } catch (err) {
    socket.emit('terminal:error', { sessionId, error: (err as Error).message });
  }
}

/** Demultiplexes Docker exec stream (8-byte header + payload). */
class TerminalDemux {
  private buffer = Buffer.alloc(0);
  private pendingSize = 0;

  demux(chunk: Buffer): string | null {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let result = '';

    while (this.buffer.length >= 8) {
      if (this.pendingSize === 0) {
        // Read header: [stream_type(1)][padding(3)][size(4)]
        this.pendingSize = this.buffer.readUInt32BE(4);
      }
      const totalNeeded = 8 + this.pendingSize;
      if (this.buffer.length < totalNeeded) break;

      const payload = this.buffer.subarray(8, totalNeeded);
      this.buffer = this.buffer.subarray(totalNeeded);
      this.pendingSize = 0;

      // Stream types: 0=stdin, 1=stdout, 2=stderr
      if (payload.length > 0) {
        result += payload.toString('utf8');
      }
    }
    return result || null;
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // Start live log streams for each agent container on first client connect
  if (io.engine.clientsCount === 1) {
    AGENT_CONTAINERS.forEach(name => startLogStream(name, io));
  }

  // Terminal event handlers
  socket.on('terminal:create', async (payload: { container: string; cols: number; rows: number }) => {
    try {
      const container = payload.container || 'agent-os-backend';
      const sessionId = await createTerminalSession(container, payload.cols || 80, payload.rows || 24);
      socket.emit('terminal:created', { sessionId });
      await startTerminalStream(sessionId, socket);
    } catch (err) {
      socket.emit('terminal:error', { error: (err as Error).message });
    }
  });

  socket.on('terminal:close', (payload: { sessionId: string }) => {
    terminalSessions.delete(payload.sessionId);
  });

  // Emit container snapshots every 5s to all connected clients
  const containerInterval = setInterval(async () => {
    try {
      const containers = await docker.listContainers({ all: true });
      const statsData = await Promise.all(
        containers.map(c => docker.getContainer(c.Id).stats({ stream: false }).catch(() => null))
      );
      const statsMap: Record<string, object> = {};
      statsData.forEach((s, i) => {
        if (!s) return;
        const name = containers[i].Names?.[0]?.replace(/^\//, '') ?? containers[i].Id.slice(0, 12);
        const cpu = s.cpu_stats?.cpu_usage?.total_usage ?? 0;
        const pre = s.precpu_stats?.cpu_usage?.total_usage ?? 0;
        const sys = s.cpu_stats?.system_cpu_usage ?? 1;
        const preSys = s.precpu_stats?.system_cpu_usage ?? 1;
        const cpuPercent = sys > 0 ? ((cpu - pre) / (sys - preSys)) * 100 : 0;
        statsMap[name] = {
          cpu_percent: +cpuPercent.toFixed(1),
          memory_usage: s.memory_stats?.usage ?? 0,
          memory_limit: s.memory_stats?.limit ?? 1,
          memory_percent: s.memory_stats?.limit ? +(s.memory_stats.usage / s.memory_stats.limit * 100).toFixed(1) : 0,
          network_rx: 0, network_tx: 0, pids: s.pids_stats?.current ?? 0,
        };
      });
      io.emit('docker:containers', {
        containers: containers.map(c => ({
          Id: c.Id, Names: c.Names, Image: c.Image,
          State: c.State, Status: c.Status, Ports: '',
        })),
        stats: statsMap,
      });
    } catch { /* ignore container fetch errors */ }
  }, 5000);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (io.engine.clientsCount === 0) clearInterval(containerInterval);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  stopAllLogStreams();
  process.exit(0);
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export { io };

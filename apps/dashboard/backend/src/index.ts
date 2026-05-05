import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import Docker from 'dockerode';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

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
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());

// Serve static frontend files
const staticPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(staticPath));

// ── In-memory data store (persists while container runs) ─────────────────────
interface CronJobRecord {
  id: string;
  name?: string;
  prompt: string;
  schedule: { kind: string; expr: string; display: string };
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
      schedule: { kind: 'cron', expr: '0 9 * * *', display: 'Daily at 9:00 AM' },
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
    { name: 'coder', description: 'Code generation and review', category: 'development', enabled: true },
    { name: 'researcher', description: 'Web and data research', category: 'research', enabled: true },
    { name: 'planner', description: 'Task decomposition', category: 'productivity', enabled: true },
    { name: 'journal', description: 'Daily journaling', category: 'productivity', enabled: false },
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
    // Pull latest image and force-recreate containers
    const { execSync } = await import('child_process');
    const log = (msg) => console.log(`[deploy] ${msg}`);
    log('Starting deploy webhook handler');

    // Pull latest from GHCR
    log('Pulling latest ghcr.io/chonsong/agent-os:latest');
    execSync('/usr/bin/docker pull ghcr.io/chonsong/agent-os:latest', { stdio: 'pipe' });
    log('Pull complete');

    // Update compose image ref to latest tag and recreate
    execSync('sed -i "s|image: ghcr.io/chonsong/agent-os.*|image: ghcr.io/chonsong/agent-os:latest|" /home/sean/.hermes/agent-os/docker-compose.yml', { stdio: 'pipe' });
    log('Compose updated, force-recreating containers');
    execSync('cd /home/sean/.hermes/agent-os && /usr/bin/docker compose up -d --force-recreate --remove-orphans', { stdio: 'pipe' });
    log('Deploy complete');
    res.json({ ok: true, deployed_at: new Date().toISOString() });
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
    res.json({
      tunnel_id: TUNNEL_ID,
      url: 'https://agent-os.chonsong.com',
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
app.put('/api/config', (req, res) => {
  store.config = { ...store.config, ...req.body.config };
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
app.put('/api/config/raw', (req, res) => { jsonOk(res); });

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
       SUBSTRING(MAX(m.content) FROM 1 FOR 120) AS preview
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

app.get('/api/sessions/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const results = store.sessions.filter(s =>
    s.title?.toLowerCase().includes(q) || s.preview?.toLowerCase().includes(q)
  );
  jsonOk(res, { sessions: results, total: results.length });
});

// ── Logs ───────────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  const lines = parseInt(String(req.query.lines)) || 100;
  jsonOk(res, { file: '/app/logs/hermes.log', lines: Array.from({ length: Math.min(lines, 10) }, (_, i) => `[INFO] Demo log line ${i + 1}`) });
});

// ── Analytics ───────────────────────────────────────────────────────────────
app.get('/api/analytics/usage', (req, res) => {
  const days = parseInt(String(req.query.days)) || 7;
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - i * 86400000);
    return {
      day: d.toISOString().split('T')[0],
      input_tokens: 12000 + Math.floor(Math.random() * 8000),
      output_tokens: 24000 + Math.floor(Math.random() * 12000),
      cache_read_tokens: 3000,
      reasoning_tokens: 8000,
      estimated_cost: 0.45 + Math.random() * 0.3,
      actual_cost: 0.38 + Math.random() * 0.25,
      sessions: 8 + Math.floor(Math.random() * 5),
      api_calls: 45 + Math.floor(Math.random() * 20),
    };
  });
  jsonOk(res, {
    daily: daily.reverse(),
    by_model: [{ model: 'claude-3-5-sonnet', input_tokens: 84000, output_tokens: 168000, estimated_cost: 3.15, sessions: 56, api_calls: 315 }],
    totals: { total_input: 84000, total_output: 168000, total_cache_read: 21000, total_reasoning: 56000, total_estimated_cost: 3.15, total_actual_cost: 2.66, total_sessions: 56, total_api_calls: 315 },
    skills: { summary: { total_skill_loads: 120, total_skill_edits: 15, total_skill_actions: 45, distinct_skills_used: 8 }, top_skills: [] },
  });
});

app.get('/api/analytics/models', (req, res) => {
  const days = parseInt(String(req.query.days)) || 7;
  jsonOk(res, {
    models: [{
      model: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      input_tokens: 84000,
      output_tokens: 168000,
      cache_read_tokens: 21000,
      reasoning_tokens: 56000,
      estimated_cost: 3.15,
      actual_cost: 2.66,
      sessions: 56,
      api_calls: 315,
      tool_calls: 87,
      last_used_at: Date.now(),
      avg_tokens_per_session: 4500,
      capabilities: { supports_tools: true, supports_vision: true, supports_reasoning: true, context_window: 200000, max_output_tokens: 8192 },
    }],
    totals: { distinct_models: 1, total_input: 84000, total_output: 168000, total_cache_read: 21000, total_reasoning: 56000, total_estimated_cost: 3.15, total_actual_cost: 2.66, total_sessions: 56, total_api_calls: 315 },
    period_days: days,
  });
});

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

// ── Cron Jobs ───────────────────────────────────────────────────────────────
app.get('/api/cron/jobs', (_req, res) => jsonOk(res, store.cronJobs));
app.post('/api/cron/jobs', (req, res) => {
  const job = { id: `cron-${Date.now()}`, ...req.body, enabled: true, state: 'idle', schedule_display: req.body.schedule || '' };
  store.cronJobs.push(job);
  jsonOk(res, job);
});
app.post('/api/cron/jobs/:id/pause', (req, res) => {
  const job = store.cronJobs.find(j => j.id === req.params.id);
  if (job) job.enabled = false;
  jsonOk(res);
});
app.post('/api/cron/jobs/:id/resume', (req, res) => {
  const job = store.cronJobs.find(j => j.id === req.params.id);
  if (job) job.enabled = true;
  jsonOk(res);
});
app.post('/api/cron/jobs/:id/trigger', (req, res) => {
  const job = store.cronJobs.find(j => j.id === req.params.id);
  if (job) { job.last_run_at = new Date().toISOString(); job.state = 'running'; }
  jsonOk(res);
});
app.delete('/api/cron/jobs/:id', (req, res) => {
  const idx = store.cronJobs.findIndex(j => j.id === req.params.id);
  if (idx !== -1) store.cronJobs.splice(idx, 1);
  jsonOk(res);
});

// ── Profiles ────────────────────────────────────────────────────────────────
app.get('/api/profiles', (_req, res) => jsonOk(res, { profiles: store.profiles }));
app.post('/api/profiles', (req, res) => {
  const name = req.body.name || `profile-${Date.now()}`;
  const profile = { name, path: `/app/profiles/${name}`, is_default: false, model: null, provider: null, has_env: false, skill_count: 0 };
  store.profiles.push(profile);
  jsonOk(res, { ok: true, name, path: profile.path });
});
app.patch('/api/profiles/:name', (req, res) => {
  const profile = store.profiles.find(p => p.name === req.params.name);
  if (profile && req.body.new_name) profile.name = req.body.new_name;
  jsonOk(res, profile || {});
});
app.delete('/api/profiles/:name', (req, res) => {
  const idx = store.profiles.findIndex(p => p.name === req.params.name);
  if (idx !== -1 && !store.profiles[idx].is_default) store.profiles.splice(idx, 1);
  jsonOk(res);
});
app.get('/api/profiles/:name/setup-command', (req, res) =>
  jsonOk(res, { command: `hermes profile setup ${req.params.name}` }));
app.get('/api/profiles/:name/soul', (req, res) =>
  jsonOk(res, { content: `# Soul for ${req.params.name}\n\nYou are a helpful AI assistant.`, exists: true }));
app.put('/api/profiles/:name/soul', (_req, res) => jsonOk(res));

// ── Skills ──────────────────────────────────────────────────────────────────
app.get('/api/skills', (_req, res) => jsonOk(res, store.skills));
app.put('/api/skills/toggle', (req, res) => {
  const skill = store.skills.find(s => s.name === req.body.name);
  if (skill) skill.enabled = req.body.enabled;
  jsonOk(res);
});

// ── Model ────────────────────────────────────────────────────────────────────
app.get('/api/model/info', (_req, res) => jsonOk(res, {
  current: { model: 'claude-3-5-sonnet-20241022', provider: 'anthropic', capabilities: { supports_tools: true, supports_vision: true, supports_reasoning: true } },
}));
app.get('/api/model/options', (_req, res) => jsonOk(res, {
  providers: [
    { id: 'anthropic', label: 'Anthropic', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'] },
    { id: 'openai', label: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'] },
  ],
}));
app.get('/api/model/auxiliary', (_req, res) => jsonOk(res, { models: [] }));
app.post('/api/model/set', (req, res) => { store.config.model = req.body.model; store.config.provider = req.body.provider; jsonOk(res, { ok: true }); });

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
    // Auto-title from first 60 chars of first message
    await pgQuery(
      'INSERT INTO dashboard_sessions (id, title) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [sid, text.slice(0, 60) + (text.length > 60 ? '…' : '')],
    );
  }

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

  // Store user message
  await pgQuery(
    'INSERT INTO dashboard_messages (session_id, role, content) VALUES ($1, $2, $3)',
    [sid, 'user', text],
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
    // Forward to nanobot as SSE
    const nanobotRes = await fetch(nanobotUrl, {
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
      if (assistantContent) {
        pgQuery(
          'INSERT INTO dashboard_messages (session_id, role, content) VALUES ($1, $2, $3)',
          [sid, 'assistant', assistantContent],
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
        pgQuery(
          'INSERT INTO dashboard_messages (session_id, role, content) VALUES ($1, $2, $3)',
          [sid, 'assistant', fullResponse],
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

app.get('/api/docker/info', async (_req, res) => {
  try { res.json(await docker.info()); }
  catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

app.get('/api/docker/version', async (_req, res) => {
  try { res.json(await docker.version()); }
  catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

// ── SPA fallback (must be LAST) ─────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export { io };

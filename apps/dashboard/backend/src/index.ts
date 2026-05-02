import express from 'express';
import { createServer } from 'http';
import { createReadStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { execSync } from 'child_process';
import { IncomingMessage } from 'http';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(express.json());
const http = require('http');
const DOCKER_SOCKET = '/var/run/docker.sock';
const NANOBOT_URL = process.env.NANOBOT_API_URL || 'http://nanobot:8900';

// ---------------------------------------------------------------------------
// Active SSE streams keyed by session ID
// Each entry holds the nanobot HTTP request so /api/chat/stream can drain it
// ---------------------------------------------------------------------------
const activeStreams = new Map<string, IncomingMessage>();

// ---------------------------------------------------------------------------
// Docker Unix socket proxy
// ---------------------------------------------------------------------------
app.use('/api/docker', (req, res) => {
  const opts = {
    socketPath: DOCKER_SOCKET,
    path: req.originalUrl.replace('/api/docker', '') || '/',
    method: req.method,
    headers: Object.fromEntries(
      Object.entries(req.headers).filter(([, v]) => v !== undefined)
    ),
  };

  const pr = http.request(opts, (pr: any) => {
    res.writeHead(pr.statusCode, pr.headers);
    pr.pipe(res);
  });
  pr.on('error', (e: Error) => res.status(502).json({ error: e.message }));
  req.pipe(pr);
});

// ---------------------------------------------------------------------------
// App list from docker compose
// ---------------------------------------------------------------------------
app.get('/api/apps', (_req, res) => {
  try {
    const out = execSync('docker compose ls --format json 2>/dev/null || echo "[]"');
    res.json(out.toString().trim() ? JSON.parse(out.toString()) : []);
  } catch { res.json([]); }
});

// ---------------------------------------------------------------------------
// Container list
// ---------------------------------------------------------------------------
app.get('/api/containers', (_req, res) => {
  try {
    const out = execSync('docker ps -a --format "{{json .}}"');
    res.json(out.toString().trim().split('\n').filter(Boolean).map((l: string) => JSON.parse(l)));
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ---------------------------------------------------------------------------
// Container action
// ---------------------------------------------------------------------------
app.post('/api/containers/:id/:action', (req, res) => {
  const { id, action } = req.params;
  const valid = ['start', 'stop', 'restart', 'rm'];
  if (!valid.includes(action)) return res.status(400).json({ error: 'Invalid action' });
  try {
    const cmd = action === 'rm' ? `docker rm -f ${id}` : `docker ${action} ${id}`;
    res.json({ ok: true, out: execSync(cmd).toString() });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// ---------------------------------------------------------------------------
// nanobot agent integration
// ---------------------------------------------------------------------------

// POST /api/chat — send a message, initiate SSE stream for this session
// Body: { message: string, session_id?: string }
// Response: { session_id: string }
app.post('/api/chat', async (req, res) => {
  const { message, session_id: requestedSession } = req.body as {
    message: string;
    session_id?: string;
  };

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const sessionId = requestedSession || `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Kill any existing stream for this session
  if (activeStreams.has(sessionId)) {
    activeStreams.get(sessionId)?.destroy?.();
    activeStreams.delete(sessionId);
  }

  // Proxy to nanobot's streaming endpoint
  const postData = JSON.stringify({
    model: 'nanobot',
    messages: [{ role: 'user', content: message }],
    stream: true,
    session_id: sessionId,
  });

  const parsedUrl = new URL(NANOBOT_URL);
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'text/event-stream',
    },
    timeout: 120_000,
  };

  const proxyReq = http.request(options, (proxyRes: IncomingMessage) => {
    if (proxyRes.statusCode !== 200) {
      res.status(502).json({ error: `nanobot returned ${proxyRes.statusCode}` });
      return;
    }

    // Store the stream so /api/chat/stream can drain it
    activeStreams.set(sessionId, proxyRes);

    // Inform client the stream is set up
    res.json({ session_id: sessionId });
  });

  proxyReq.on('error', (e: Error) => {
    activeStreams.delete(sessionId);
    if (!res.headersSent) {
      res.status(502).json({ error: `nanobot connection failed: ${e.message}` });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    activeStreams.delete(sessionId);
    if (!res.headersSent) {
      res.status(504).json({ error: 'nanobot request timed out' });
    }
  });

  proxyReq.write(postData);
  proxyReq.end();
});

// GET /api/chat/stream?session=<id> — SSE stream for an existing chat session
app.get('/api/chat/stream', (req, res) => {
  const sessionId = (req.query.session as string) || '';

  const proxyReq = activeStreams.get(sessionId);
  if (!proxyReq) {
    // No active stream — return a no-op SSE stream that closes immediately
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('data: {"content":"[No active session. Send a message first.]"}\n\n');
    res.end();
    return;
  }

  // Pipe nanobot SSE chunks directly to the browser
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering if any
  });

  proxyReq.on('data', (chunk: Buffer) => {
    if (!res.writableEnded) {
      res.write(chunk);
    }
  });

  proxyReq.on('end', () => {
    activeStreams.delete(sessionId);
    if (!res.writableEnded) {
      res.end();
    }
  });

  proxyReq.on('error', () => {
    activeStreams.delete(sessionId);
    if (!res.writableEnded) {
      res.end();
    }
  });
});

// DELETE /api/chat?session=<id> — cancel an active stream
app.delete('/api/chat', (req, res) => {
  const sessionId = (req.query.session as string) || '';
  if (activeStreams.has(sessionId)) {
    activeStreams.get(sessionId)?.destroy?.();
    activeStreams.delete(sessionId);
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Static files — serve React SPA for all non-API routes (client-side routing)
// ---------------------------------------------------------------------------
const FRONTEND_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
app.use(express.static(FRONTEND_DIR));
app.get('*', (_req, res) => {
  const index = join(FRONTEND_DIR, 'index.html');
  if (existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(404).send('Frontend not built. Run: cd apps/dashboard/frontend && npm run build');
  }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`agent-os dashboard backend listening on :${PORT}`);
  console.log(`nanobot API: ${NANOBOT_URL}`);
});

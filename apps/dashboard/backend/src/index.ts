import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import Docker from 'dockerode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());

// Serve static frontend files
const staticPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(staticPath));

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── System ───────────────────────────────────────────────────────────────────
app.get('/api/system/uptime', (_req, res) => {
  res.json({ uptime: process.uptime() });
});

// ── Docker proxy (routes before SPA fallback) ───────────────────────────────
// GET /api/docker/containers/json?all=true
app.get('/api/docker/containers/json', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const containers = await docker.listContainers({ all });
    res.json(containers);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/docker/containers/:id/:action  (start | stop | restart | remove)
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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Docker info/version ──────────────────────────────────────────────────────
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

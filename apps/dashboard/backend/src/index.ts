import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

app.use(cors());
app.use(express.json());

// Serve static frontend files
const staticPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(staticPath));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// SPA fallback - serve index.html for non-API routes
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

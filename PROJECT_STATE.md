# agent-os Project State Document

## Overview
This document captures the current state of the agent-os project as of May 4, 2026. The project is a multi-service Docker-based development environment with a React TypeScript frontend, Node.js/Express backend, Python nanobot service, Go agent binaries, and PostgreSQL databases.

---

## Project Structure

```
/home/sean/.hermes/agent-os/
├── apps/
│   ├── dashboard/
│   │   ├── backend/          # Node.js/Express backend (TypeScript)
│   │   │   ├── src/
│   │   │   │   └── index.ts   # Main Express server with static file serving
│   │   │   ├── dist/          # Compiled output
│   │   │   └── package.json
│   │   └── frontend/         # React TypeScript frontend (Vite)
│   │       ├── src/
│   │       │   ├── main.tsx   # React entry point
│   │       │   ├── App.tsx     # Main app component with routes
│   │       │   ├── components/  # UI components (Sidebar, ChatPanel, StatusBar, etc.)
│   │       │   ├── pages/      # Page components (ContainerPage, AppStorePage, etc.)
│   │       │   ├── lib/         # Utilities (api.ts, dashboard-flags.ts, etc.)
│   │       │   └── lib/dashboard-flags.ts  # Dashboard feature flags
│   │       ├── dist/          # Built output (served by backend)
│   │       └── package.json
│   └── agent-core/           # Additional agent service
├── packages/
│   ├── nanobot/              # Python nanobot service
│   │   └── nanobot/
│   ├── observability/        # Python observability package
│   └── agent-adapter/        # Python adapter package
├── infra/
│   └── CasaOS/
│       ├── agent/            # Go agent binary
│       └── webhook-emitter/  # Go webhook emitter
├── packages/                 # NPM packages (shared-types)
├── Dockerfile                # Multi-stage Docker build
├── docker-compose.yml        # Docker compose configuration
├── turbo.json               # Turborepo configuration
├── package.json             # Root npm workspace config
├── pyproject.toml          # Python/uv workspace config
└── go.mod / go.sum          # Go module config
```

---

## Current Container State

### Running Containers
```
CONTAINER ID   IMAGE            COMMAND                STATUS       PORTS
agent-os       agent-os:test    "sh -c 'nanobot..."    healthy     0.0.0.0:1331->8900/tcp, [::]:1331->8900/tcp, 0.0.0.0:1332->9120/tcp, [::]:1332->9120/tcp
agent-os-nanobot ghcr.io/chonsong/agent-os:latest "sh -c 'python3 /pat..." unhealthy 127.0.0.1:8900->8900/tcp, 9120/tcp
agent-os-postgres postgres:16-alpine "docker-entrypoint.s..." healthy 127.0.0.1:5432->5432/tcp
agent-os-pg    postgres:16-alpine "docker-entrypoint.s..." healthy 127.0.0.1:5432->5432/tcp
hermes         hermes-agent     "/usr/bin/tini -g --..." healthy
hermes-dashboard hermes-agent "/usr/bin/tini -g --..." healthy
```

### Service Ports
- **agent-os (new)**: nanobot at 1331, backend at 1332
- **agent-os-nanobot (old)**: nanobot at 8900, backend at 9120 (internal only)

---

## Dockerfile Architecture

### Stage 1: ts-build (Node.js)
- Builds TypeScript via turbo
- Copies apps/dashboard/frontend/dist and apps/dashboard/backend/dist to /app
- Installs node_modules

### Stage 2: py-deps (Python)
- Uses `uv sync` for Python dependencies
- Installs nanobot, observability, agent-adapter packages

### Stage 3: go-build (Go)
- Builds agent binary: `WORKDIR /app/infra/CasaOS/agent` → `go build -o /bin/agent`
- Builds webhook-emitter: `WORKDIR /app/infra/CasaOS/webhook-emitter` → `go build -o /bin/webhook-emitter`

### Stage 4: Runtime (debian:13-slim)
- Installs Node.js 22 via NodeSource
- Installs uv for Python package management
- Copies Python packages, Go binaries, TypeScript builds
- Starts: `nanobot serve --host 0.0.0.0 --port 8900 & node /app/apps/dashboard/backend/dist/index.js`

---

## Backend Configuration

**File**: `/home/sean/.hermes/agent-os/apps/dashboard/backend/src/index.ts`

Key configuration:
- Express server on PORT=9120 (internal) / 1332 (mapped)
- Serves static files from `/app/apps/dashboard/frontend/dist`
- SPA fallback for non-API routes
- Socket.IO for real-time communication
- CORS enabled for all origins

```typescript
const staticPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(staticPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});
```

---

## Frontend Configuration

**File**: `/home/sean/.hermes/agent-os/apps/dashboard/frontend/vite.config.ts`

```typescript
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

**Entry Point**: `src/main.tsx`
```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Main App**: `src/App.tsx`
- Uses react-router-dom for routing (/containers, /appstore, /files, /tools, /settings)
- Imports Sidebar, ChatPanel, StatusBar components
- Uses `isDashboardEmbeddedChatEnabled()` from `@/lib/dashboard-flags`
- Renders with StrictMode

---

## Current Issues

### Critical: Frontend Blank Page
**Symptom**: Frontend at http://localhost:1332 shows completely blank page
**Observation**: Browser reports 1 uncaught JavaScript exception with empty message
**Confirmed working**:
- HTML page loads (HTTP 200)
- JS bundle loads (269KB, HTTP 200)
- Bundle contains valid React mount code: `X1.createRoot(document.getElementById("root")).render(...)`
- Backend path resolution is correct
- No console log messages, only empty JS exception

**Root cause**: Unknown - appears to be silent error during React initialization

**Commands to test**:
```bash
# Check container is running
docker ps | grep agent-os

# Test frontend response
curl -s http://localhost:1332/

# Check JS bundle loads
curl -s -I http://localhost:1332/assets/index-D-84fo57.js

# Check backend path resolution inside container
docker exec agent-os node -e "const path = require('path'); console.log(path.resolve('/app/apps/dashboard/backend/dist', '../../frontend/dist'))"

# Get browser console via hermes
curl -s -X POST http://localhost:8642/v1/runs -H "Content-Type: application/json" -d '{"input": "Navigate to http://localhost:1332 and check browser_console for errors."}'
```

---

## Hermes Integration

**Hermes API**: localhost:8642
- POST `/v1/runs` - Start a run with `input` field containing task
- GET `/v1/runs/{run_id}/events` - SSE event stream

**Browser Tools Available**:
- `browser_navigate` - Navigate to URL
- `browser_snapshot` - Get page accessibility tree
- `browser_vision` - Take screenshot and analyze
- `browser_console` - Get browser console messages/errors

**Example**:
```bash
# Start browser test
RUN_ID=$(curl -s -X POST http://localhost:8642/v1/runs -H "Content-Type: application/json" -d '{"input": "Navigate to http://localhost:1332 and use browser_snapshot."}' | grep -o '"run_id":"[^"]*"' | cut -d'"' -f4)

# Monitor events
curl -s -N http://localhost:8642/v1/runs/$RUN_ID/events
```

---

## Python Packages (pyproject.toml)

Workspace members:
- `packages/nanobot` (with nanobot/bridge, nanobot/core subpackages)
- `packages/observability`
- `packages/agent-adapter`

Installed via `uv sync` with `--system` flag for nanobot.

Dependencies include: prompt-toolkit, aiohttp, websockets, pyyaml, rich

---

## Go Binaries

### agent
- Module path: `github.com/CasaOS/agent`
- Entry: `infra/CasaOS/agent/main.go`
- Builds to `/bin/agent`

### webhook-emitter
- Module path: `github.com/CasaOS/webhook-emitter`
- Entry: `infra/CasaOS/webhook-emitter/main.go`
- Builds to `/bin/webhook-emitter`

---

## Testing Commands

### Frontend Testing
```bash
# Via hermes browser
curl -s -X POST http://localhost:8642/v1/runs -H "Content-Type: application/json" \
  -d '{"input": "Navigate to http://localhost:1332 and use browser_vision to describe what you see."}'

# Check network requests
curl -s -X POST http://localhost:8642/v1/runs -H "Content-Type: application/json" \
  -d '{"input": "Use browser_network to check what resources are being loaded from http://localhost:1332"}'
```

### Container Logs
```bash
docker logs agent-os --tail 50
```

### Rebuild and Restart
```bash
cd /home/sean/.hermes/agent-os
docker build -t agent-os:test -f Dockerfile .
docker stop agent-os && docker rm agent-os
docker run -d --name agent-os -p 1331:8900 -p 1332:9120 agent-os:test
```

### Copy Fresh Build Artifacts
```bash
docker cp /home/sean/.hermes/agent-os/apps/dashboard/frontend/dist/. agent-os:/app/apps/dashboard/frontend/dist/
docker cp /home/sean/.hermes/agent-os/apps/dashboard/backend/dist/. agent-os:/app/apps/dashboard/backend/dist/
docker commit agent-os agent-os:test
docker restart agent-os
```

---

## Remaining Work / Next Steps

1. **Fix frontend blank page issue** - The React app crashes silently during initialization with an empty JS exception. Investigation approaches:
   - Compare working dev server vs broken production build
   - Check for missing CSS imports or font loading failures
   - Verify React 19 compatibility with all dependencies
   - Consider if `@nous-research/ui` package has initialization issues

2. **Verify all services are operational**:
   - nanobot at port 1331 (8900 internal)
   - backend at port 1332 (9120 internal)
   - PostgreSQL at port 5432

3. **Browser-based testing**: Use hermes browser tools to:
   - Navigate to frontend and verify it renders
   - Test backend API endpoints
   - Validate nanobot functionality

4. **Complete original project goals**: Once frontend is working, use hermes browser tools to:
   - Complete any remaining development tasks
   - Run tests or validation
   - Verify end-to-end functionality

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build configuration |
| `docker-compose.yml` | Container orchestration |
| `apps/dashboard/backend/src/index.ts` | Express server with static serving |
| `apps/dashboard/frontend/src/App.tsx` | Main React app with routing |
| `apps/dashboard/frontend/src/main.tsx` | React entry point |
| `pyproject.toml` | Python/uv workspace config |
| `turbo.json` | Turborepo task configuration |
| `infra/CasaOS/agent/main.go` | Go agent entry point |
| `infra/CasaOS/webhook-emitter/main.go` | Go webhook emitter entry |
| `packages/nanobot/` | Python nanobot service |
| `/home/sean/.hermes/hermes-agent/` | Hermes agent code (separate project) |
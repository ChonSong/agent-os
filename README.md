# agent-os

> Self-hosted AI agent dashboard — Express backend, React SPA, Hermes Agent, PostgreSQL, Cloudflare tunnel

**Dashboard:** [agent-os.nousresearch.com](https://agent-os.nousresearch.com) (via Cloudflare Tunnel)

---

## Quick Architecture Overview

```
                    Internet
                       │
              ┌────────▼─────────┐
              │  Cloudflare      │
              │  Tunnel (:443)   │
              └────────┬─────────┘
                       │
         ┌─────────────▼──────────────┐
         │  agent-os-backend (:3001)  │
         │  Express + Socket.IO       │
         │  Dockerode + PG pool       │
         │  Serves React SPA from     │
         │  frontend/dist             │
         └──┬──────────┬──────────┬───┘
            │          │          │
    ┌───────▼──┐  ┌───▼────┐  ┌─▼──────────────┐
    │ PostgreSQL│  │ Docker │  │ Hermes Agent    │
    │ (:5432)   │  │ Socket │  │ (host network)  │
    │           │  │(mgmt)  │  │ :8642 (API)     │
    │ sessions  │  └────────┘  │ :9119 (metrics) │
    │ events    │              │ via host.docker  │
    │ cron_jobs │              │  .internal:8642  │
    │ profiles  │              └────────┬────────┘
    │ skills    │                       │
    └───────────┘              ┌────────▼─────────┐
                               │ LLM Provider     │
                               │ (OpenAI-compat)  │
                               └──────────────────┘
```

**Key idea:** Hermes Agent runs as a host-level container (`network_mode: host`) independently of the docker-compose stack. The backend connects to it via `host.docker.internal:8642`.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS v4 + @nous-research/ui |
| Backend | Node.js/Express + Socket.IO + Dockerode + PostgreSQL |
| Agent | Hermes Agent (nousresearch/hermes-agent) — OpenAI-compatible `/v1/chat/completions` |
| Database | PostgreSQL 16-alpine |
| Tunnel | Cloudflare Tunnels (cloudflared) |
| Webhook Emitter | Go service polling Docker events |
| CI/CD | GitHub Actions (test → build → push to GHCR) |

---

## Deploy

### Option 1: Docker Compose (recommended)

```bash
# Clone the repo
git clone https://github.com/ChonSong/agent-os.git
cd agent-os

# Create .env file (see Environment Variables below)
cp .env.example .env
# Edit .env with your values

# Pull latest image and start
docker compose pull
docker compose up -d
```

### Option 2: Manual Docker Run

```bash
# Pull image
docker pull ghcr.io/chonsong/agent-os:latest

# Start PostgreSQL
docker run -d --name agent-os-postgres \
  -e POSTGRES_USER=agentos \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=agentos \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine

# Start backend
docker run -d --name agent-os-backend \
  -p 127.0.0.1:3001:3001 \
  --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL=postgresql://agentos:your_password@postgres:5432/agentos \
  -e HERMES_API_URL=http://host.docker.internal:8642 \
  -v /var/run/docker.sock:/var/run/docker.sock:rw \
  ghcr.io/chonsong/agent-os:latest backend
```

### Prerequisites

- Hermes Agent must be running on the host (or accessible at the `HERMES_API_URL` endpoint)
- PostgreSQL must be running and accessible
- For external access: Cloudflare Tunnel token at `/home/sean/.cloudflared/agent-os-argo-token.txt`

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`) |
| `HERMES_API_URL` | Yes | — | Hermes Agent API endpoint (e.g. `http://host.docker.internal:8642`) |
| `NODE_ENV` | No | `production` | Node environment |
| `PORT` | No | `3001` | Backend listen port |
| `SESSION_SECRET` | No | `change-me-in-production` | Session encryption secret |
| `GITHUB_TOKEN` | No | — | GitHub API token (for CI/deploys) |
| `DEPLOY_TOKEN` | No | — | Deploy webhook token |

### PostgreSQL (in docker-compose)

| Variable | Default |
|----------|---------|
| `POSTGRES_USER` | `agentos` |
| `POSTGRES_PASSWORD` | `agentos_secure_pg_pass_2026` |
| `POSTGRES_DB` | `agentos` |

---

## Features (22 Pages)

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/dashboard` | Aggregated metrics, system overview |
| Chat | `/chat` | SSE-based chat with Hermes Agent |
| Containers | `/containers` | Docker container management with real-time stats |
| Terminal | `/terminal` | Full PTY terminal via xterm.js |
| Sessions | `/sessions` | Session history with search |
| Memory | `/memory` | Agent memory file browser |
| Files | `/files` | Full CRUD file explorer |
| Cron | `/cron` | Scheduled agent job management |
| Profiles | `/profiles` | Profile CRUD with soul.md editor |
| Skills | `/skills` | Skill management with toggle |
| Tools | `/tools` | Toolset configuration |
| MCP | `/mcp` | MCP server management |
| Models | `/models` | Model info and assignment |
| Analytics | `/analytics` | Token/session/model analytics |
| Observability | `/observability` | AIE event timeline |
| Settings | `/settings` | Interactive settings + theme picker |
| Config | `/config` | Raw config editor |
| Env | `/env` | Environment variable management |
| Logs | `/logs` | Real-time container log streaming |
| Docs | `/docs` | Documentation |
| App Store | `/appstore` | Plugin store UI (stubs) |

### Themes

11 themes via `data-theme` CSS variables — Warm Bento (default), Matrix, Claude Official/Classic/Slate/Nous (dark + light variants).

---

## Monorepo Structure

```
apps/
  dashboard/
    backend/     → Express API (75+ routes, Socket.IO, Dockerode, PG)
    frontend/    → React SPA (22 pages, 11 themes, xterm.js terminal)
packages/
  nanobot/         → Python agent core (removed from runtime, code remains for reference)
  agent-adapter/   → Abstract AgentAdapter protocol
  observability/   → AIE event types + logger
  shared-types/    → Shared TypeScript types
infra/
  postgres/        → 8 SQL migrations
  terraform/       → Cloudflare IaC
```

---

## Quick Start (Development)

```bash
npm ci
npm run build    # Build all TS packages
npm run dev      # Dev server
npm run test     # Run tests
```

---

## PostgreSQL Migrations

Migrations live in `infra/postgres/migrations/` (8 files, 001–008).

```bash
psql "$DATABASE_URL" -f infra/postgres/migrations/001_initial.sql
# Or run all:
./infra/postgres/run_migrations.sh
```

---

## Deployment Notes

- **CI** builds on push to `main`, pushes image to `ghcr.io/chonsong/agent-os:latest`
- **Deploy is manual**: `docker pull ghcr.io/chonsong/agent-os:latest && docker compose up -d`
- Hermes Agent runs **outside** docker-compose (host network mode)
- Frontend is served by Express from the built image; override volume available at `/home/sean/.hermes/agent-os-patched/frontend-dist`

---

## Documentation

| File | Purpose |
|------|---------|
| [STATE_OF_AGENT_OS.md](STATE_OF_AGENT_OS.md) | Detailed current status, API surface, known issues, and next steps |
| [MASTER_PLAN.md](MASTER_PLAN.md) | Architecture phases and planning |
| [SPEC.md](SPEC.md) | Original Phase 1 specification (historical) |

---

## Related Projects

- **[Hermes Agent](https://github.com/nousresearch/hermes-agent)** — The AI agent powering agent-os
- **[repo-transmute](https://github.com/ChonSong/repo-transmute)** — AI-powered code transpilation engine
- **[hermes-workspace](https://github.com/outsourc-e/hermes-workspace)** — Theme system and component designs

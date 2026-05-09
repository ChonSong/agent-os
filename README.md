# agent-os

> Agentic OS — self-hosted AI agent platform with a polyglot monorepo architecture

**Dashboard:** [agent-os.nousresearch.com](https://agent-os.nousresearch.com) (via Cloudflare Tunnel)

## Features

| Category | Features |
|---|---|
| 💬 **Chat** | SSE streaming, tool call rendering, multi-session, token usage tracking |
| 🐳 **Containers** | Real-time Docker stats, start/stop/restart, live logs via Socket.IO |
| 💻 **Terminal** | Full PTY terminal via Docker exec + xterm.js (new) |
| 🧠 **Memory** | Browse, view, and edit agent memory files with search (new) |
| 🗄️ **Dashboard** | Aggregated metrics: sessions, tokens, containers, events (new) |
| ⏰ **Cron** | Create, manage, pause/resume/trigger scheduled agent jobs |
| 👤 **Profiles** | Profile CRUD with soul.md editor |
| 📁 **Files** | Full CRUD file browser (read, create, edit, delete) |
| 🔧 **Tools** | Toolset management (terminal, web, file, delegation) |
| 📊 **Analytics** | Token/session/model analytics from PostgreSQL |
| 🎨 **Themes** | 11 themes: Warm Bento, Matrix, Claude Official/Classic/Slate/Nous (dark + light) (new) |
| 📝 **Sessions** | Session history with search and message copy |
| 🔍 **Observability** | AIE event timeline and type breakdown |
| 🤖 **Models** | Model info, options, and assignment |
| 🔌 **Skills** | Skill management from disk + PG toggle state |
| 🌐 **Config** | Interactive config editor with save |
| 🔑 **Env** | Environment variable management with reveal |
| 📋 **Logs** | Real-time Docker container log streaming |

## Architecture

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
    │ PostgreSQL│  │ Nanobot│  │ Docker Socket   │
    │ (:5432)   │  │(:8900) │  │ (container mgmt)│
    │           │  │        │  └─────────────────┘
    │ sessions  │  │ /v1/   │
    │ events    │  │ chat/  │
    │ cron_jobs │  │ comple-│
    │ profiles  │  │ tions  │
    │ skills    │  │        │
    └───────────┘  └───┬────┘
                       │
              ┌────────▼─────────┐
              │ LLM Provider     │
              │ (OpenAI-compat)  │
              └──────────────────┘
```

## Stack

- **Frontend:** React 19 + Vite + Tailwind CSS + @nous-research/ui
- **Backend:** Node.js/Express + Socket.IO + Dockerode + PostgreSQL
- **Agent:** Python nanobot (aiohttp) — OpenAI-compatible `/v1/chat/completions`
- **Webhook Emitter:** Go service polling Docker events
- **Deploy:** Docker + Cloudflare Tunnels
- **CI:** GitHub Actions (test go/python/node → build → deploy)

## Monorepo Structure

```
apps/
  dashboard/
    backend/     → Express API (75+ routes, Socket.IO, Dockerode, PG)
    frontend/    → React SPA (19 pages, 11 themes, xterm.js terminal)
    agent-core/  → Python package (hatch)
packages/
  nanobot/         → Python aiohttp agent core
  agent-adapter/   → Abstract AgentAdapter protocol
  observability/   → AIE event types + logger
  shared-types/    → Shared TypeScript types
infra/
  CasaOS/          → Go webhook-emitter + agent
  postgres/        → 8 SQL migrations
  terraform/       → Cloudflare IaC
```

## Quick Start

```bash
# Install JS deps
npm ci

# Build all
npm run build

# Dev all
npm run dev

# Run tests
npm run test
```

## Frontend Pages

| Path | Page | Status |
|------|------|--------|
| `/dashboard` | Dashboard (KPI cards, container stats, events) | ✅ |
| `/containers` | Container management with real-time stats | ✅ |
| `/sessions` | Session history + search | ✅ |
| `/cron` | Cron job management | ✅ |
| `/profiles` | Profile CRUD + soul.md | ✅ |
| `/memory` | Memory browser (view/edit agent memory) | ✅ |
| `/mcp` | MCP server management (add, test, scan tools) | ✅ |
| `/terminal` | Full PTY terminal | ✅ |
| `/analytics` | Token/session/model analytics | ✅ |
| `/files` | File explorer (CRUD) | ✅ |
| `/tools` | Toolset management | ✅ |
| `/settings` | Interactive settings + theme picker | ✅ |
| `/config` | Config editor | ✅ |
| `/env` | Environment variables | ✅ |
| `/logs` | Real-time container logs | ✅ |
| `/models` | Model info + assignment | ✅ |
| `/docs` | Documentation | ✅ |

## Themes

agent-os supports 11 themes via `data-theme` CSS variables:

- **Warm Bento** (default, warm cream/peach)
- **Matrix** / **Matrix Light** (green-on-black)
- **Claude Official** / **Claude Light** (indigo)
- **Claude Classic** / **Classic Light** (amber)
- **Claude Slate** / **Slate Light** (blue-gray)
- **Claude Nous** / **Nous Light** (teal + amber)

Switch via Settings → Theme Picker.

## PostgreSQL Migrations

Migrations live in `infra/postgres/migrations/` and are applied in filename order.

```bash
# Run all migrations
./infra/postgres/run_migrations.sh

# Or manually:
psql "$DATABASE_URL" -f infra/postgres/migrations/001_initial.sql
```

## Deployment

### Running Containers

| Container | Image | Ports |
|-----------|-------|-------|
| `agent-os-backend` | `ghcr.io/chonsong/agent-os:latest` | 3001, 1331→3001 |
| `agent-os-nanobot` | `ghcr.io/chonsong/agent-os:latest` | 8900, 9120 |
| `agent-os-webhook-emitter` | `ghcr.io/chonsong/agent-os:latest` | — |
| `agent-os-postgres` | `postgres:16-alpine` | 5432 |
| `agent-os-cloudflared` | `cloudflare/cloudflared:2026.3.0` | — |

### Deploy after CI build

```bash
docker pull ghcr.io/chonsong/agent-os:latest
docker stop agent-os-backend agent-os-nanobot agent-os-webhook-emitter
docker rm agent-os-backend agent-os-nanobot agent-os-webhook-emitter
# Recreate with docker run (see docker-compose.yml for args)
```

## Related Projects

- **[repo-transmute](https://github.com/ChonSong/repo-transmute)** — AI-powered code transpilation engine with frontend migration capability (Phase 7)
- **[hermes-workspace](https://github.com/outsourc-e/hermes-workspace)** — Theme system and component designs migrated from here

## See Also

- [SPEC.md](SPEC.md) — Full project specification
- [STATE_OF_AGENT_OS.md](STATE_OF_AGENT_OS.md) — Current project status and known issues

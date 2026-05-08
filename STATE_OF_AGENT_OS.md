# State of agent-os

**Date:** 2026-05-08  
**Author:** Hermes Agent (for Sean)  
**Repo:** [ChonSong/agent-os](https://github.com/ChonSong/agent-os)

---

## 1. What Is agent-os?

agent-os is a **polyglot monorepo** that consolidates an autonomous AI agent stack into a single repository:

| Component | Language | Role |
|-----------|----------|------|
| `packages/nanobot` | Python | Agent runtime — async loop, tool calling, session management, 15+ channel adapters, OpenAI-compatible API |
| `packages/agent-adapter` | Python | Agent-agnostic interface (ABC) + NanobotAdapter wrapping nanobot's HTTP API |
| `packages/observability` | Python | AIE event types (TOOL_CALL, DRIFT, CIRCUIT_OPEN, TASK_COMPLETE, DELEGATION, ASSUMPTION) + JSONL logger |
| `packages/shared-types` | TypeScript | Shared type definitions for the dashboard |
| `apps/dashboard/frontend` | TypeScript/React | Vite + React SPA with 17+ pages (Containers, Chat, Sessions, Files, Skills, Observability, Settings…) |
| `apps/dashboard/backend` | TypeScript/Node | Express server with Docker proxy, container CRUD, file API, Socket.IO |
| `apps/dashboard/agent-core` | Python | Nanobot sidecar service (hatch-built) |
| `infra/CasaOS/agent` | Go | CasaOS CLI wrapper |
| `infra/CasaOS/webhook-emitter` | Go | MessageBus → HTTP webhook sidecar |
| `infra/postgres/` | SQL | 8 PostgreSQL migrations (initial schema → query optimization) |
| `infra/terraform/` | HCL | Neon PostgreSQL + Cloudflare Tunnel + Access IaC |

**Build system:** Turborepo (JS/TS), `@nx-go` plugin (Go), `uv` (Python)  
**CI/CD:** GitHub Actions with path-filtered jobs (Python, Node, Go in parallel)  
**Versioning:** Semantic release with conventional commits  
**Containerization:** Multi-stage Dockerfile (Node → Python → Go → debian:13-slim runtime)

---

## 2. Current State by Component

### 2.1 nanobot (`packages/nanobot/`) — ✅ Fully migrated, production-grade

The HKUDS/nanobot fork is the agent engine. It's mature and complete:

- **AgentLoop** (`agent/loop.py`, 1356 lines) — core async processing with tool calling, consolidation, context management
- **AgentRunner** (`agent/runner.py`) — shared execution loop
- **Tool registry** — file, shell, web, search, MCP, cron, spawn, ask, notebook, sandbox, memory
- **SessionManager** — file-based session persistence with atomic writes
- **OpenAI-compatible API** (`api/server.py`) — `/v1/chat/completions` with SSE streaming
- **MessageBus** — async event queue with typed events
- **15+ channel adapters** — Telegram, Discord, Slack, WeChat, Feishu, Matrix, QQ, WhatsApp, email, DingTalk, MS Teams, WebSocket
- **CronService** — built-in cron scheduling
- **HeartbeatService** — health monitoring
- **Providers** — OpenAI, Anthropic, Azure, GitHub Copilot, MiniMax, Mistral, StepFun + LiteLLM routing
- **Security** — network restrictions via `security/network.py`
- **Skills system** — built-in skill loader with clawhub, github, memory, summarize, tmux, weather skills
- **Test suite** — 100+ test files covering agents, channels, providers, tools, config, cron, sessions, CLI

### 2.2 Dashboard Frontend (`apps/dashboard/frontend/`) — ✅ Substantial, partially working

17+ pages with React Router:
- `ContainerPage` — real-time Socket.IO stats header
- `ChatPage` — agent chat interface
- `SessionsPage` — session management with copy
- `FileExplorerPage` — full CRUD (create, edit, delete files)
- `SettingsPage` — interactive settings with save
- `AppStorePage`, `AnalyticsPage`, `CronPage`, `DocsPage`, `EnvPage`, `LogsPage`, `ModelsPage`, `ObservabilityPage`, `ProfilesPage`, `SkillsPage`, `ToolManagerPage`, `ConfigPage`
- Components: ChatPanel, Sidebar, StatusBar, ThemeSwitcher, ModelPickerDialog, ToolCall, Markdown, ObservabilityPanel
- UI library: custom components + `@nous-research/ui`
- i18n support with LanguageSwitcher
- Feature flags via `dashboard-flags.ts`
- Gateway client (`gatewayClient.ts`) + Socket.IO client (`socket.ts`)

**Known issue:** Frontend blank page in production build — React crashes silently during initialization. Works in dev mode (Vite). Suspected React 19 compatibility issue with `@nous-research/ui`.

### 2.3 Dashboard Backend (`apps/dashboard/backend/`) — ⚠️ Partially implemented

Express server on port 9120 with:
- Static file serving for frontend dist
- Docker proxy + container CRUD endpoints
- File API (read, create, edit, delete) — recently fixed routing issues
- Socket.IO for real-time communication
- SPA fallback routing

**Missing:** No agent integration. The backend doesn't call NanobotAdapter or route to nanobot's API. No WebSocket/SSE endpoint for agent streaming. No session persistence to PostgreSQL. The frontend API client calls Hermes gateway endpoints that don't exist in this backend.

### 2.4 agent-adapter (`packages/agent-adapter/`) — ⚠️ Defined but not connected

- `AgentAdapter` ABC with `run()` and `stream()` abstract methods
- `NanobotAdapter` implementing via HTTP calls to nanobot's OpenAI-compatible API
- Tests exist for the protocol
- **Not wired into the dashboard backend** — dead code until connected

### 2.5 observability (`packages/observability/`) — ⚠️ Defined but not emitting

- Event types: TOOL_CALL, DRIFT, CIRCUIT_OPEN, TASK_COMPLETE, DELEGATION, ASSUMPTION
- `AIELogger` writes JSONL files
- `agent_hook.py` exists to hook into agent loops
- `drift.py` for drift scoring
- Tests for event construction
- **AgentLoop never emits these events** — the hook wiring is incomplete

### 2.6 PostgreSQL (`infra/postgres/`) — ✅ Schema designed, 8 migrations

```
001_initial.sql              — core tables (documents, agent_sessions, aie_events, agent_messages)
002_observability_tables.sql — expanded observability schema
003_dashboard_sessions.sql   — dashboard-specific session tables
004_pg_cron_jobs.sql         — pg_cron scheduled jobs
005_skill_settings.sql       — skill configuration storage
006_profiles_soul.sql        — agent profiles and SOUL.md storage
007_optimize_queries.sql     — index optimization
008_fix_indexes.sql          — index fixes
```

Plus a `run_migrations.sh` script and connection pooling config. **Not yet connected to the backend.**

### 2.7 CasaOS Go Tools (`infra/CasaOS/`) — ✅ Builds, pre-compiled

- `agent/` — Go CLI with tests, pre-compiled binary exists
- `webhook-emitter/` — Go webhook sidecar, pre-compiled binary exists

### 2.8 Infrastructure (`infra/terraform/`, `infra/nginx.conf`) — 📝 Skeleton

- Terraform: `main.tf` + `variables.auto.tfvars.example` for Neon PostgreSQL + Cloudflare Tunnel + Access
- Nginx: reverse proxy config
- MCP server for Cloudflare Zero Trust (`packages/mcp-servers/cloudflare-zero-trust/`)
- Not deployed yet

### 2.9 Docker (`Dockerfile`, `docker-compose.yml`) — ✅ Working

Multi-stage build:
1. **ts-build** — Node.js, builds TypeScript via turbo
2. **py-deps** — Python with `uv sync`
3. **go-build** — Compiles Go binaries
4. **Runtime** — debian:13-slim with Node.js 22, Python, Go binaries

Docker Compose defines: nanobot + dashboard + PostgreSQL containers

**Running on host:** `agent-os` container on ports 1331 (nanobot) and 1332 (backend), plus `agent-os-postgres` on 5432.

Scripts: `scripts/entrypoint.sh`, `scripts/watchdog.py`, `scripts/start-agent.sh`, `scripts/agent-deploy.sh`

---

## 3. Task Completion Status

### Completed (Phase 1 — Scaffold)

| Task | Status | Result |
|------|--------|--------|
| Create `ChonSong/agent-os` repo | ✅ Done | Created via GitHub API |
| Write root config files | ✅ Done | package.json, turbo.json, nx.json, pyproject.toml, go.mod, SPEC.md |
| GitHub Actions CI workflow | ✅ Done | Path-filtered Python/Node/Go jobs |
| Semantic release workflow | ✅ Done | `.releaserc` + release.yml |
| Push scaffold, verify CI | ✅ Done | Pushed to main |
| Migrate nanobot | ✅ Done | packages/nanobot with full source + 100+ tests |
| Migrate everything-dashboard | ✅ Done | frontend + backend + agent-core |
| Migrate CasaOS Go tools | ✅ Done | agent + webhook-emitter in infra/CasaOS/ |
| Create agent-adapter | ✅ Done | ABC + NanobotAdapter + tests |
| Create observability | ✅ Done | Events + logger + drift + hook |
| Create shared-types | ✅ Done | TypeScript types |
| PostgreSQL schema + migrations | ✅ Done | 8 migration files |
| Docker multi-stage build | ✅ Done | Working Dockerfile + compose |
| Frontend pages (17+) | ✅ Done | Container CRUD, Chat, Files, Sessions, Settings, etc. |
| File explorer CRUD | ✅ Done | Create, edit, delete with toast notifications |
| Settings page interactivity | ✅ Done | Save functionality |
| Container real-time stats | ✅ Done | Socket.IO + stats header |
| Session copy messages | ✅ Done | Working |
| Various bug fixes | ✅ Done | Routing, toast null safety, missing props |

### In Progress / Not Started

| Task | Status | Blocker |
|------|--------|---------|
| Wire observability into AgentLoop | 🔴 Not started | Needs hook integration into loop.py |
| Wire agent-adapter into dashboard backend | 🔴 Not started | Backend needs chat → nanobot routing |
| PostgreSQL integration in backend | 🔴 Not started | Backend still uses filesystem |
| Fix frontend blank page (production build) | 🔴 Known bug | Silent React initialization crash |
| Terraform deployment | 🔴 Not started | Infrastructure not provisioned |
| Cloudflare Tunnel + Access | 🟡 Skeleton | MCP server exists, not deployed |
| Watchdog service | 🟡 Script exists | `watchdog.py` written, not running |
| Authentication | 🔴 Not designed | No auth middleware |

---

## 4. Architecture Assessment

### What's Right

1. **nanobot as agent engine** — correct choice. Mature, API-first, full tool calling, already forked and running
2. **AgentAdapter abstraction** — decouples dashboard from nanobot specifically
3. **Monorepo structure** — clean separation: apps/, packages/, infra/
4. **Polyglot build system** — Turborepo + nx-go + uv, each language uses its native toolchain
5. **Path-filtered CI** — only runs jobs for changed file types
6. **Docker multi-stage build** — efficient layering

### What's Missing (Critical Path)

1. **Control Plane** — The biggest gap. The dashboard backend is a Docker proxy, not an agent dashboard backend. It needs:
   - Chat message routing to nanobot `/v1/chat/completions`
   - SSE/WebSocket streaming for real-time agent output
   - Session persistence to PostgreSQL
   - Health monitoring and watchdog

2. **Observability wiring** — AIE events defined but never emitted from AgentLoop. The hook exists (`agent_hook.py`) but isn't registered.

3. **Frontend-backend API alignment** — Frontend calls Hermes gateway endpoints that don't exist in the agent-os backend.

4. **Production frontend build** — Blank page issue blocks deployment.

---

## 5. Ecosystem Context

agent-os is one project in a broader autonomous agent ecosystem:

### Running Infrastructure

| Service | Host | Status |
|---------|------|--------|
| Hermes Agent | Docker on hpprobook (Arch Linux) | ✅ Healthy |
| agent-os container | Docker, ports 1331/1332 | ✅ Running |
| agent-os-postgres | Docker, port 5432 | ✅ Healthy |
| hermes-sync | Git push to `ChonSong/hermes-sync` every 12h | ✅ Active |

### Roadmap Engine

A separate autonomy system at `/opt/data/hermes-sync/` that:
- Maintains `roadmap.json` with goals, projects, tasks, ideas, learnings, blockers
- Runs nightly: research → execute → report cycle
- Tracks 5 projects: repo-transmute, everything-dashboard, roadmap-engine, hermes-agent, agent-os
- Has task types: test, code, research, browser, review
- Generates ideas from code TODOs, GitHub issues, CI failures

### Skills Ecosystem (Hermes)

90+ skills across categories: agents, autonomous-ai-agents, creative, data-science, devops, github, mlops, productivity, research, etc. Key ones for agent-os:
- `hermes-agent` — Hermes CLI configuration and management
- `hermes-docker-workflow` — Docker container build/run
- `claude-code`, `codex`, `opencode` — autonomous coding agent delegation
- `subagent-driven-development` — execute plans via delegate_task

---

## 6. Key Files Quick Reference

| Path | What It Is |
|------|-----------|
| `packages/nanobot/nanobot/agent/loop.py` | Core agent loop — where events should be emitted |
| `packages/nanobot/nanobot/api/server.py` | OpenAI-compatible API — the interface the control plane calls |
| `packages/nanobot/nanobot/session/manager.py` | File-based session persistence |
| `packages/agent-adapter/agent_adapter/protocol.py` | AgentAdapter ABC |
| `packages/agent-adapter/agent_adapter/nanobot_adapter.py` | HTTP adapter wrapping nanobot API |
| `packages/observability/observability/events.py` | AIE event types |
| `packages/observability/observability/agent_hook.py` | Hook to wire into agent loops |
| `apps/dashboard/backend/src/index.ts` | Express backend — needs control plane addition |
| `apps/dashboard/frontend/src/App.tsx` | React app with 17+ page routes |
| `apps/dashboard/frontend/src/lib/api.ts` | API client (currently targeting Hermes gateway) |
| `infra/postgres/migrations/` | 8 SQL migrations |
| `Dockerfile` | Multi-stage build (Node → Python → Go → Runtime) |
| `docker-compose.yml` | Service orchestration |
| `PROJECT_STATE.md` | Detailed container/build state (May 4, 2026) |
| `AGENT_OS_REVIEW.md` | Architecture review with critical gaps analysis |
| `SPEC.md` | Phase 1 specification |

---

## 7. Recommended Next Steps

### Priority 1: Fix the control plane (makes the system "agentic")

1. Replace/augment the Express backend with agent routing:
   - `POST /api/chat` → NanobotAdapter.stream() → SSE to frontend
   - `GET /api/sessions` → query PostgreSQL
   - `GET /api/agent/health` → nanobot healthcheck proxy
2. Wire observability: AgentLoop hooks → AIELogger → PostgreSQL `aie_events` table

### Priority 2: Fix the production frontend

3. Debug the blank page issue (React 19 + @nous-research/ui compatibility)
4. Align frontend API client with actual backend endpoints

### Priority 3: Infrastructure

5. Deploy PostgreSQL (Neon/Supabase) with migrations
6. Set up Cloudflare Tunnel for external access
7. Add authentication middleware

### Priority 4: Reliability

8. Enable watchdog service for nanobot crash recovery
9. Add backup cron for session state
10. Wire the remaining CI checks (Go builds, Python lint)

---

## 8. Commit History (Recent)

```
25e3901 fix(backend): remove stray closing brace from file routes
9f9c175 fix(backend): move /api/files/read/* before wildcard /api/files/*
90ebad0 fix(api): readFileContent path to always include leading slash
ed06f72 fix(FileExplorerPage): use showToast(message, type) not toast.() calls
0a72f05 fix(FileExplorerPage): remaining toast null safety
54c11d0 fix(FileExplorerPage): null safety for toast hook and preview state
32d75e7 feat(FileExplorerPage): full CRUD — create, edit, delete files
df010ed fix(SettingsPage): add missing saving prop to SettingInput calls
4afdcd7 feat: copy messages in SessionsPage + interactive SettingsPage
7156e38 feat: ContainerPage real-time Socket.IO + stats header
```

---

## 9. Origin Story

agent-os was born from the **OpenClaw** agent ecosystem migration in April 2026:

1. **OpenClaw era (March 2026):** 177-file workspace with 13+ subagents running on Sean's HP ProBook. Night Owl scanner ran 12×/night producing 17KB reports. Telegram delivery was broken. Only 3 agents actually worked (zoul, codi, coder). Fixed 5 repo-transmute bugs overnight autonomously.

2. **Hermes migration (April 29, 2026):** Migrated from OpenClaw to Hermes Agent running in Docker. Workspace merged, memory files copied, delegation patterns saved as skills.

3. **Monorepo consolidation (May 1, 2026):** Created `ChonSong/agent-os` to consolidate 5 separate repos (nanobot, everything-dashboard, casaos-agent, casaos-webhook-emitter, claw-aie) into a single monorepo with unified build system.

4. **Active development (May 1–8, 2026):** Migrated all packages, built Docker setup, wrote 17+ frontend pages, fixed routing/null safety issues, wrote PostgreSQL migrations.

The project represents ~8 sessions of autonomous agent work plus human direction.

---

*This document auto-generated by Hermes Agent on 2026-05-08. For questions, ping @Sean.*

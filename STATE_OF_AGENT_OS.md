# State of agent-os

**Last updated:** 2026-05-09  
**Branch:** `main` @ `7647073`  
**CI:** ✅ All jobs passing (test go, test python, test node, build, deploy)  
**Image:** `ghcr.io/chonsong/agent-os:latest` — `sha256:b6d31a0bf0605cea9d59c049a583d698ef867cd7b666fe80b4b06d7f868d9556`

---

## What Is agent-os?

A self-hosted AI agent platform with a polyglot monorepo architecture: Go webhook emitter, Node.js/Express dashboard backend, Python nanobot agent core, React frontend. Deployed on a single host via Docker with a Cloudflare Tunnel for external access.

---

## Component Status

| Component | Stack | Status | Notes |
|-----------|-------|--------|-------|
| **Dashboard Backend** | Node.js/Express + Socket.IO + Dockerode | ✅ Working | 75 API routes, PG-backed, serves React SPA |
| **Nanobot Agent** | Python/aiohttp | ✅ Working | OpenAI-compatible `/v1/chat/completions`, SSE streaming |
| **Dashboard Frontend** | React 19 + Vite + Tailwind v4 (via @nous-research/ui) | ⚠️ Builds, needs prod verification | Warm bento theme, 17 pages |
| **Agent Adapter** | Python (abstract protocol + nanobot adapter) | ⚠️ Dead code | Backend uses direct HTTP, not the adapter |
| **Observability** | Python (events.py, logger) | ⚠️ Defined but not wired | Events defined, never emitted by AgentLoop |
| **Webhook Emitter** | Go | ✅ Working | Polls Docker events, POSTs to backend |
| **PostgreSQL** | 16-alpine | ✅ Working | 8 migrations, stores sessions/events/cron/profiles/skills |
| **Cloudflare Tunnel** | cloudflared 2026.3.0 | ✅ Working | → backend:3001 |
| **CI/CD** | GitHub Actions | ✅ All green | Test + Build + Deploy (deploy is noop — manual pull required) |

---

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

    ┌──────────────────────────────┐
    │ agent-os-webhook-emitter     │
    │ Go — polls Docker events     │
    │ → POST /api/webhooks/casaos  │
    └──────────────────────────────┘
```

**Data flow for chat:**
```
Browser → POST /api/agent/chat → fetchWithTimeout → nanobot:8900/v1/chat/completions
                                ← SSE stream ← nanobot → LLM provider
         ← SSE stream ← backend (proxy)
         Backend also stores user msg + assistant response in PostgreSQL
```

---

## API Surface

### Chat & Agent

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| POST | `/api/agent/chat` | ✅ | Proxies to nanobot `/v1/chat/completions`, SSE streaming, stores messages in PG |
| GET | `/api/agent/config` | ✅ | Reads nanobot config.json (strips API keys) |

### Sessions

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/sessions` | ✅ | PG-backed, paginated (`?page=&limit=`) |
| GET | `/api/sessions/:id/messages` | ✅ | PG-backed message history |
| GET | `/api/sessions/search` | ✅ | PG full-text search, returns `{results:[], total:N}` |
| DELETE | `/api/sessions/:id` | ✅ | Delete session + messages |

### Config & Env

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/config` | ✅ | Returns current config |
| PUT | `/api/config` | ✅ | Updates config + writes to nanobot config.json |
| GET | `/api/config/defaults` | ✅ | Hardcoded defaults |
| GET | `/api/config/schema` | ✅ | Field definitions |
| GET | `/api/config/raw` | ✅ | Returns YAML stub |
| PUT | `/api/config/raw` | ✅ | Writes YAML to nanobot config.yaml |
| GET | `/api/env` | ✅ | Environment variables |
| PUT | `/api/env` | ✅ | Set env var |
| DELETE | `/api/env` | ✅ | Delete env var |
| POST | `/api/env/reveal` | ✅ | Reveal masked env var |

### Models

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/model/info` | ✅ | Flattened `{model, provider, capabilities}` |
| GET | `/api/model/options` | ✅ | Proxied from nanobot `/v1/models` |
| GET | `/api/model/auxiliary` | ✅ | Returns `{models:[]}` |
| POST | `/api/model/set` | ✅ | Set model/provider |

### Cron

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/cron/jobs` | ✅ | PG-backed cron job list |
| POST | `/api/cron/jobs` | ✅ | Create + schedule (accepts `prompt, schedule, name, deliver`) |
| POST | `/api/cron/jobs/:id/pause` | ✅ | Pause job |
| POST | `/api/cron/jobs/:id/resume` | ✅ | Resume job |
| POST | `/api/cron/jobs/:id/trigger` | ✅ | Trigger immediate run |
| DELETE | `/api/cron/jobs/:id` | ✅ | Delete job |

### Profiles

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/profiles` | ✅ | PG-backed profile list |
| POST | `/api/profiles` | ✅ | Create profile |
| PATCH | `/api/profiles/:name` | ✅ | Rename profile |
| DELETE | `/api/profiles/:name` | ✅ | Delete profile |
| GET | `/api/profiles/:name/setup-command` | ✅ | Returns setup command |
| GET | `/api/profiles/:name/soul` | ✅ | Returns soul.md content |
| PUT | `/api/profiles/:name/soul` | ✅ | Update soul.md |

### Skills

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/skills` | ✅ | Skills from disk + PG toggle state |
| PUT | `/api/skills/toggle` | ✅ | Toggle skill enabled/disabled |
| POST | `/api/skills/create` | ✅ | Write SKILL.md to disk |
| DELETE | `/api/skills/:name` | ✅ | Delete skill |

### Tools & OAuth

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/tools/toolsets` | ✅ | Available toolsets |
| GET | `/api/providers/oauth` | ✅ | Stub — returns `{providers:[]}` |
| DELETE | `/api/providers/oauth/:providerId` | ✅ | Stub |
| POST | `/api/providers/oauth/:providerId/start` | ✅ | Stub |
| POST | `/api/providers/oauth/:providerId/submit` | ✅ | Stub |
| GET | `/api/providers/oauth/:providerId/poll/:sessionId` | ✅ | Stub |
| DELETE | `/api/providers/oauth/sessions/:sessionId` | ✅ | Stub |

### Docker

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/docker/containers/json` | ✅ | List containers via Dockerode |
| POST | `/api/docker/containers/:id/:action` | ✅ | Start/stop/restart container |
| GET | `/api/docker/system` | ✅ | Docker system info |
| GET | `/api/docker/info` | ✅ | Docker info |
| GET | `/api/docker/version` | ✅ | Docker version |
| GET | `/api/docker/stats` | ✅ | Container stats |

### Files

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/files/read/*` | ✅ | Read file content (sandboxed to /opt/data, /home/sean) |
| GET | `/api/files/*` | ✅ | Directory listing |
| DELETE | `/api/files/*` | ✅ | Delete file |
| POST | `/api/files/write/*` | ✅ | Write file (text, 2MB limit) |

### Analytics & Monitoring

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/analytics/real` | ✅ | Real PG session/event data |
| GET | `/api/analytics/usage` | ✅ | Token/session analytics from PG |
| GET | `/api/analytics/models` | ✅ | Model usage analytics from PG |
| GET | `/api/events/recent` | ✅ | Recent AIE events from PG |
| GET | `/api/logs` | ✅ | Docker container logs (streaming) |

### System & Webhooks

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/db/health` | ✅ | PostgreSQL health check |
| GET | `/api/system/uptime` | ✅ | Process uptime |
| GET | `/api/tunnel` | ✅ | Cloudflare tunnel info |
| GET | `/api/status` | ✅ | System status with Docker info |
| GET | `/api/deploy/status` | ✅ | Self-update polling status |
| POST | `/api/deploy` | ✅ | Webhook-triggered deploy |
| POST | `/api/webhooks/casaos` | ✅ | CasaOS event receiver, broadcasts via Socket.IO |
| POST | `/api/events/agent` | ✅ | Agent lifecycle events |

### Dashboard Plugins & Themes

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/dashboard/plugins` | ✅ | Plugin list |
| POST | `/api/dashboard/plugins/rescan` | ✅ | Rescan plugins |
| GET | `/api/dashboard/themes` | ✅ | Theme list |
| PUT | `/api/dashboard/theme` | ✅ | Set active theme |

### Stubs (no real implementation)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/gateway/restart` | Returns `{ok:true, pid:0}` — no-op |
| POST | `/api/hermes/update` | Returns `{ok:true, pid:0}` — no-op |
| GET | `/api/actions/:name/status` | Returns `{running:false}` — no-op |

### Socket.IO Events (push)

| Event | Direction | Description |
|-------|-----------|-------------|
| `events` | Server → Client | CasaOS webhook events |
| `log` | Server → Client | Live Docker container logs |
| `docker:containers` | Server → Client | Container stats every 5s |
| `cron:updated` | Server → Client | Cron job changes |

---

## Frontend Pages

| Path | Page | Status | Notes |
|------|------|--------|-------|
| `/` | RootRedirect → `/containers` | ✅ | |
| `/containers` | ContainerPage | ✅ | Bento grid metric cards, real-time Socket.IO stats, Docker control |
| `/sessions` | SessionsPage | ✅ | PG-backed, copy messages, search |
| `/cron` | CronPage | ✅ | Create/manage cron jobs |
| `/profiles` | ProfilesPage | ✅ | Profile CRUD, soul.md editor |
| `/observability` | ObservabilityPage | ✅ | Events display (data depends on wiring) |
| `/analytics` | AnalyticsPage | ✅ | Token/session/model analytics from PG |
| `/appstore` | AppStorePage | ⚠️ | Plugin store UI (backend has stubs) |
| `/files` | FileExplorerPage | ✅ | Full CRUD — browse, read, create, edit, delete |
| `/tools` | ToolManagerPage | ✅ | Toolset management |
| `/settings` | SettingsPage | ✅ | Interactive settings with save |
| `/config` | ConfigPage | ✅ | Raw config editor |
| `/chat` | ChatPage | ⚠️ | Uses xterm.js + PTY WebSocket — Hermes-specific, doesn't work in agent-os |
| `/env` | EnvPage | ✅ | Environment variable management |
| `/logs` | LogsPage | ✅ | Real-time log streaming via Socket.IO |
| `/models` | ModelsPage | ✅ | Model info, options, assignment |
| `/docs` | DocsPage | ✅ | Documentation page |

### ChatPanel (floating widget)
- Always-available floating panel (bottom-right)
- Calls `/api/agent/chat` with SSE streaming — **this is the working chat interface**
- Session management, token usage tracking

---

## CI/CD Pipeline

**File:** `.github/workflows/agent-os.yml`

| Job | What it does |
|-----|--------------|
| Test (go) | `go test ./...` in `apps/webhook-emitter` |
| Test (python) | `pytest` in `packages/nanobot`, `packages/agent-adapter`, `packages/observability` |
| Test (node) | `vitest run` in `apps/dashboard/frontend` |
| Build | `docker buildx build` → push to `ghcr.io/chonsong/agent-os:latest` |
| Deploy | **Noop** — prints image SHA. Manual `docker pull` + recreate required. |

**To deploy after merge:**
```bash
docker pull ghcr.io/chonsong/agent-os:latest
docker stop agent-os-backend agent-os-nanobot agent-os-webhook-emitter
docker rm agent-os-backend agent-os-nanobot agent-os-webhook-emitter
# Then recreate with docker run (see docker-compose.yml for args)
```

---

## Deployment

### Running Containers

| Container | Image | Ports | Status |
|-----------|-------|-------|--------|
| `agent-os-backend` | `ghcr.io/chonsong/agent-os:latest` | 3001, 1331→3001 | ✅ Healthy |
| `agent-os-nanobot` | `ghcr.io/chonsong/agent-os:latest` | 8900, 9120 | ✅ Healthy |
| `agent-os-webhook-emitter` | `ghcr.io/chonsong/agent-os:latest` | — | ✅ Healthy |
| `agent-os-postgres` | `postgres:16-alpine` | 5432 | ✅ Healthy |
| `agent-os-cloudflared` | `cloudflare/cloudflared:2026.3.0` | — | ✅ Running |

### Network
- `agent-os_agent-net` — all agent-os containers communicate on this bridge network
- Backend resolves nanobot as `http://agent-os-nanobot:8900`

### Volumes
- Nanobot workspace: `/home/sean/.nanobot/workspace`
- Nanobot config: `/home/sean/.nanobot`
- Frontend dist (override): `/home/sean/.hermes/agent-os-patched/frontend-dist`
- Docker socket: mounted rw in backend, ro in nanobot and webhook-emitter
- File API sandbox: `/opt/data`, `/home/sean`

### PostgreSQL Migrations

| # | File | Purpose |
|---|------|---------|
| 001 | `001_initial.sql` | Base schema |
| 002 | `002_observability_tables.sql` | AIE event tables |
| 003 | `003_dashboard_sessions.sql` | Sessions + messages |
| 004 | `004_pg_cron_jobs.sql` | Cron job storage |
| 005 | `005_skill_settings.sql` | Skill toggle state |
| 006 | `006_profiles_soul.sql` | Profiles + soul.md |
| 007 | `007_optimize_queries.sql` | Index optimization |
| 008 | `008_fix_indexes.sql` | Index fixes |

---

## Known Issues

### High Priority

1. **ChatPage uses xterm.js + PTY WebSocket** — The `/chat` page uses `@xterm/xterm` with a WebSocket to `/api/pty`, which is a Hermes-specific pattern. It doesn't work in agent-os. The `ChatPanel` floating widget (using SSE to `/api/agent/chat`) is the working alternative.

2. **Frontend production rendering unverified** — The `@types/react` mismatch (^18 vs React 19) was fixed in commit `7647073`. Need to verify the built SPA actually renders correctly when served by the backend.

3. **Deploy is manual** — CI deploy job is a noop. After each merge, must manually `docker pull` + `docker stop/rm/run` all three app containers.

### Medium Priority

4. **Observability not wired** — `packages/observability/` defines event types (`AIEEvent`, `AIELogger`) but `AgentLoop` in nanobot never calls `AIELogger.emit()`. The `/api/events/recent` and `/api/events/agent` endpoints exist but receive no data from the agent.

5. **Python NanobotAdapter is dead code** — `packages/agent-adapter/nanobot_adapter.py` implements `AgentAdapter.stream()` / `.run()` but the Node.js backend calls nanobot directly via HTTP. The adapter package is tested by CI but not used in production.

6. **OAuth endpoints are stubs** — All 6 OAuth endpoints return placeholder data. No actual OAuth flow implemented.

7. **Gateway/action endpoints are stubs** — `POST /api/gateway/restart`, `POST /api/hermes/update`, `GET /api/actions/:name/status` return hardcoded responses.

### Low Priority

8. **No watchdog** — No health monitoring or auto-restart cron. If a container crashes, Docker `--restart unless-stopped` handles restart, but there's no alerting or health dashboards beyond the Docker health checks.

9. **No backup cron** — PostgreSQL data is not backed up automatically. Manual `pg_dump` required.

10. **AppStorePage has no backend** — Plugin store UI exists but backend plugin system is rudimentary (filesystem scan only).

---

## Recommended Next Steps

### Phase 1: Stabilize (this week)
- [ ] Verify frontend renders correctly in production (open via Cloudflare tunnel)
- [ ] Replace ChatPage xterm/PTY with SSE-based chat (reuse ChatPanel logic)
- [ ] Make CI deploy job actually pull + recreate containers (or add a deploy script)

### Phase 2: Wire Observability (next week)
- [ ] Hook `AIELogger.emit()` into nanobot's `AgentLoop` — emit `session_start`, `tool_use`, `session_end`, `error` events
- [ ] Wire `POST /api/events/agent` to receive events from nanobot hooks
- [ ] Populate ObservabilityPage with real data

### Phase 3: Robustness
- [ ] Add PostgreSQL backup cron (pg_dump → /opt/data/backups/)
- [ ] Add container watchdog cron (check health endpoints, alert on failure)
- [ ] Remove or integrate dead `agent-adapter` package
- [ ] Implement real OAuth flow or remove stubs

### Phase 4: Features
- [ ] Implement real plugin system for AppStorePage
- [ ] Add multi-user support (currently single-user, no auth)
- [ ] Add file upload support to chat (nanobot supports multipart)
- [ ] Wire model switching to nanobot config reload

---

## Commit History (last 20)

```
7647073 fix: align frontend-backend API and fix React types
6b8dc63 fix(ContainerPage): use valid H2 variant and type Ports properly
5bf3fad fix(i18n): revert type to any and remove non-existent makeSafeI18n export
61e0b25 fix(SkillsPage): remove extra closing div in skills bento card
d70ef8e fix(SkillsPage): repair JSX tag mismatch in bento migration
447d9e9 refactor(frontend): migrate dark theme to warm bento design system
a13d5d1 docs: add comprehensive STATE_OF_AGENT_OS.md — project status as of 2026-05-08
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
760745c fix(backend): fix container.logs() async — use .then() instead of await
d2a3d45 fix(backend): move log stream functions module-level
7022d6d feat: real-time log streaming via Socket.IO — no more polling
```

---

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `apps/dashboard/backend/src/index.ts` | Express server — 75 routes, Socket.IO, Dockerode, PG pool |
| `apps/dashboard/frontend/src/App.tsx` | React Router — 17 routes + catch-all redirect |
| `apps/dashboard/frontend/src/lib/api.ts` | Frontend API client — 35+ typed methods |
| `apps/dashboard/frontend/src/i18n/context.tsx` | Proxy-based i18n with namespace caching |
| `apps/dashboard/frontend/src/index.css` | Warm bento CSS design system + @nous-research/ui globals |
| `apps/dashboard/frontend/src/components/ChatPanel.tsx` | Working SSE chat widget (uses /api/agent/chat) |
| `apps/dashboard/frontend/src/pages/ChatPage.tsx` | Broken xterm/PTY chat (Hermes-specific) |
| `apps/dashboard/frontend/src/components/Sidebar.tsx` | Navigation sidebar |
| `packages/nanobot/nanobot/api/server.py` | aiohttp server — /v1/chat/completions, /v1/models, /health |
| `packages/nanobot/nanobot/agent_loop.py` | Core agent loop — processes messages, calls LLM, manages tools |
| `packages/agent-adapter/agent_adapter/protocol.py` | Abstract AgentAdapter protocol (run, stream, health) |
| `packages/agent-adapter/agent_adapter/nanobot_adapter.py` | Nanobot adapter — wraps /v1/chat/completions (unused) |
| `packages/observability/observability/events.py` | AIE event types + AIELogger (defined, not wired) |
| `apps/webhook-emitter/` | Go service — polls Docker events, POSTs to backend |
| `infra/postgres/migrations/` | 8 SQL migrations |
| `docker-compose.yml` | Service definitions, volumes, health checks |
| `.github/workflows/agent-os.yml` | CI: test (go/python/node) → build → deploy (noop) |
| `SPEC.md` | Original project specification |

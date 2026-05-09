# State of agent-os

**Last updated:** 2026-05-09  
**Branch:** `main` @ `910e541`  
**CI:** ✅ All jobs passing (test go, test node, build, deploy)  
**Image:** `ghcr.io/chonsong/agent-os:latest` — `sha256:dfc0666f2dcc11e48b0c73ccab819d5b6da07244b370dbaa1526e907da27c77c`

---

## What Is agent-os?

A self-hosted AI agent platform with a polyglot monorepo architecture: Go webhook emitter, Node.js/Express dashboard backend, React frontend, powered by Hermes Agent (runs on the host). Deployed on a single host via Docker with a Cloudflare Tunnel for external access. Hermes Agent replaces the former Python nanobot agent core.

---

## Component Status

| Component | Stack | Status | Notes |
|-----------|-------|--------|-------|
| **Dashboard Backend** | Node.js/Express + Socket.IO + Dockerode | ✅ Working | 75+ API routes, PG-backed, serves React SPA |
| **Hermes Agent** | nousresearch/hermes-agent:latest (host container) | ✅ Working | OpenAI-compatible API on host port 8642, SSE streaming |
| **Dashboard Frontend** | React 19 + Vite + Tailwind v4 (via @nous-research/ui) | ✅ Working | Warm bento theme (cream #FFF5E6, peach #FAD4C0), 22 pages |
| **Agent Adapter** | Python (abstract protocol + nanobot adapter) | ⚠️ Dead code | Backend uses direct HTTP to Hermes, not the adapter |
| **Observability** | Python (events.py, logger) | ⚠️ Defined but not wired | Events defined, never emitted |
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
    │ PostgreSQL│  │ Docker │  │ Hermes Agent    │
    │ (:5432)   │  │ Socket │  │ (host network)  │
    │           │  │(mgmt)  │  │ :8642 (API)     │
    │ sessions  │  └────────┘  │ :9119 (metrics) │
    │ events    │              │ via host.docker  │
    │ cron_jobs │              │  .internal:8642  │
    │ profiles  │              └────────┬────────┘
    │ skills    │                       │
    └───────────┘              ┌────────▼─────────┘
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
Browser → POST /api/agent/chat → fetchWithTimeout → host.docker.internal:8642/v1/chat/completions
                                ← SSE stream ← Hermes Agent → LLM provider
         ← SSE stream ← backend (proxy)
         Backend also stores user msg + assistant response in PostgreSQL
```

---

## API Surface

### Chat & Agent

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| POST | `/api/agent/chat` | ✅ | Proxies to Hermes `/v1/chat/completions`, SSE streaming, stores messages in PG |
| GET | `/api/agent/config` | ✅ | Reads Hermes config (strips API keys) |

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
| PUT | `/api/config` | ✅ | Updates config + writes to Hermes config |
| GET | `/api/config/defaults` | ✅ | Hardcoded defaults |
| GET | `/api/config/schema` | ✅ | Field definitions |
| GET | `/api/config/raw` | ✅ | Returns YAML stub |
| PUT | `/api/config/raw` | ✅ | Writes YAML to Hermes config |
| GET | `/api/env` | ✅ | Environment variables |
| PUT | `/api/env` | ✅ | Set env var |
| DELETE | `/api/env` | ✅ | Delete env var |
| POST | `/api/env/reveal` | ✅ | Reveal masked env var |

### Models

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| GET | `/api/model/info` | ✅ | Flattened `{model, provider, capabilities}` |
| GET | `/api/model/options` | ✅ | Proxied from Hermes `/v1/models` |
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

22 pages total. Warm bento theme with cream (#FFF5E6) and peach (#FAD4C0) color palette.

| Path | Page | Status | Notes |
|------|------|--------|-------|
| `/` | RootRedirect → `/dashboard` | ✅ | |
| `/dashboard` | DashboardPage | ✅ | Aggregated metrics, system overview |
| `/containers` | ContainerPage | ✅ | Bento grid metric cards, real-time Socket.IO stats, Docker control |
| `/sessions` | SessionsPage | ✅ | PG-backed, copy messages, search |
| `/chat` | ChatPage | ✅ | SSE-based chat with Hermes Agent |
| `/cron` | CronPage | ✅ | Create/manage cron jobs |
| `/profiles` | ProfilesPage | ✅ | Profile CRUD, soul.md editor |
| `/memory` | MemoryPage | ✅ | Memory/file browser |
| `/mcp` | MCPPage | ✅ | MCP server management |
| `/terminal` | TerminalPage | ✅ | Terminal interface |
| `/skills` | SkillsPage | ✅ | Skill management with toggle |
| `/observability` | ObservabilityPage | ✅ | Events display |
| `/analytics` | AnalyticsPage | ✅ | Token/session/model analytics from PG |
| `/appstore` | AppStorePage | ⚠️ | Plugin store UI (backend has stubs) |
| `/files` | FileExplorerPage | ✅ | Full CRUD — browse, read, create, edit, delete |
| `/tools` | ToolManagerPage | ✅ | Toolset management |
| `/settings` | SettingsPage | ✅ | Interactive settings with save |
| `/config` | ConfigPage | ✅ | Raw config editor |
| `/env` | EnvPage | ✅ | Environment variable management |
| `/logs` | LogsPage | ✅ | Real-time log streaming via Socket.IO |
| `/models` | ModelsPage | ✅ | Model info, options, assignment |
| `/docs` | DocsPage | ✅ | Documentation page |

### ChatPanel (floating widget)
- Always-available floating panel (bottom-right)
- Calls `/api/agent/chat` with SSE streaming — **working chat interface**
- Session management, token usage tracking

---

## CI/CD Pipeline

**File:** `.github/workflows/agent-os.yml`

| Job | What it does |
|-----|--------------|
| Test (go) | `go test ./...` in `apps/webhook-emitter` |
| Test (node) | `vitest run` in `apps/dashboard/frontend` |
| Build | `docker buildx build` → push to `ghcr.io/chonsong/agent-os:latest` |
| Deploy | **Noop** — prints image SHA. Manual `docker pull` + recreate required. |

**Note:** Python nanobot tests removed from CI — nanobot is no longer part of the stack.

**To deploy after merge:**
```bash
docker pull ghcr.io/chonsong/agent-os:latest
docker stop agent-os-backend agent-os-webhook-emitter
docker rm agent-os-backend agent-os-webhook-emitter
# Then recreate with docker compose up -d
```

---

## Deployment

### Running Containers (docker-compose)

| Container | Image | Ports | Status |
|-----------|-------|-------|--------|
| `agent-os-backend` | `ghcr.io/chonsong/agent-os:latest` | 3001, 1331→3001 | ✅ Healthy |
| `agent-os-webhook-emitter` | `ghcr.io/chonsong/agent-os:latest` | — | ✅ Healthy |
| `agent-os-postgres` | `postgres:16-alpine` | 5432 | ✅ Healthy |
| `agent-os-cloudflared` | `cloudflare/cloudflared:2026.3.0` | — | ✅ Running |

### Hermes Agent (host container, not in docker-compose)

| Container | Image | Network | Ports | Status |
|-----------|-------|---------|-------|--------|
| `hermes` | `hermes-sync:latest` | `host` | 8642 (API), 9119 (metrics) | ✅ Healthy |
| `hermes-dashboard` | `hermes-sync:latest` | `host` | — | ✅ Healthy |

Hermes Agent runs as a **host-level container** (`network_mode: host`) independently of the agent-os compose stack. The backend connects to it via `host.docker.internal:8642` (configured as `HERMES_API_URL` env var).

### Network
- `agent-os_agent-net` — all agent-os containers communicate on this bridge network
- Backend resolves Hermes as `http://host.docker.internal:8642` (via `extra_hosts: host.docker.internal:host-gateway`)
- Hermes uses host networking directly — no port mapping needed

### Volumes
- Frontend dist (override): `/home/sean/.hermes/agent-os-patched/frontend-dist`
- Agent config: `/home/sean/.nanobot` (legacy path, still used for config files)
- Docker socket: mounted rw in backend, ro in webhook-emitter
- File API sandbox: `/opt/data`, `/home/sean`

### Dockerfile
- Multi-stage build: `ts-build` (Node 22) → `go-build` (Go 1.23) → `runtime` (Debian 13-slim)
- **Node binary COPY fix:** The runtime stage copies the `node` binary from the `ts-build` stage (`COPY --from=ts-build /usr/local/bin/node /usr/local/bin/node`) — without this the container crashes on startup since Debian slim has no Node.js

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

1. **Deploy is manual** — CI deploy job is a noop. After each merge, must manually `docker pull` + `docker stop/rm` and `docker compose up -d`.

2. **Frontend production rendering** — The warm bento theme and all 22 pages should be verified in production via the Cloudflare tunnel to ensure no runtime errors in the built SPA.

### Medium Priority

3. **Observability not wired** — `packages/observability/` defines event types (`AIEEvent`, `AIELogger`) but nothing emits events. The `/api/events/recent` and `/api/events/agent` endpoints exist but receive no data.

4. **Python NanobotAdapter is dead code** — `packages/agent-adapter/nanobot_adapter.py` implements `AgentAdapter.stream()` / `.run()` but the Node.js backend calls Hermes directly via HTTP. The adapter package is not used in production.

5. **OAuth endpoints are stubs** — All 6 OAuth endpoints return placeholder data. No actual OAuth flow implemented.

6. **Gateway/action endpoints are stubs** — `POST /api/gateway/restart`, `POST /api/hermes/update`, `GET /api/actions/:name/status` return hardcoded responses.

7. **webhook-emitter container not running** — The webhook-emitter is defined in docker-compose.yml but is not currently running on the host. May need to be recreated.

### Low Priority

8. **No watchdog** — No health monitoring or auto-restart cron. If a container crashes, Docker `--restart unless-stopped` handles restart, but there's no alerting or health dashboards beyond the Docker health checks.

9. **No backup cron** — PostgreSQL data is not backed up automatically. Manual `pg_dump` required.

10. **AppStorePage has no backend** — Plugin store UI exists but backend plugin system is rudimentary (filesystem scan only).

---

## Recommended Next Steps

### Phase 1: Stabilize (this week)
- [ ] Verify frontend renders correctly in production (open via Cloudflare tunnel)
- [ ] Ensure webhook-emitter container is running
- [ ] Make CI deploy job actually pull + recreate containers (or add a deploy script)

### Phase 2: Wire Observability (next week)
- [ ] Hook `AIELogger.emit()` into Hermes event hooks — emit `session_start`, `tool_use`, `session_end`, `error` events
- [ ] Wire `POST /api/events/agent` to receive events from Hermes
- [ ] Populate ObservabilityPage with real data

### Phase 3: Robustness
- [ ] Add PostgreSQL backup cron (pg_dump → /opt/data/backups/)
- [ ] Add container watchdog cron (check health endpoints, alert on failure)
- [ ] Remove or integrate dead `agent-adapter` package
- [ ] Implement real OAuth flow or remove stubs

### Phase 4: Features
- [ ] Implement real plugin system for AppStorePage
- [ ] Add multi-user support (currently single-user, no auth)
- [ ] Add file upload support to chat
- [ ] Wire model switching to Hermes config reload

---

## Commit History (last 20)

```
910e541 fix: use host Hermes via host.docker.internal, remove redundant hermes service
9c4aae3 fix: add node binary to Dockerfile runtime stage - container crashes without it
929ec16 fix: MemoryPage FileEntry types, remaining toast refs, ChatPage deps
eb1121b fix: toast API in ChatPage, MCPPage, DashboardPage — showToast + type fixes
80807a6 fix: restore standard turbo build (toast API fixed)
32a7f54 fix: useToast API — showToast instead of toast() in MemoryPage + TerminalPage
85fb383 fix: add tsc diagnostics on build failure
3a684a6 fix: jsonError → jsonErr in MCP endpoints
048f0c0 feat: Phase 1.4 — Refactor Dockerfile for Hermes replacement
606c4c0 feat: Phase 1.2-1.3 — Replace nanobot with Hermes Agent
7e0f583 docs: add MCP page to frontend pages table
7b84314 feat: MCP servers, Chat improvements, theme dark overrides
38c86cc docs: rewrite README with complete feature documentation
ca9fef1 feat: Phase 3c — Dashboard page with aggregated metrics
308eff9 feat: Phase 3b — Terminal, Memory pages + new features
8a694cf feat: Phase 3a — theme system from hermes-workspace
3fc0a65 docs: rewrite STATE_OF_AGENT_OS.md — accurate status as of 2026-05-09
7647073 fix: align frontend-backend API and fix React types
6b8dc63 fix(ContainerPage): use valid H2 variant and type Ports properly
5bf3fad fix(i18n): revert type to any and remove non-existent makeSafeI18n export
```

---

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `apps/dashboard/backend/src/index.ts` | Express server — 75+ routes, Socket.IO, Dockerode, PG pool |
| `apps/dashboard/frontend/src/App.tsx` | React Router — 22 routes + catch-all redirect |
| `apps/dashboard/frontend/src/lib/api.ts` | Frontend API client — 35+ typed methods |
| `apps/dashboard/frontend/src/i18n/context.tsx` | Proxy-based i18n with namespace caching |
| `apps/dashboard/frontend/src/index.css` | Warm bento CSS design system (cream #FFF5E6, peach #FAD4C0) + @nous-research/ui globals |
| `apps/dashboard/frontend/src/components/ChatPanel.tsx` | Working SSE chat widget (uses /api/agent/chat) |
| `apps/dashboard/frontend/src/components/Sidebar.tsx` | Navigation sidebar |
| `apps/dashboard/frontend/src/pages/` | 21 page components (DashboardPage, ChatPage, MCPPage, MemoryPage, TerminalPage, SkillsPage, etc.) |
| `apps/webhook-emitter/` | Go service — polls Docker events, POSTs to backend |
| `infra/postgres/migrations/` | 8 SQL migrations |
| `Dockerfile` | Multi-stage build (Node 22 + Go 1.23 + Debian slim), node binary COPY from ts-build |
| `docker-compose.yml` | 4 services: backend, postgres, cloudflared, webhook-emitter (NO Hermes — runs on host) |
| `.github/workflows/agent-os.yml` | CI: test (go/node) → build → deploy (noop) |
| `SPEC.md` | Original project specification |

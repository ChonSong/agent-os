# agent-os Master Plan — Hermes Agent Integration

**Author:** Sean + Hermes Agent
**Date:** 2026-05-09
**Status:** Approved — ready for execution
**Related skill:** `nanobot-to-hermes-migration`

---

## Current Architecture

```
[Host]                          [Docker containers]
┌──────────────────────┐       ┌─────────────────────────────┐
│ hermes gateway :8642 │       │ agent-os-backend :3001      │
│ hermes dashboard:9119│       │   ↓ proxies to              │
│ hermes --tui         │       │ nanobot :8900               │
│ skills, memory, MCP  │       │ agent-os-nanobot :8900      │
│ config.yaml, .env    │       │ agent-os-postgres :5432     │
│ cron jobs, backups   │       │ agent-os-webhook-emitter    │
└──────────────────────┘       │ agent-os-cloudflared         │
                               └─────────────────────────────┘
```

**Problem:** Two agents running in parallel. Hermes on host, nanobot in Docker. The migration was never completed.

## Target Architecture

```
[Host + Docker containers — unified]
┌───────────────────────────────────────────────────────┐
│ hermes container :8642 (OpenAI-compatible API)       │
│   ↓ proxies to                                        │
│ agent-os-backend :3001 (Express + Socket.IO)          │
│ agent-os-webhook-emitter                              │
│ agent-os-postgres :5432                               │
│ agent-os-cloudflared → backend:3001                   │
└───────────────────────────────────────────────────────┘
```

Hermes replaces nanobot. Same container, different image. Backend proxies to Hermes on port 8642 instead of nanobot on 8900.

---

## Phase 1: Stabilize & Deploy (Days 1-2)

### 1.1 Disk Cleanup
- `docker system prune -af` (~67GB reclaimable)
- Setup weekly Docker prune cron: `0 3 * * 0 docker system prune -af --force`
- Clean `/tmp` stale files (~685MB)

### 1.2 Replace Nanobot with Hermes in docker-compose.yml
- Remove `nanobot` service
- Add `hermes` service:
  ```yaml
  hermes:
    image: nousresearch/hermes-agent:latest
    container_name: agent-os-hermes
    restart: unless-stopped
    command: ["gateway", "run"]
    ports:
      - "127.0.0.1:8642:8642"
    environment:
      - API_SERVER_ENABLED=true
      - API_SERVER_HOST=0.0.0.0
      - HERMES_UID=1000
      - HERMES_GID=1000
    volumes:
      - /home/sean/.hermes:/opt/data
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - agent-net
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8642/health"]
      interval: 30s
      timeout: 10s
      retries: 3
  ```
- Migrate nanobot `config.json` → Hermes `config.yaml` format:
  - Provider: `minimax` → `model.provider: minimax`
  - Model: `MiniMax-M2.7` → `model.default: MiniMax-M2.7`
  - API key: from `config.json.providers.minimax.apiKey` → `.env MINIMAX_API_KEY`
  - Workspace: `/opt/data/nanobot/workspace` → `terminal.cwd: /workspace`
- Backend env change: `NANOBOT_API_URL=http://nanobot:8900` → `HERMES_API_URL=http://hermes:8642`

### 1.3 Update Backend Proxy
- `POST /api/agent/chat`: proxy to `http://hermes:8642/v1/chat/completions`
- `GET /api/agent/config`: read Hermes config from mounted volume
- `GET /api/model/options`: proxy to Hermes `/v1/models`
- `POST /api/model/set`: update Hermes config.yaml

### 1.4 Rebuild Docker Image
- Remove `packages/nanobot/` build stage from Dockerfile
- Remove `frontend-dist` volume override — bundle frontend into image
- Update backend stage to use Hermes API URL env var

### 1.5 Deploy
- Build + push to GHCR
- `docker pull ghcr.io/chonsong/agent-os:latest`
- Stop/recreate containers
- Verify: all 22 pages, chat, terminal, MCP

### 1.6 Fix CI Deploy Job
- Add SSH deploy step to `.github/workflows/agent-os.yml`
- Run on push to main

---

## Phase 2: Wire Observability (Days 2-3)

### 2.1 Hermes Has Observability Built-In
- FTS5 session search, session history, token tracking — all native
- No need to wire `AIELogger.emit()` — Hermes handles this

### 2.2 Populate /observability with Hermes Data
- Add backend endpoint `GET /api/hermes/sessions` → proxy Hermes session list
- Add `GET /api/hermes/insights` → proxy Hermes usage analytics
- Update `ObservabilityPage.tsx` to call real endpoints

### 2.3 Add Inspector Panel
- Create `InspectorPanel.tsx` — floating sidebar showing session events
- Wire to Hermes `/api/hermes/sessions/:id` for activity data
- Toggle button in ChatPanel header

---

## Phase 3: Robustness (Days 3-5)

### 3.1 PostgreSQL Backup Cron
- Script: `pg_dump -Fc agentos | gzip > /opt/data/backups/agentos-YYYY-MM-DD.dump.gz`
- Push to GitHub: commit to `hermes-sync` repo under `backups/`
- Retention: keep last 7 days, auto-delete older (local + GitHub)
- Host crontab: `0 2 * * * /home/sean/.hermes/scripts/agent-os-backup.sh`

### 3.2 Container Watchdog
- Check health every 60s via Docker healthcheck API
- On failure: `docker restart` + email alert
- Deploy as systemd service on host

### 3.3 Keep Stubs As-Is
- Agent-adapter, OAuth, gateway stubs remain for now

---

## Phase 4: Feature Expansion (Days 5-12)

### 4.1 MCP — Real Integration via Hermes
- Hermes has MCP built-in (`hermes mcp list/add/test`)
- Backend endpoint: `GET /api/hermes/mcp/servers` → proxy Hermes MCP catalog
- Backend endpoint: `GET /api/hermes/mcp/tools` → proxy Hermes tool list
- Update MCPPage to show real data from Hermes

### 4.2 Chat Improvements (priority order)
1. Markdown rendering (react-markdown + remark-gfm)
2. Code block syntax highlighting (Shiki)
3. Context meter (token usage %)
4. Slash commands (`/new`, `/model`, `/clear`)
5. Session forking
6. Inspector panel (from Phase 2.3)

### 4.3 Swarm Mode
- Use Hermes subagent spawning (`delegate_task` / tmux-spawned Hermes instances)
- Add Kanban board in PostgreSQL for task tracking
- Backend endpoints: `POST /api/swarm/tasks`, `GET /api/swarm/agents`
- Frontend Swarm page with live agent panel

### 4.4 AppStorePage
- Define plugin manifest schema
- Plugin marketplace from GitHub repo
- Install/uninstall endpoints

---

## Phase 5: Polish (Days 12+)

### 5.1 PWA Support
- manifest.json, service worker

### 5.2 Multi-User + Auth
- Auth middleware to Express
- User management, session isolation

### 5.3 File Upload in Chat
- Multipart upload → Hermes attachment handling

---

## Dependencies Graph

```
Phase 1 ──────────────────────────────────────────────┐
├── 1.1 Disk cleanup ─────────────────────────────────┤
├── 1.2 Replace nanobot→Hermes ───── depends on 1.1 ──┤
├── 1.3 Update backend proxy ─────── depends on 1.2 ──┤
├── 1.4 Rebuild image ────────────── depends on 1.3 ──┤
├── 1.5 Deploy ───────────────────── depends on 1.4 ──┤
└── 1.6 CI deploy ────────────────── depends on 1.5 ──┤
                                                        │
Phase 2 ────────────────────────────────────────────────┤
├── 2.1 Hermes observability (built-in) ── depends on 1.5
├── 2.2 ObservabilityPage ─────────────── depends on 2.1
└── 2.3 Inspector panel ───────────────── depends on 2.1
                                                        │
Phase 3 ────────────────────────────────────────────────┤
├── 3.1 Backup cron ───────────────────── depends on 1.5
├── 3.2 Watchdog ──────────────────────── depends on 1.5
└── 3.3 Keep stubs ────────────────────── no dependency
                                                        │
Phase 4 ────────────────────────────────────────────────┤
├── 4.1 MCP real ──────────────────────── depends on 1.5
├── 4.2 Chat parity ───────────────────── depends on 1.5
├── 4.3 Swarm ─────────────────────────── depends on 1.5
└── 4.4 AppStore ──────────────────────── lower priority
                                                        │
Phase 5 ────────────────────────────────────────────────┘
├── 5.1 PWA ───────────────────────────── depends on 1.5
├── 5.2 Multi-user ────────────────────── depends on 1.5
└── 5.3 File upload ───────────────────── depends on 1.5
```

## Execution Strategy

### Phase 1: Sequential (dependencies chain)
Each step depends on the previous — MUST be done in order.

### Phase 2-5: Parallel subagents (independent workstreams)
Use `delegate_task` with batch mode:
- Subagent A: Observability + Inspector (Phase 2)
- Subagent B: Backup + Watchdog (Phase 3)
- Subagent C: MCP + Chat improvements (Phase 4.1-4.2)
- Subagent D: Swarm + AppStore (Phase 4.3-4.4)

### Skills we already have:
- `hermes-agent` ✅ — Hermes configuration, Docker deployment, troubleshooting
- `nanobot-to-hermes-migration` ✅ — Three-phase migration guide
- `repo-transmute` ✅ — Frontend migration (Phase 7)
- `go` ✅ — Go binary builds (webhook-emitter)
- `infrastructure-as-code` ✅ — Terraform + Cloudflare
- `github-pr-workflow` ✅ — CI/CD
- `webhook-subscriptions` ✅ — Event-driven agent runs
- `kanban-orchestrator` / `kanban-worker` ✅ — Swarm mode later

### Skills we might need:
- `react-agent` — For chat improvements, inspector panel
- `docker` patterns — For image rebuild
- `subagent-driven-development` — For parallel workstreams

All needed skills are already available or will be created as we go.

---

*Last updated: 2026-05-09*

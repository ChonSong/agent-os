# agent-os Master Plan

**Author:** Sean + Hermes Agent
**Date:** 2026-05-09
**Status:** Phase 1 complete — in production

---

## Architecture (Current)

```
[Host]                              [Docker containers — agent-net]
┌──────────────────────────┐       ┌─────────────────────────────────┐
│ Hermes Agent (host net)  │       │ agent-os-backend :3001          │
│   :8642 (API gateway)    │◄──────│   Express + Socket.IO + PG      │
│   :9119 (metrics)        │       │   Serves React SPA (22 pages)   │
│   hermes-sync:latest     │       │ agent-os-postgres :5432         │
│   network_mode: host     │       │ agent-os-cloudflared            │
│   skills, memory, MCP    │       │ agent-os-webhook-emitter        │
│   config.yaml, .env      │       └─────────────────────────────────┘
└──────────────────────────┘
```

Backend connects to Hermes via `host.docker.internal:8642` (configured as `HERMES_API_URL`). Hermes runs as a host-level container independently of the docker-compose stack.

---

## Completed Phases

### Phase 1: Stabilize & Deploy ✅

- [x] Disk cleanup — reclaimed ~67GB via `docker system prune`
- [x] Removed nanobot service from docker-compose
- [x] Hermes Agent runs on host (`network_mode: host`) with OpenAI-compatible API on port 8642
- [x] Backend proxies to Hermes at `host.docker.internal:8642` via `HERMES_API_URL` env var
- [x] Chat endpoint (`POST /api/agent/chat`) proxies to Hermes `/v1/chat/completions` with SSE streaming
- [x] Model/config endpoints wired to Hermes
- [x] Dockerfile rebuilt — no nanobot stage, node binary COPY fix applied
- [x] 22 frontend pages working with Warm Bento theme
- [x] CI pipeline: test (go/node) → build → deploy (manual pull)

### Phase 2: Observability — Partially Complete ⚠️

- [x] Hermes has FTS5 session search, token tracking built-in
- [ ] Backend endpoints for Hermes session/analytics data (not yet wired)
- [ ] Inspector panel for session events (not yet built)
- [ ] `packages/observability/` events defined but not emitted

### Phase 3: Robustness — Partially Complete ⚠️

- [ ] PostgreSQL backup cron (pg_dump → /opt/data/backups/)
- [ ] Container watchdog (health monitoring + alerting)
- [x] Stubs (OAuth, gateway) left as-is — no current need

---

## Future Phases

### Phase 4: Feature Expansion

| Feature | Status | Notes |
|---------|--------|-------|
| MCP — real Hermes integration | ⬜ Pending | Hermes has MCP built-in; backend needs proxy endpoints |
| Chat improvements (markdown, syntax highlighting) | ⬜ Pending | react-markdown + remark-gfm + Shiki |
| Swarm mode | ⬜ Pending | Hermes subagent spawning + Kanban in PostgreSQL |
| AppStorePage | ⬜ Pending | Backend has stubs only |

### Phase 5: Polish

| Feature | Status | Notes |
|---------|--------|-------|
| PWA support | ⬜ Pending | manifest.json, service worker |
| Multi-user + auth | ⬜ Pending | Auth middleware, session isolation |
| File upload in chat | ⬜ Pending | Multipart → Hermes attachment handling |

---

## Key Decisions Made

1. **Hermes on host, not in compose** — Hermes runs with `network_mode: host` for direct access to Docker socket, skills, and host filesystem. Backend connects via `host.docker.internal`.
2. **Nanobot fully removed** — No nanobot container, no Python agent runtime. Hermes handles all agent tasks.
3. **Frontend bundled in image** — React SPA served by Express from `frontend/dist`. Override volume available at `/home/sean/.hermes/agent-os-patched/frontend-dist`.
4. **Warm Bento theme** — Default cream (#FFF5E6) + peach (#FAD4C0) color palette across all 22 pages.
5. **Deploy is manual** — CI builds and pushes image to GHCR. Manual `docker pull` + `docker compose up -d` on host.

---

## See Also

- [README.md](README.md) — Project overview, quick start, deployment
- [STATE_OF_AGENT_OS.md](STATE_OF_AGENT_OS.md) — Detailed current status, API surface, known issues
- [SPEC.md](SPEC.md) — Original Phase 1 specification (historical)

*Last updated: 2026-05-09*

# AGENTS.md — agent-os

## About
React/Express/PostgreSQL dashboard — 22 pages, 11 themes. Now serves as **migration source** for hermes-web-computer (Go + Svelte 5 target).

## Status
**LEGACY** — This repo is preserved for reference and as a migration source. New development targets `hermes-web-computer`.

## Key Files
- `apps/dashboard/backend/` — Express API (75+ routes, Socket.IO, Dockerode, PostgreSQL)
- `apps/dashboard/frontend/` — React SPA (22 pages, 11 themes)
- `infra/postgres/migrations/` — 8 SQL migrations
- `STATE_OF_AGENT_OS.md` — Detailed status and known issues
- `MASTER_PLAN.md` — Architecture phases

## Architecture
- Backend: Express + Socket.IO on port 3001
- Frontend: React 19 + Vite + Tailwind CSS v4, served by Express from dist/
- Database: PostgreSQL 16 with 8 migrations
- Agent: Connects to Hermes Agent at `host.docker.internal:8642`
- Tunnel: Cloudflare for external access

## Migration to hermes-web-computer
See `MIGRATION.md` for what's been ported and what remains.

## Quick Commands
```bash
npm ci && npm run build && npm run dev  # Local dev
docker compose pull && docker compose up -d  # Deploy
./infra/postgres/run_migrations.sh  # DB migrations
```

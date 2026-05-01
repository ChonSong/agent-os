# agent-os

> Agentic OS — monorepo for CasaOS + nanobot + everything-dashboard

## What's here

- `apps/dashboard/` — everything-dashboard (React + Express + Python agent core)
- `packages/nanobot/` — nanobot Python agent (forked from HKUDS/nanobot)
- `packages/observability/` — AIE-compatible observability layer
- `packages/agent-adapter/` — agent-agnostic interface
- `packages/shared-types/` — shared TypeScript types
- `infra/CasaOS/` — CasaOS Go tools (agent, webhook-emitter)
- `infra/terraform/` — infrastructure as code

## Stack

- **Build:** Turborepo (JS/TS) + Nx + @nx-go (Go)
- **CI/CD:** GitHub Actions (path-filtered)
- **Persistence:** Neon PostgreSQL
- **Deployment:** Docker + Cloudflare Tunnels + Cloudflare Access

## Quick start

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

## Architecture

See [SPEC.md](SPEC.md) for full specification.

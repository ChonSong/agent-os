# agent-os — Phase 1 Specification

## Overview

Monorepo for the OpenClaw agentic OS: CasaOS container management + nanobot agent core + everything-dashboard unified control surface.

## Directory Structure

```
agent-os/
├── apps/
│   └── dashboard/              # everything-dashboard
│       ├── frontend/           # Vite + React + TypeScript
│       ├── backend/           # Express + Socket.io + PostgreSQL
│       └── agent-core/         # Python nanobot sidecar (containerized)
├── packages/
│   ├── nanobot/               # Python agent core (forked)
│   ├── observability/         # AIE event logger, drift scoring
│   ├── agent-adapter/         # Agent-agnostic interface (ABC)
│   └── shared-types/          # Shared TypeScript types
├── infra/
│   ├── CasaOS/
│   │   ├── agent/             # Go CLI
│   │   └── webhook-emitter/    # Go webhook sidecar
│   └── terraform/            # Neon PostgreSQL + Cloudflare
└── .github/workflows/         # CI/CD (path-filtered)
```

## Package Responsibilities

| Package | Language | Responsibility |
|---------|----------|---------------|
| `apps/dashboard/frontend` | TypeScript | React UI |
| `apps/dashboard/backend` | TypeScript | Express API, Socket.io |
| `apps/dashboard/agent-core` | Python | nanobot sidecar |
| `packages/nanobot` | Python | Agent runtime |
| `packages/observability` | Python | AIE event types + JSONL logger |
| `packages/agent-adapter` | Python | Agent ABC + NanobotAdapter |
| `packages/shared-types` | TypeScript | Shared types (published to GitHub Packages) |
| `infra/CasaOS/agent` | Go | CasaOS CLI wrapper |
| `infra/CasaOS/webhook-emitter` | Go | MessageBus → HTTP webhooks |

## CI/CD Strategy

### Path-Filtered Triggers

- `**/*.py` → runs `python` job
- `**/*.ts` / `**/*.tsx` → runs `node` job
- `**/*.go` → runs `go` job
- Root config files → runs all jobs

### Versioning

Semantic release with conventional commits. Enforced via `@commitlint/config-conventional`.

| Prefix | Effect |
|--------|--------|
| `feat:` | Minor bump |
| `fix:` | Patch bump |
| `chore:` | No bump |
| `BREAKING CHANGE:` | Major bump |

### Deployment

On release tag → Docker images built and pushed to `ghcr.io/ChonSong/agent-os`.

## PostgreSQL Schema (Phase 3)

```sql
-- documents: replaces Markdown file storage
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- agent_sessions: nanobot session history
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- aie_events: observability events
CREATE TABLE aie_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id),
  type TEXT NOT NULL,  -- delegation, tool_call, drift, circuit_open, task_complete
  timestamp TIMESTAMPTZ DEFAULT now(),
  data JSONB NOT NULL
);

-- agent_messages: per-session message log
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES agent_sessions(id),
  role TEXT NOT NULL,  -- user, assistant
  content TEXT NOT NULL,
  tools_used TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Cloudflare Infrastructure

- **Tunnel:** `cloudflared` exposing CasaOS + dashboard at `appexample.codeovertcp.com`
- **Access:** Cloudflare Access policy — GitHub OAuth provider
- **Terraform:** Manages tunnel config + Access policies as code

## Acceptance Criteria

- [ ] `npm run build` builds all JS/TS packages
- [ ] `go build ./...` builds all Go packages
- [ ] `ruff check packages/` passes with no errors
- [ ] All three CI jobs (python, node, go) run and pass on push
- [ ] Semantic release creates correct version tags
- [ ] PostgreSQL migrations run cleanly against Neon dev database

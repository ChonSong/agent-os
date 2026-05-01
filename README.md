# agent-os

nanobot agent-core + Hermes Agent dashboard, containerized.

## Services

| Service | Port | Description |
|---------|------|-------------|
| `nanobot` | 8900 | nanobot OpenAI-compatible API (MiniMax-M2.7) |
| `dashboard` | 9119 | Hermes Agent React dashboard + API proxies |

## Quick Start

```bash
# Copy env template and fill in your keys
cp .env.example .env

# Start both services
docker compose up -d

# Watch logs
docker compose logs -f
```

## Architecture

```
Browser (:9119) ── FastAPI ──┬── /api/nanobot/* ──► nanobot (:8900)
                             └── /api/docker/*  ──► Docker Engine API
```

## GitHub Actions

- **nanobot image**: `ghcr.io/ChonSong/agent-os-nanobot` — built from `packages/nanobot/`
- **dashboard image**: `ghcr.io/ChonSong/hermes-agent` — built from `ChonSong/hermes-agent`

See [SPEC.md](./SPEC.md) for full architecture spec.

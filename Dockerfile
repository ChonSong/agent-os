# =============================================================================
# Dockerfile — agent-os multi-stage build
# Base: debian:13-slim
# Build: docker build -t ghcr.io/chonsong/agent-os:latest .
# =============================================================================

# ── Stage 1: TypeScript build (npm + turbo) ──────────────────────────────────
FROM node:22 AS ts-build
WORKDIR /app

# Copy workspace files for turbo to resolve deps
COPY package.json package-lock.json turbo.json nx.json ./
COPY apps/dashboard/frontend/package*.json apps/dashboard/frontend/
COPY apps/dashboard/backend/package*.json apps/dashboard/backend/
COPY packages/shared-types/package*.json packages/shared-types/

# Install deps and build
RUN npm ci
COPY apps/ apps/
COPY packages/ packages/
RUN npx turbo build

# ── Stage 2: Python packages (uv sync) ─────────────────────────────────────
FROM python:3.13-slim AS py-deps
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install --break-system-packages uv
COPY pyproject.toml uv.lock ./
COPY packages/nanobot/ packages/nanobot/
COPY packages/observability/ packages/observability/
COPY packages/agent-adapter/ packages/agent-adapter/
RUN uv sync --frozen

# ── Stage 3: Go binaries ────────────────────────────────────────────────────
FROM golang:1.23-alpine AS go-build
WORKDIR /app
COPY go.mod go.sum ./
COPY infra/CasaOS/agent/ infra/CasaOS/agent/
COPY infra/CasaOS/webhook-emitter/ infra/CasaOS/webhook-emitter/
RUN go build -o /bin/agent ./infra/CasaOS/agent && \
    go build -o /bin/webhook-emitter ./infra/CasaOS/webhook-emitter

# ── Stage 4: Runtime ────────────────────────────────────────────────────────
FROM debian:13-slim

ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV PORT=9120

# Install runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python package management
RUN pip install --break-system-packages uv

WORKDIR /app

# Python packages
COPY --from=py-deps /app/.venv /app/.venv
COPY packages/nanobot/ ./packages/nanobot/
COPY packages/observability/ ./packages/observability/
COPY packages/agent-adapter/ ./packages/agent-adapter/
ENV PATH="/app/.venv/bin:$PATH"

# Go binaries
COPY --from=go-build /bin/agent /usr/local/bin/agent
COPY --from=go-build /bin/webhook-emitter /usr/local/bin/webhook-emitter

# TypeScript builds (frontend + backend dist from Stage 1)
COPY --from=ts-build /app/apps/dashboard/frontend/dist /app/apps/dashboard/frontend/dist
COPY --from=ts-build /app/apps/dashboard/backend/dist /app/apps/dashboard/backend/dist
COPY --from=ts-build /app/apps/dashboard/backend/node_modules /app/apps/dashboard/backend/node_modules
COPY --from=ts-build /app/apps/dashboard/backend/package.json /app/apps/dashboard/backend/package.json
COPY --from=ts-build /app/packages/shared-types/dist /app/packages/shared-types/dist

# Config
ENV NANOBOT_CONFIG_DIR=/opt/data/home/.nanobot
RUN mkdir -p "$NANOBOT_CONFIG_DIR"

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf http://localhost:9120/health || exit 1

EXPOSE 8900 9120

# Start nanobot serve (port 8900) + Express backend (port 9120)
CMD ["sh", "-c", "nanobot serve --host 0.0.0.0 --port 8900 & \
     node /app/apps/dashboard/backend/dist/index.js"]

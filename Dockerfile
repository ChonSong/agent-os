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
RUN npm install
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
RUN uv sync && uv pip install --system /app/packages/nanobot/

# ── Stage 3: Go binaries ────────────────────────────────────────────────────
FROM golang:1.23-alpine AS go-build
WORKDIR /app

# Build agent — its go.mod must be the root module for its import path
WORKDIR /app/infra/CasaOS/agent
COPY infra/CasaOS/agent/go.mod infra/CasaOS/agent/go.sum ./
COPY infra/CasaOS/agent/ .
RUN go build -o /bin/agent .

# Build webhook-emitter — its go.mod must be the root module for its import path
WORKDIR /app/infra/CasaOS/webhook-emitter
COPY infra/CasaOS/webhook-emitter/go.mod infra/CasaOS/webhook-emitter/go.sum ./
COPY infra/CasaOS/webhook-emitter/ .
RUN go build -o /bin/webhook-emitter .

# ── Stage 4: Runtime ────────────────────────────────────────────────────────
FROM debian:13-slim

ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV PORT=9120
ENV PATH="/usr/bin:/usr/local/bin:/app/.venv/bin:$PATH"

# Install runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    ca-certificates \
    gnupg \
    docker-cli \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 via NodeSource
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install uv for Python package management
RUN pip install --break-system-packages uv

WORKDIR /app

# Python packages
COPY --from=py-deps /app/.venv /app/.venv
RUN rm -f /app/.venv/bin/python && ln -sf /usr/bin/python3 /app/.venv/bin/python
COPY packages/nanobot/ ./packages/nanobot/
COPY packages/observability/ ./packages/observability/
COPY packages/agent-adapter/ ./packages/agent-adapter/
RUN pip3 install --target=/app/.venv/lib/python3.13/site-packages prompt-toolkit aiohttp

# Go binaries
COPY --from=go-build /bin/agent /usr/local/bin/agent
COPY --from=go-build /bin/webhook-emitter /usr/local/bin/webhook-emitter

# TypeScript builds (frontend + backend dist from Stage 1)
COPY --from=ts-build /app/apps/dashboard/frontend/dist /app/apps/dashboard/frontend/dist
COPY --from=ts-build /app/apps/dashboard/backend/dist /app/apps/dashboard/backend/dist
COPY --from=ts-build /app/node_modules /app/node_modules
COPY --from=ts-build /app/package.json /app/package.json
COPY --from=ts-build /app/package-lock.json /app/package-lock.json
COPY --from=ts-build /app/packages/shared-types/dist /app/packages/shared-types/dist

# Entrypoint script (copied from build context)
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Config
ENV NANOBOT_CONFIG_DIR=/opt/data/home/.nanobot
RUN mkdir -p "$NANOBOT_CONFIG_DIR"

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf http://localhost:9120/health || exit 1

EXPOSE 8900 9120 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["nanobot"]

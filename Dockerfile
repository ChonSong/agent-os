# =============================================================================
# Dockerfile — agent-os: bundled nanobot + dashboard in one container
# Build context: . (project root)
# Build: docker build -t ghcr.io/chonsong/agent-os:latest .
# =============================================================================

# ── Stage 1: Python deps (nanobot + observability) ───────────────────────────
FROM python:3.13-slim AS nanobot-deps
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install --break-system-packages uv
COPY packages/nanobot/ ./nanobot/
COPY packages/observability/ ./observability/
RUN uv pip install --system --break-system-packages -e "./nanobot[api]" -e "./observability" \
    && mkdir -p /opt/data/home/.nanobot

# ── Stage 2: Frontend ────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-stage
WORKDIR /app/frontend
COPY apps/dashboard/frontend/package*.json ./
RUN npm ci
COPY apps/dashboard/frontend/ ./
RUN npm run build

# ── Stage 3: Backend ────────────────────────────────────────────────────────
FROM node:22-alpine AS backend-stage
WORKDIR /app/backend
COPY apps/dashboard/backend/package*.json ./
RUN npm ci
COPY apps/dashboard/backend/ ./
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine

ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV PORT=9120

# Node.js (from node:22-alpine base) + Python + uv
RUN apk add --no-cache python3 py3-pip curl \
    && pip install --break-system-packages uv

WORKDIR /app

# nanobot + observability (Python deps)
COPY --from=nanobot-deps /opt/data/home/.nanobot /opt/data/home/.nanobot
COPY packages/nanobot/ ./nanobot/
COPY packages/observability/ ./observability/
RUN uv pip install --system --break-system-packages -e "./nanobot[api]" -e "./observability"

# Frontend + backend builds (from dedicated build stages)
COPY --from=frontend-stage /app/frontend/dist /app/frontend/dist
COPY --from=backend-stage /app/backend/dist /app/backend/dist
COPY --from=backend-stage /app/backend/node_modules /app/backend/node_modules
COPY --from=backend-stage /app/backend/package.json /app/backend/package.json

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf http://localhost:9120/health || exit 1

EXPOSE 8900 9120

# Start both services — nanobot serve (port 8900) and Express backend (port 9120)
CMD ["sh", "-c", "nanobot serve --host 0.0.0.0 --port 8900 & \
     cd /app/backend && node dist/index.js"]

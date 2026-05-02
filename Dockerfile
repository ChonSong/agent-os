# =============================================================================
# Dockerfile — agent-os: bundled nanobot + dashboard in one container
# =============================================================================

FROM python:3.13-slim AS nanobot-deps
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install uv
COPY packages/nanobot/ ./nanobot/
RUN uv pip install --system -e "./nanobot[api]" \
    && mkdir -p /opt/data/home/.nanobot

# ---------------------------------------------------------------------
FROM node:22-alpine AS frontend-stage
WORKDIR /app/frontend
COPY apps/dashboard/frontend/package.json apps/dashboard/frontend/package-lock.json* ./
RUN npm ci
COPY apps/dashboard/frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------
FROM node:22-alpine AS backend-stage
WORKDIR /app/backend
COPY apps/dashboard/backend/package.json apps/dashboard/backend/package-lock.json* ./
RUN npm ci
COPY apps/dashboard/backend/ ./
RUN npm run build

# ---------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV PORT=9120

# Install Python, curl (healthcheck), and uv for nanobot
RUN apk add --no-cache python3 py3-pip curl \
    && pip install uv

WORKDIR /app

# nanobot — install from source, data dir
COPY --from=nanobot-deps /opt/data/home/.nanobot /opt/data/home/.nanobot
COPY packages/nanobot/ ./nanobot/
RUN uv pip install --system -e "./nanobot[api]"

# frontend build
COPY --from=frontend-stage /app/frontend/dist /app/frontend/dist

# backend build
COPY --from=backend-stage /app/backend/dist /app/backend/dist
COPY --from=backend-stage /app/backend/node_modules /app/backend/node_modules
COPY apps/dashboard/backend/package.json /app/backend/package.json

# Install concurrently (run nanobot + dashboard together)
RUN npm install --global concurrently

WORKDIR /app

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf http://localhost:9120/health || exit 1

EXPOSE 8900 9120

# Start nanobot (port 8900) and dashboard backend (port 9120) concurrently
CMD ["sh", "-c", \
     "nanobot serve --host 0.0.0.0 --port 8900 &" \
     "echo 'nanobot started' &" \
     "cd /app/backend && node dist/index.js"]

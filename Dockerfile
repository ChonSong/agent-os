# =============================================================================
# Dockerfile — agent-os: bundled nanobot + dashboard in one container
# Build context: /repo (bind-mounted from host at docker compose up --build)
# =============================================================================

FROM python:3.13-slim AS nanobot-deps
ENV PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install uv
COPY nanobot/ ./nanobot/
RUN uv pip install --system -e "./nanobot[api]" \
    && mkdir -p /opt/data/home/.nanobot

# ---------------------------------------------------------------------
FROM node:22-alpine AS frontend-stage
WORKDIR /app/frontend
COPY dashboard/frontend/package.json dashboard/frontend/package-lock.json* ./
RUN npm ci
COPY dashboard/frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------
FROM node:22-alpine AS backend-stage
WORKDIR /app/backend
COPY dashboard/backend/package.json dashboard/backend/package-lock.json* ./
RUN npm ci
COPY dashboard/backend/ ./
RUN npm run build

# ---------------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV PORT=9120

RUN apk add --no-cache python3 py3-pip curl \
    && pip install uv

WORKDIR /app

# nanobot
COPY --from=nanobot-deps /opt/data/home/.nanobot /opt/data/home/.nanobot
COPY nanobot/ ./nanobot/
RUN uv pip install --system -e "./nanobot[api]"

# frontend + backend builds
COPY dashboard/frontend/dist /app/frontend/dist
COPY dashboard/backend/dist /app/backend/dist
COPY dashboard/backend/node_modules /app/backend/node_modules
COPY dashboard/backend/package.json /app/backend/package.json

RUN npm install --global concurrently

WORKDIR /app

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf http://localhost:9120/health || exit 1

EXPOSE 8900 9120

CMD ["sh", "-c", \
     "nanobot serve --host 0.0.0.0 --port 8900 &" \
     "echo 'nanobot started' &" \
     "cd /app/backend && node dist/index.js"]

# =============================================================================
# Dockerfile — agent-os multi-stage build
# Backend: Express + Socket.IO on port 3001
# Webhook-emitter: Go binary
# Frontend: bundled React SPA (no volume override needed)
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

# ── Stage 2: Go binaries ────────────────────────────────────────────────────
FROM golang:1.23-alpine AS go-build
WORKDIR /app

# Build webhook-emitter — its go.mod must be the root module for its import path
WORKDIR /app/infra/CasaOS/webhook-emitter
COPY infra/CasaOS/webhook-emitter/go.mod infra/CasaOS/webhook-emitter/go.sum ./
COPY infra/CasaOS/webhook-emitter/ .
RUN go build -o /bin/webhook-emitter .

# ── Stage 3: Runtime ────────────────────────────────────────────────────────
FROM debian:13-slim

ENV NODE_ENV=production
ENV PORT=3001
ENV PATH="/usr/bin:/usr/local/bin:$PATH"

# Install runtime deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    docker-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Go binaries
COPY --from=go-build /bin/webhook-emitter /usr/local/bin/webhook-emitter

# TypeScript builds (frontend + backend dist from Stage 1)
COPY --from=ts-build /app/apps/dashboard/frontend/dist /app/apps/dashboard/frontend/dist
COPY --from=ts-build /app/apps/dashboard/backend/dist /app/apps/dashboard/backend/dist
COPY --from=ts-build /app/node_modules /app/node_modules
COPY --from=ts-build /app/package.json /app/package.json
COPY --from=ts-build /app/package-lock.json /app/package-lock.json
COPY --from=ts-build /app/packages/shared-types/dist /app/packages/shared-types/dist

# Entrypoint script
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Migrations (for reference, applied separately)
COPY infra/postgres/migrations/ ./infra/postgres/migrations/

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -sf http://localhost:3001/api/db/health || exit 1

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["backend"]

#!/bin/bash
# agent-deploy.sh — polls GHCR for new image digest and redeploys
# Runs as cron on the HOST (bypasses container networking limitation)
# Cron: * * * * * /home/sean/scripts/agent-deploy.sh >> /tmp/agent-os-deploy.log 2>&1
set -e

COMPOSE_FILE="/home/sean/.hermes/agent-os/docker-compose.yml"
LOG="/tmp/agent-os-deploy.log"
LOCK="/tmp/agent-os-deploy.lock"
GHCR_IMAGE="ghcr.io/chonsong/agent-os:latest"

# Ensure only one instance runs
if [ -f "$LOCK" ]; then
  # Check if stale (older than 5 minutes)
  if [ $(($(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0))) -lt 300 ]; then
    echo "[$(date)] Already running, skipping" >> "$LOG"
    exit 0
  fi
  rm -f "$LOCK"
fi
touch "$LOCK"

log() { echo "[$(date)] $1" >> "$LOG"; }

log "Checking for new image..."

# Get current backend image digest
CURRENT=$(docker inspect agent-os-backend --format '{{.Image}}' 2>/dev/null | cut -d: -f2 | cut -c1-12)
if [ -z "$CURRENT" ]; then
  log "ERROR: Cannot get current backend image"
  rm -f "$LOCK"
  exit 1
fi

# Pull latest and get new digest
docker pull "$GHCR_IMAGE" >> "$LOG" 2>&1
NEW=$(docker inspect "$GHCR_IMAGE" --format '{{.Id}}' 2>/dev/null | cut -d: -f2 | cut -c1-12)

if [ "$CURRENT" = "$NEW" ]; then
  log "Image unchanged ($CURRENT)"
  rm -f "$LOCK"
  exit 0
fi

log "New image detected: $CURRENT → $NEW. Deploying..."

# Recreate backend container
if docker-compose -f "$COMPOSE_FILE" up -d backend >> "$LOG" 2>&1; then
  log "Backend recreated successfully"
else
  log "ERROR: Backend recreate failed"
  rm -f "$LOCK"
  exit 1
fi

rm -f "$LOCK"
log "Deploy complete"


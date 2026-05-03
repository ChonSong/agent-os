#!/bin/bash
# Start nanobot serve sidecar, then hermes gateway.
# Usage: bash scripts/start-agent.sh

set -e

NANOBOT_PORT="${NANOBOT_PORT:-8900}"
NANOBOT_WORKSPACE="${NANOBOT_WORKSPACE:-/opt/data/nanobot_workspace}"
HERMES_PORT="${HERMES_PORT:-9119}"

mkdir -p "$NANOBOT_WORKSPACE"

echo "[start-agent] Starting nanobot serve on :$NANOBOT_PORT..."
pip install nanobot-ai[api] -q
nanobot serve --host 0.0.0.0 --port "$NANOBOT_PORT" &
NANOBOT_PID=$!

sleep 2

echo "[start-agent] nanobot PID=$NANOBOT_PID"
echo "[start-agent] Starting hermes gateway on :$HERMES_PORT..."
hermes web --port "$HERMES_PORT" &
HERMES_PID=$!

echo "[start-agent] nanobot PID=$NANOBOT_PID, hermes PID=$HERMES_PID"
echo "[start-agent] Dashboard: http://localhost:$HERMES_PORT"
echo "[start-agent] nanobot API: http://localhost:$NANOBOT_PORT"

wait

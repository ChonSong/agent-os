#!/bin/sh
# agent-os entrypoint — supports multiple services from the same image
set -e

SERVICE="${1:-nanobot}"

echo "[entrypoint] Starting service: $SERVICE"

case "$SERVICE" in
  nanobot)
    echo "[entrypoint] Starting nanobot on :8900"
    nanobot serve --host 0.0.0.0 --port 8900 &
    NANOBOT_PID=$!
    echo "[entrypoint] nanobot PID: $NANOBOT_PID"
    wait $NANOBOT_PID
    ;;
  backend)
    echo "[entrypoint] Starting Express backend on :3001"
    node /app/packages/nanobot/dist/index.js &
    BACKEND_PID=$!
    wait $BACKEND_PID
    ;;
  webhook-emitter)
    echo "[entrypoint] Starting CasaOS webhook-emitter"
    /app/webhook-emitter &
    EMITTER_PID=$!
    wait $EMITTER_PID
    ;;
  all)
    echo "[entrypoint] Starting all services"
    nanobot serve --host 0.0.0.0 --port 8900 &
    NANOBOT_PID=$!
    echo "[entrypoint] nanobot PID: $NANOBOT_PID"
    sleep 2
    node /app/packages/nanobot/dist/index.js &
    BACKEND_PID=$!
    echo "[entrypoint] backend PID: $BACKEND_PID"
    if [ -f /app/webhook-emitter ]; then
      /app/webhook-emitter &
      EMITTER_PID=$!
      echo "[entrypoint] webhook-emitter PID: $EMITTER_PID"
    fi
    wait $NANOBOT_PID
    ;;
  *)
    echo "[entrypoint] Unknown service: $SERVICE — starting nanobot by default"
    nanobot serve --host 0.0.0.0 --port 8900 &
    wait
    ;;
esac

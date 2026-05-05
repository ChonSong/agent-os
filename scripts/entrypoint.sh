#!/bin/sh
# agent-os entrypoint — supports multiple services from the same image
# Usage: entrypoint.sh <service> [args...]
#   service: nanobot | backend | webhook-emitter | all
set -e

SERVICE="${1:-nanobot}"
shift  # consume service name, pass remaining args

echo "[entrypoint] Starting service: $SERVICE"

case "$SERVICE" in
  nanobot)
    echo "[entrypoint] Starting nanobot on :8900"
    exec nanobot serve --host 0.0.0.0 --port 8900 "$@"
    ;;

  backend)
    echo "[entrypoint] Starting Express backend on :3001"
    exec node /app/apps/dashboard/backend/dist/index.js "$@"
    ;;

  webhook-emitter)
    echo "[entrypoint] Starting CasaOS webhook-emitter"
    exec /usr/local/bin/webhook-emitter "$@"
    ;;

  all)
    echo "[entrypoint] Starting all services"
    nanobot serve --host 0.0.0.0 --port 8900 &
    NANOBOT_PID=$!
    echo "[entrypoint] nanobot PID: $NANOBOT_PID"
    sleep 2
    node /app/apps/dashboard/backend/dist/index.js &
    BACKEND_PID=$!
    echo "[entrypoint] backend PID: $BACKEND_PID"
    /usr/local/bin/webhook-emitter &
    EMITTER_PID=$!
    echo "[entrypoint] webhook-emitter PID: $EMITTER_PID"
    wait $NANOBOT_PID
    ;;

  *)
    echo "[entrypoint] Unknown service: $SERVICE — starting nanobot"
    exec nanobot serve --host 0.0.0.0 --port 8900 "$@"
    ;;
esac

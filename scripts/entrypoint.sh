#!/bin/sh
# agent-os entrypoint — supports multiple services from the same image
# Usage: entrypoint.sh <service> [args...]
#   service: backend | webhook-emitter
set -e

SERVICE="${1:-backend}"
shift  # consume service name, pass remaining args

echo "[entrypoint] Starting service: $SERVICE"

case "$SERVICE" in
  backend)
    echo "[entrypoint] Starting Express backend on :3001"
    exec node /app/apps/dashboard/backend/dist/index.js "$@"
    ;;

  webhook-emitter)
    echo "[entrypoint] Starting CasaOS webhook-emitter"
    exec /usr/local/bin/webhook-emitter "$@"
    ;;

  *)
    echo "[entrypoint] Unknown service: $SERVICE — starting backend"
    exec node /app/apps/dashboard/backend/dist/index.js "$@"
    ;;
esac

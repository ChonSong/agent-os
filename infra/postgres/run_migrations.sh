#!/usr/bin/env bash
# infra/postgres/run_migrations.sh
# Runs all SQL migrations in order against the target database.
set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/migrations"
DATABASE_URL="${DATABASE_URL:-postgresql://agentos:agentos_secure_pg_pass_2026@127.0.0.1:5432/agentos}"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "No migrations directory found at $MIGRATIONS_DIR"
  exit 1
fi

echo "Running migrations against $DATABASE_URL"

for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "  Applying: $(basename "$migration")"
  psql "$DATABASE_URL" -f "$migration"
done

echo "All migrations applied."

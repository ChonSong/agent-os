#!/usr/bin/env bash
# infra/postgres/run_migrations.sh
# Runs all SQL migrations in order, skipping already-applied ones.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"
DATABASE_URL="${DATABASE_URL:-postgresql://agentos:agentos_secure_pg_pass_2026@127.0.0.1:5432/agentos}"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "No migrations directory found at $MIGRATIONS_DIR"
  exit 1
fi

# Ensure schema_migrations table exists (inject it first if needed)
echo "$DATABASE_URL" | grep -q '\*\*\*' && echo "Using redacted password — assuming remote run" || true

echo "Running migrations against $DATABASE_URL"

# Create the tracking table if it doesn't exist
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
  );
" 2>/dev/null || true

for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  NAME=$(basename "$migration")
  # Skip already-applied migrations
  APPLIED=$(psql "$DATABASE_URL" -t -c "SELECT 1 FROM schema_migrations WHERE version='$NAME';" 2>/dev/null || echo "0")
  if [[ "$APPLIED" == "1" ]]; then
    echo "  Skipping (already applied): $NAME"
  else
    echo "  Applying: $NAME"
    psql "$DATABASE_URL" -f "$migration"
    psql "$DATABASE_URL" -c "INSERT INTO schema_migrations (version) VALUES ('$NAME');" \
      || echo "Warning: could not record migration $NAME"
  fi
done

echo "All migrations applied."

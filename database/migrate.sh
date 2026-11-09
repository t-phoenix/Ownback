#!/usr/bin/env bash
# Apply every migration in database/migrations/ (tracked in schema_migrations). Requires DATABASE_URL.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
: "${DATABASE_URL:?Set DATABASE_URL to a Postgres connection string}"

node "$ROOT/../scripts/apply-migrations.mjs"

if [[ "${1:-}" == "--seed" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/seed.sql"
  echo "Applied seed.sql"
fi

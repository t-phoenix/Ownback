#!/usr/bin/env bash
# Apply local Postgres migrations. Requires DATABASE_URL (postgres://…).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
: "${DATABASE_URL:?Set DATABASE_URL to a Postgres connection string}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/migrations/0001_init.sql"
echo "Applied 0001_init.sql"

if [[ "${1:-}" == "--seed" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/seed.sql"
  echo "Applied seed.sql"
fi

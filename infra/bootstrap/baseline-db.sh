#!/usr/bin/env bash
# Baseline an existing Rkyves database that was created with db push (fixes Prisma P3005).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCHEMA="$ROOT/packages/db/prisma/schema.prisma"
DATABASE_URL="${DATABASE_URL:-postgresql://rkyves:rkyves_secret@postgres:5432/rkyves_control}"

echo "=== Rkyves DB baseline ==="

# Apply console features SQL if tables are missing (safe: uses IF NOT EXISTS)
if [ -f "$ROOT/packages/db/prisma/migrations/20260901180000_console_features/migration.sql" ]; then
  echo "Applying console_features migration SQL..."
  docker exec -i rkyves-control-db psql -U rkyves -d rkyves_control \
    < "$ROOT/packages/db/prisma/migrations/20260901180000_console_features/migration.sql"
fi

echo "Marking migrations as applied..."
docker run --rm --network rkyves-platform \
  -v "$ROOT/packages/db/prisma:/prisma" \
  -e DATABASE_URL="$DATABASE_URL" \
  node:20-alpine sh -c "
    npm install -g prisma@6.19.3 >/dev/null 2>&1
    prisma migrate resolve --applied 20260831120000_init --schema=/prisma/schema.prisma
    prisma migrate resolve --applied 20260901130000_github_integration --schema=/prisma/schema.prisma
    prisma migrate resolve --applied 20260901180000_console_features --schema=/prisma/schema.prisma
    echo '--- migrate deploy (should report no pending migrations) ---'
    prisma migrate deploy --schema=/prisma/schema.prisma
  "

echo "Migration history:"
docker exec rkyves-control-db psql -U rkyves -d rkyves_control \
  -c 'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at;'

echo "Restarting API..."
docker compose -f "$ROOT/infra/docker-compose.yml" restart api

echo "Done. Check: docker logs rkyves-api --tail 20"

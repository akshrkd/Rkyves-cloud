#!/bin/sh
set -e

SCHEMA="/app/packages/db/prisma/schema.prisma"
cd /app/apps/api

if [ ! -f "$SCHEMA" ]; then
  echo "ERROR: Prisma schema not found at $SCHEMA"
  exit 1
fi

if [ ! -f ./dist/index.js ]; then
  echo "ERROR: dist/index.js not found"
  exit 1
fi

PRISMA_BIN=""
for candidate in /app/node_modules/.bin/prisma /app/packages/db/node_modules/.bin/prisma prisma; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PRISMA_BIN="$candidate"
    break
  fi
  if [ -x "$candidate" ]; then
    PRISMA_BIN="$candidate"
    break
  fi
done

if [ -n "$PRISMA_BIN" ]; then
  echo "Generating Prisma client..."
  "$PRISMA_BIN" generate --schema="$SCHEMA"
  echo "Running database migrations..."
  set +e
  MIGRATE_OUTPUT=$("$PRISMA_BIN" migrate deploy --schema="$SCHEMA" 2>&1)
  MIGRATE_EXIT=$?
  set -e
  echo "$MIGRATE_OUTPUT"
  if [ "$MIGRATE_EXIT" -ne 0 ]; then
    if echo "$MIGRATE_OUTPUT" | grep -q P3005; then
      echo "Legacy database without migration history; syncing schema with db push..."
      "$PRISMA_BIN" db push --schema="$SCHEMA" --skip-generate
    else
      echo "ERROR: Migration failed"
      exit 1
    fi
  fi
fi

echo "Starting Rkyves API..."
exec node dist/index.js

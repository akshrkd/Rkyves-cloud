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

if [ -x /app/node_modules/.bin/prisma ]; then
  echo "Generating Prisma client..."
  /app/node_modules/.bin/prisma generate --schema="$SCHEMA"
  echo "Running database migrations..."
  /app/node_modules/.bin/prisma db push --schema="$SCHEMA"
fi

echo "Starting Rkyves API..."
exec node dist/index.js

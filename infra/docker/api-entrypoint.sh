#!/bin/sh
set -e

SCHEMA="./prisma/schema.prisma"
if [ ! -f "$SCHEMA" ]; then
  SCHEMA=$(find ./node_modules -path '*/prisma/schema.prisma' 2>/dev/null | head -1)
fi

if [ ! -f "$SCHEMA" ]; then
  echo "ERROR: Prisma schema not found"
  find . -name 'schema.prisma' 2>/dev/null || true
  exit 1
fi

if [ ! -f ./dist/index.js ]; then
  echo "ERROR: dist/index.js not found"
  ls -la
  exit 1
fi

if [ -x ./node_modules/.bin/prisma ]; then
  echo "Using schema: $SCHEMA"
  echo "Generating Prisma client..."
  ./node_modules/.bin/prisma generate --schema="$SCHEMA"
  echo "Running database migrations..."
  ./node_modules/.bin/prisma db push --schema="$SCHEMA" --skip-generate
fi

echo "Starting Rkyves API..."
exec node dist/index.js

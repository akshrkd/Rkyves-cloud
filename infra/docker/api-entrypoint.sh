#!/bin/sh
set -e

SCHEMA="./packages/db/prisma/schema.prisma"

if [ ! -f "$SCHEMA" ]; then
  echo "ERROR: Prisma schema not found at $SCHEMA"
  exit 1
fi

if [ ! -f ./dist/index.js ]; then
  echo "ERROR: dist/index.js not found"
  exit 1
fi

if [ -x ./node_modules/.bin/prisma ]; then
  echo "Generating Prisma client..."
  ./node_modules/.bin/prisma generate --schema="$SCHEMA"
  echo "Running database migrations..."
  ./node_modules/.bin/prisma db push --schema="$SCHEMA"
fi

echo "Starting Rkyves API..."
exec node dist/index.js

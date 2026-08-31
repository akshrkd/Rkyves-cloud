#!/bin/sh
set -e

SCHEMA="./node_modules/@rkyves/db/prisma/schema.prisma"
if [ ! -f "$SCHEMA" ]; then
  SCHEMA="./packages/db/prisma/schema.prisma"
fi

if [ -x ./node_modules/.bin/prisma ] && [ -f "$SCHEMA" ]; then
  echo "Running database migrations..."
  ./node_modules/.bin/prisma db push --schema="$SCHEMA" --skip-generate || true
fi

echo "Starting Rkyves API..."
exec node dist/index.js

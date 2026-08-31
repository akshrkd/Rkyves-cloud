#!/bin/sh
set -e

if [ -x ./node_modules/.bin/prisma ]; then
  echo "Running database migrations..."
  ./node_modules/.bin/prisma db push --schema=./packages/db/prisma/schema.prisma --skip-generate || true
fi

echo "Starting Rkyves API..."
exec node dist/index.js

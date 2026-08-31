#!/bin/sh
set -e

echo "Running database migrations..."
node ./node_modules/prisma/build/index.js db push --schema=./packages/db/prisma/schema.prisma --skip-generate 2>/dev/null || \
  node ./node_modules/.pnpm/prisma@*/node_modules/prisma/build/index.js db push --schema=./packages/db/prisma/schema.prisma --skip-generate || \
  echo "Migration skipped (run manually if needed)"

echo "Starting Rkyves API..."
exec node dist/index.js

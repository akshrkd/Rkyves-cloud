#!/usr/bin/env bash
# Create default admin user (admin@rkyves.com / admin123456)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgresql://rkyves:rkyves_secret@postgres:5432/rkyves_control}"

echo "=== Seeding admin user ==="

docker run --rm --network rkyves-platform \
  -v "$ROOT:/app" -w /app/packages/db \
  -e DATABASE_URL="$DATABASE_URL" \
  node:20-alpine sh -c "
    npm install -g tsx >/dev/null 2>&1
    cd /app/packages/db
    npm install bcryptjs @types/bcryptjs --no-save >/dev/null 2>&1 || true
    npx tsx prisma/seed.ts
  "

echo "Login: admin@rkyves.com / admin123456"

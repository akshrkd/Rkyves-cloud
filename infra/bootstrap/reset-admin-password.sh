#!/usr/bin/env bash
# Reset admin@rkyves.com password to admin123456
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://rkyves:rkyves_secret@postgres:5432/rkyves_control}"
EMAIL="${1:-admin@rkyves.com}"
PASSWORD="${2:-admin123456}"

echo "=== Resetting password for $EMAIL ==="

HASH=$(docker run --rm node:20-alpine sh -c "npm install bcryptjs --silent 2>/dev/null && node -e \"require('bcryptjs').hash(process.argv[1], 12).then(h => console.log(h))\" '$PASSWORD'")

docker exec rkyves-control-db psql -U rkyves -d rkyves_control -c \
  "UPDATE \"User\" SET \"passwordHash\" = '$HASH' WHERE email = '$EMAIL';"

echo "Password updated. Login with: $EMAIL / $PASSWORD"

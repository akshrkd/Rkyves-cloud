#!/usr/bin/env bash
# Reset admin@rkyves.com password to admin123456 (avoids shell $ escaping issues with bcrypt)
set -euo pipefail

EMAIL="${1:-admin@rkyves.com}"
PASSWORD="${2:-admin123456}"

echo "=== Resetting password for $EMAIL ==="

docker exec \
  -e RESET_EMAIL="$EMAIL" \
  -e RESET_PASSWORD="$PASSWORD" \
  rkyves-api node --input-type=module -e "
import bcrypt from 'bcryptjs';
import { prisma } from '/app/packages/db/dist/index.js';

const email = process.env.RESET_EMAIL;
const password = process.env.RESET_PASSWORD;
const hash = await bcrypt.hash(password, 12);
await prisma.user.update({ where: { email }, data: { passwordHash: hash } });
console.log('Password reset OK for', email);
await prisma.\$disconnect();
"

echo "Login with: $EMAIL / $PASSWORD"

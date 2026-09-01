#!/usr/bin/env bash
# Configure GitHub App env vars on the Rkyves VM and restart the API.
#
# Usage:
#   bash infra/bootstrap/configure-github.sh \
#     --app-id 123456 \
#     --private-key /path/to/rkyves.private-key.pem \
#     --client-id Iv1.xxxx \
#     --client-secret xxxx \
#     --webhook-secret "$(openssl rand -hex 24)" \
#     --slug rkyves
#
# Create the GitHub App first: https://github.com/settings/apps/new
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"

APP_ID=""
PRIVATE_KEY_FILE=""
CLIENT_ID=""
CLIENT_SECRET=""
WEBHOOK_SECRET=""
SLUG="rkyves"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-id) APP_ID="$2"; shift 2 ;;
    --private-key) PRIVATE_KEY_FILE="$2"; shift 2 ;;
    --client-id) CLIENT_ID="$2"; shift 2 ;;
    --client-secret) CLIENT_SECRET="$2"; shift 2 ;;
    --webhook-secret) WEBHOOK_SECRET="$2"; shift 2 ;;
    --slug) SLUG="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$APP_ID" || -z "$PRIVATE_KEY_FILE" ]]; then
  cat <<'HELP'

=== GitHub App setup for Rkyves Cloud ===

1) Create a GitHub App: https://github.com/settings/apps/new

   GitHub App name:     Rkyves Cloud (or your choice)
   Homepage URL:        https://cloud.rkyves.com
   Callback URL:        https://api.rkyves.com/integrations/github/callback
   Setup URL:           https://api.rkyves.com/integrations/github/callback
   Webhook URL:         https://api.rkyves.com/webhooks/github/app
   Webhook secret:      generate with: openssl rand -hex 24

   Permissions (minimum):
     Repository metadata: Read
     Contents: Read
     Webhooks: Read & write

   Subscribe to events:
     Push

   Where can this app be installed: Any account

2) After creating the app:
   - Note the App ID
   - Generate a private key (download .pem file)
   - Note Client ID and Client secret (optional but recommended)

3) Run this script on your VM:

   bash infra/bootstrap/configure-github.sh \
     --app-id YOUR_APP_ID \
     --private-key /root/rkyves.private-key.pem \
     --client-id YOUR_CLIENT_ID \
     --client-secret YOUR_CLIENT_SECRET \
     --webhook-secret YOUR_WEBHOOK_SECRET \
     --slug YOUR_APP_SLUG

4) In Integrations, click Connect GitHub for your org.

HELP
  exit 1
fi

if [[ ! -f "$PRIVATE_KEY_FILE" ]]; then
  echo "Private key file not found: $PRIVATE_KEY_FILE"
  exit 1
fi

if [[ -z "$WEBHOOK_SECRET" ]]; then
  WEBHOOK_SECRET=$(openssl rand -hex 24)
  echo "Generated webhook secret: $WEBHOOK_SECRET"
fi

touch "$ENV_FILE"
upsert_env() {
  local key="$1"
  local val="$2"
  touch "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  fi
  printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
}

upsert_env "GITHUB_APP_ID" "$APP_ID"
upsert_env "GITHUB_APP_SLUG" "$SLUG"
upsert_env "GITHUB_APP_CLIENT_ID" "$CLIENT_ID"
upsert_env "GITHUB_APP_CLIENT_SECRET" "$CLIENT_SECRET"
upsert_env "GITHUB_WEBHOOK_SECRET" "$WEBHOOK_SECRET"
upsert_env "API_PUBLIC_URL" "https://api.rkyves.com"
upsert_env "CORS_ORIGIN" "https://cloud.rkyves.com"

SECRETS_DIR="$ROOT/secrets"
mkdir -p "$SECRETS_DIR"
cp "$PRIVATE_KEY_FILE" "$SECRETS_DIR/github.pem"
chmod 600 "$SECRETS_DIR/github.pem"

upsert_env "GITHUB_APP_PRIVATE_KEY_FILE" "/run/secrets/github.pem"

# Drop stale inline key from .env — the mounted PEM file is the source of truth.
grep -v "^GITHUB_APP_PRIVATE_KEY=" "$ENV_FILE" > "${ENV_FILE}.tmp" 2>/dev/null || true
mv "${ENV_FILE}.tmp" "$ENV_FILE"

COMPOSE_FILES=(-f "$ROOT/infra/docker-compose.yml")
OVERRIDE="$ROOT/infra/docker-compose.github.override.yml"
cat > "$OVERRIDE" <<'YAML'
services:
  api:
    environment:
      GITHUB_APP_PRIVATE_KEY_FILE: /run/secrets/github.pem
    volumes:
      - ../secrets/github.pem:/run/secrets/github.pem:ro
YAML
COMPOSE_FILES+=(-f "$OVERRIDE")

echo "Updated $ENV_FILE with GitHub settings"
echo "Restarting API (recreate to load new env)..."
docker compose "${COMPOSE_FILES[@]}" up -d api --force-recreate

sleep 5
echo ""
echo "Checking configuration..."
CONFIGURED_JSON=$(curl -s "https://api.rkyves.com/integrations/github/configured" 2>/dev/null || curl -s "http://localhost:3001/integrations/github/configured" 2>/dev/null || true)
if [[ -n "$CONFIGURED_JSON" ]]; then
  echo "$CONFIGURED_JSON"
else
  echo "Warning: /integrations/github/configured returned nothing — rebuild API: cd infra && docker compose build api && docker compose up -d api --force-recreate"
fi
echo ""
docker exec rkyves-api printenv GITHUB_APP_ID GITHUB_APP_SLUG 2>/dev/null || true
KEY_OK=$(docker exec rkyves-api sh -c 'test -n "$GITHUB_APP_PRIVATE_KEY" -o -f "$GITHUB_APP_PRIVATE_KEY_FILE" && echo yes || echo no' 2>/dev/null || echo no)
echo "Private key loaded: $KEY_OK"

echo ""
echo "Done. Open https://cloud.rkyves.com/dashboard/settings/integrations and click Connect GitHub."
echo "Use the SAME webhook secret in GitHub App settings: $WEBHOOK_SECRET"

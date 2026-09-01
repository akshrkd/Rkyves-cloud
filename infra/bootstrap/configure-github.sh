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

# Base64-encode PEM so it fits on one .env line
PRIVATE_KEY_B64=$(base64 -w 0 "$PRIVATE_KEY_FILE" 2>/dev/null || base64 "$PRIVATE_KEY_FILE" | tr -d '\n')

touch "$ENV_FILE"
upsert_env() {
  local key="$1"
  local val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

upsert_env "GITHUB_APP_ID" "$APP_ID"
upsert_env "GITHUB_APP_SLUG" "$SLUG"
upsert_env "GITHUB_APP_PRIVATE_KEY" "$PRIVATE_KEY_B64"
upsert_env "GITHUB_APP_CLIENT_ID" "$CLIENT_ID"
upsert_env "GITHUB_APP_CLIENT_SECRET" "$CLIENT_SECRET"
upsert_env "GITHUB_WEBHOOK_SECRET" "$WEBHOOK_SECRET"
upsert_env "API_PUBLIC_URL" "https://api.rkyves.com"
upsert_env "CORS_ORIGIN" "https://cloud.rkyves.com"

echo "Updated $ENV_FILE with GitHub settings"
echo "Restarting API..."
docker compose -f "$ROOT/infra/docker-compose.yml" up -d api

sleep 3
echo ""
echo "Checking configuration..."
curl -sf "https://api.rkyves.com/integrations/github/configured" || curl -sf "http://localhost:3001/integrations/github/configured" || true
echo ""
docker exec rkyves-api printenv GITHUB_APP_ID GITHUB_APP_SLUG 2>/dev/null || true

echo ""
echo "Done. Open https://cloud.rkyves.com/dashboard/settings/integrations and click Connect GitHub."
echo "Use the SAME webhook secret in GitHub App settings: $WEBHOOK_SECRET"

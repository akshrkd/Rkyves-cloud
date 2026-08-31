#!/usr/bin/env bash
set -euo pipefail

echo "=== Rkyves Cloud VM Bootstrap ==="

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash setup.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get upgrade -y
apt-get install -y curl git ufw ca-certificates gnupg lsb-release

# Docker
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable docker
systemctl start docker

# Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Platform directory
INSTALL_DIR="${INSTALL_DIR:-/opt/rkyves-platform}"
mkdir -p "$INSTALL_DIR"

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cat > "$INSTALL_DIR/.env" <<EOF
DATABASE_URL=postgresql://rkyves:rkyves_secret@postgres:5432/rkyves_control
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)
CORS_ORIGIN=https://cloud.rkyves.com
REDIS_URL=redis://redis:6379
AGENT_TOKEN=$(openssl rand -hex 24)
WORKER_ID=worker-1
PLATFORM_DOMAIN=rkyves.com
ACME_EMAIL=admin@rkyves.com
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=rkyves
MINIO_SECRET_KEY=$(openssl rand -hex 16)
MINIO_BUCKET_PREFIX=rkyves
EOF
  echo "Created $INSTALL_DIR/.env — update PLATFORM_DOMAIN and ACME_EMAIL"
fi

echo ""
echo "Bootstrap complete. Next steps:"
echo "  1. Clone/copy rkyves-platform to $INSTALL_DIR"
echo "  2. cd $INSTALL_DIR/infra && docker compose up -d"
echo "  3. docker compose exec api pnpm db:push && pnpm db:seed"
echo "  4. Open https://cloud.\$PLATFORM_DOMAIN"

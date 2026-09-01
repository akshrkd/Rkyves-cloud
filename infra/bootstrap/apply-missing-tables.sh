#!/usr/bin/env bash
# Apply migration SQL that was marked as applied during baseline but never executed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== Applying missing GitHub integration tables ==="

docker exec -i rkyves-control-db psql -U rkyves -d rkyves_control <<'SQL'
CREATE TABLE IF NOT EXISTS "GitHubInstallation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GitHubRepoLink" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "installationId" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "webhookId" INTEGER,
    "webhookSecret" TEXT NOT NULL,
    CONSTRAINT "GitHubRepoLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GitHubInstallation_organizationId_key" ON "GitHubInstallation"("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "GitHubInstallation_installationId_key" ON "GitHubInstallation"("installationId");
CREATE UNIQUE INDEX IF NOT EXISTS "GitHubRepoLink_serviceId_key" ON "GitHubRepoLink"("serviceId");

DO $$ BEGIN
  ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GitHubRepoLink" ADD CONSTRAINT "GitHubRepoLink_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
SQL

echo "Done. Restarting API..."
docker compose -f "$ROOT/infra/docker-compose.yml" restart api

echo "GitHub tables ready. Refresh the dashboard."

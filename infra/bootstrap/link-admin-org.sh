#!/usr/bin/env bash
# Ensure admin user is linked to the rkyves org as owner
set -euo pipefail

EMAIL="${1:-admin@rkyves.com}"

docker exec rkyves-control-db psql -U rkyves -d rkyves_control -c "
INSERT INTO \"OrgMember\" (id, \"organizationId\", \"userId\", role, \"createdAt\")
SELECT 'admin-org-link', o.id, u.id, 'owner', NOW()
FROM \"Organization\" o, \"User\" u
WHERE o.slug = 'rkyves' AND u.email = '$EMAIL'
ON CONFLICT (\"organizationId\", \"userId\") DO UPDATE SET role = 'owner';
"

echo "Org membership ensured for $EMAIL"

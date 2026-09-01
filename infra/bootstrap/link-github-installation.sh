#!/usr/bin/env bash
# Manually link an existing GitHub App installation to a Rkyves organization.
#
# Usage:
#   bash infra/bootstrap/link-github-installation.sh \
#     --org-id cmthmctr80001nw31aa8dxczv \
#     --installation-id 158285714 \
#     --account-login akshrkd \
#     --account-type User
set -euo pipefail

ORG_ID=""
INSTALLATION_ID=""
ACCOUNT_LOGIN=""
ACCOUNT_TYPE="User"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org-id) ORG_ID="$2"; shift 2 ;;
    --installation-id) INSTALLATION_ID="$2"; shift 2 ;;
    --account-login) ACCOUNT_LOGIN="$2"; shift 2 ;;
    --account-type) ACCOUNT_TYPE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$ORG_ID" || -z "$INSTALLATION_ID" || -z "$ACCOUNT_LOGIN" ]]; then
  echo "Required: --org-id, --installation-id, --account-login"
  exit 1
fi

docker exec rkyves-control-db psql -U rkyves -d rkyves_control -c "
INSERT INTO \"GitHubInstallation\" (
  id, \"organizationId\", \"installationId\", \"accountLogin\", \"accountType\", \"createdAt\", \"updatedAt\"
) VALUES (
  'ghinst-${INSTALLATION_ID}',
  '${ORG_ID}',
  ${INSTALLATION_ID},
  '${ACCOUNT_LOGIN}',
  '${ACCOUNT_TYPE}',
  NOW(),
  NOW()
)
ON CONFLICT (\"organizationId\") DO UPDATE SET
  \"installationId\" = EXCLUDED.\"installationId\",
  \"accountLogin\" = EXCLUDED.\"accountLogin\",
  \"accountType\" = EXCLUDED.\"accountType\",
  \"updatedAt\" = NOW();
"

echo "Linked GitHub installation ${INSTALLATION_ID} (${ACCOUNT_LOGIN}) to org ${ORG_ID}"
echo "Refresh https://cloud.rkyves.com/dashboard/settings/integrations"

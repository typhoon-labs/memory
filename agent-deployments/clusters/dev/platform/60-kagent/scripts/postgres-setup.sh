#!/bin/sh
# Creates the roles, logins, schemas and grants of the database kagent and
# Agent Substrate share, the same way `kagent install` does: both setup scripts
# in one transaction, run by the superuser through `kubectl exec`, because that
# user cannot log in over the network.
#
# Runs as the postsync hook of release `kagent-postgresql` (../helmfile.yaml),
# before Substrate or kagent connect. Safe to re-run. An empty password removes
# a login's password: they authenticate with client certificates.
set -o errexit
set -o nounset

. "$(dirname "$0")/lib.sh"

files="${repo}/agent-platform/profiles/kagent/postgres/files"

{
  echo 'BEGIN;'
  cat "${files}/kagent-setup.sql"
  echo
  cat "${files}/substrate-setup.sql"
  echo
  echo 'COMMIT;'
} | k -n kagent exec -i deployment/kagent-postgresql -c postgresql -- \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --quiet --username postgres --dbname kagent \
  --set=kagent_schema=kagent \
  --set=kagent_owner_role=kagent_owner \
  --set=kagent_owner_user=kagent_owner_user \
  --set=kagent_owner_password= \
  --set=kagent_readwrite_role=kagent_readwrite \
  --set=kagent_readwrite_user=kagent_readwrite_user \
  --set=kagent_readwrite_password= \
  --set=substrate_schema=substrate \
  --set=substrate_owner_role=substrate_owner \
  --set=substrate_owner_user=substrate_owner_user \
  --set=substrate_owner_password= \
  --set=substrate_readwrite_role=substrate_readwrite \
  --set=substrate_readwrite_user=substrate_readwrite_user \
  --set=substrate_readwrite_password=

echo "postgres: roles, logins and schemas are in place"

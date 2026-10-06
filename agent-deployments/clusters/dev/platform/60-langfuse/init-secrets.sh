#!/bin/sh
# Creates the credentials Langfuse needs, in the cluster and nowhere else.
# Runs before the chart is installed (helmfile presync hook) and as
# `task langfuse:secrets`. Safe to re-run: a Secret that exists is never
# regenerated, so the project keys and the login do not rotate.
#
#   langfuse/langfuse-init         headless initialisation: organisation,
#                                  project, project keys, admin user
#   langfuse/langfuse-clickhouse   password of the ClickHouse user
#   telemetry/langfuse-ingest      key `authorization`: the header value the
#                                  OTel Collector sends, `Basic <base64 pk:sk>`
#
# langfuse-ingest is rebuilt from langfuse-init on every run, so it follows the
# keys and is restored if the namespace `telemetry` was recreated.
#
# The names below are not secret. They are written into langfuse-init with the
# generated values so that one Secret is the whole of the initialisation.
set -o errexit
set -o nounset

org_id="agentgateway-demo"
org_name="Agentgateway demo"
project_id="agentgateway-demo"
project_name="agentgateway-demo"
user_email="demo-admin@example.com"
user_name="Demo Admin"

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "${here}/../../../../.." && pwd)"
# Always the repo-local kubeconfig and our context, whatever the caller exported.
kubeconfig="${root}/local/kind/kubeconfig"
context="kind-agentgateway-demo"
k() { kubectl --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }

command -v openssl >/dev/null || { echo "init-secrets: openssl is required" >&2; exit 1; }

ensure_namespace() {
  k get namespace "$1" >/dev/null 2>&1 || k create namespace "$1" >/dev/null
}

exists() { k -n "$1" get secret "$2" >/dev/null 2>&1; }

# 32 hex characters in the 8-4-4-4-12 grouping Langfuse uses for its own keys.
uuid() {
  openssl rand -hex 16 | sed -E 's/^(.{8})(.{4})(.{4})(.{4})(.{12})$/\1-\2-\3-\4-\5/'
}

ensure_namespace langfuse

if exists langfuse langfuse-init; then
  echo "init-secrets: langfuse/langfuse-init exists, keys and login kept"
else
  # A letter, a digit and a symbol, so that it passes Langfuse's password rule.
  k -n langfuse create secret generic langfuse-init \
    --from-literal=LANGFUSE_INIT_ORG_ID="${org_id}" \
    --from-literal=LANGFUSE_INIT_ORG_NAME="${org_name}" \
    --from-literal=LANGFUSE_INIT_PROJECT_ID="${project_id}" \
    --from-literal=LANGFUSE_INIT_PROJECT_NAME="${project_name}" \
    --from-literal=LANGFUSE_INIT_PROJECT_PUBLIC_KEY="pk-lf-$(uuid)" \
    --from-literal=LANGFUSE_INIT_PROJECT_SECRET_KEY="sk-lf-$(uuid)" \
    --from-literal=LANGFUSE_INIT_USER_EMAIL="${user_email}" \
    --from-literal=LANGFUSE_INIT_USER_NAME="${user_name}" \
    --from-literal=LANGFUSE_INIT_USER_PASSWORD="Lf1-$(openssl rand -hex 8)" >/dev/null
  echo "init-secrets: langfuse/langfuse-init created"
fi

if exists langfuse langfuse-clickhouse; then
  echo "init-secrets: langfuse/langfuse-clickhouse exists, kept"
else
  k -n langfuse create secret generic langfuse-clickhouse \
    --from-literal=password="$(openssl rand -hex 24)" >/dev/null
  echo "init-secrets: langfuse/langfuse-clickhouse created"
fi

field() {
  k -n langfuse get secret langfuse-init -o "jsonpath={.data.$1}" | base64 -d
}
public_key="$(field LANGFUSE_INIT_PROJECT_PUBLIC_KEY)"
secret_key="$(field LANGFUSE_INIT_PROJECT_SECRET_KEY)"
basic="$(printf '%s:%s' "${public_key}" "${secret_key}" | base64 | tr -d '\n')"

# The telemetry stack belongs to another directory. Only this one Secret is
# written there; the namespace is created only if it does not exist yet, so
# that the Secret can be in place before the collector starts.
ensure_namespace telemetry
k -n telemetry create secret generic langfuse-ingest \
  --from-literal=authorization="Basic ${basic}" \
  --dry-run=client -o yaml | k apply -f - >/dev/null
echo "init-secrets: telemetry/langfuse-ingest in step with the project keys"

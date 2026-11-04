#!/bin/sh
# Creates or updates Secret `grafana-oidc` in namespace `telemetry`: what
# Grafana needs to sign people in with Keycloak, client `grafana`.
#
# The client secret is a demo-only value. It is read from the Keycloak realm
# file, which is the only place it is written down, and goes to the cluster
# without passing through a tracked file or a command line.
#
# Run by the release `kube-prometheus-stack` before each sync.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"
realm_file="${repo}/local/identity/keycloak/files/demo-realm.json"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

client="grafana"
namespace="telemetry"
name="grafana-oidc"

jq -er --arg c "${client}" '.clients[] | select(.clientId == $c) | .secret' "${realm_file}" >/dev/null || {
  echo "grafana-secret: client ${client} has no secret in ${realm_file}" >&2
  exit 1
}

# Whoever comes first creates the namespace; it may exist already.
k get namespace "${namespace}" >/dev/null 2>&1 || k create namespace "${namespace}"

jq -jr --arg c "${client}" '.clients[] | select(.clientId == $c) | .secret' "${realm_file}" |
  k -n "${namespace}" create secret generic "${name}" \
    --from-file=client-secret=/dev/stdin \
    --dry-run=client --output yaml |
  k apply --filename -

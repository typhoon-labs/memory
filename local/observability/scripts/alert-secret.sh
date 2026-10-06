#!/bin/sh
# Creates or updates Secret `alert-automation-oauth` in namespace `telemetry`:
# the credentials Alertmanager uses to get a token for the machine client
# `alert-automation`.
#
# The client secret is a demo-only value. It is read from the Keycloak realm
# file, which is the only place it is written down, and goes to the cluster
# without passing through a tracked file or a command line.
#
# Run by the release `observability-content` before each sync, and by
# `task observability:alert-secret`.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"
realm_file="${repo}/local/identity/keycloak/files/demo-realm.json"
# Always the repo-local kubeconfig and our context, whatever the caller exported.
k() { kubectl --kubeconfig "${repo}/local/kind/kubeconfig" --context kind-agentgateway-demo "$@"; }

client="alert-automation"
namespace="telemetry"
name="alert-automation-oauth"

jq -er --arg c "${client}" '.clients[] | select(.clientId == $c) | .secret' "${realm_file}" >/dev/null || {
  echo "alert-secret: client ${client} has no secret in ${realm_file}" >&2
  exit 1
}

# Whoever comes first creates the namespace; it may exist already.
k get namespace "${namespace}" >/dev/null 2>&1 || k create namespace "${namespace}"

jq -jr --arg c "${client}" '.clients[] | select(.clientId == $c) | .secret' "${realm_file}" |
  k -n "${namespace}" create secret generic "${name}" \
    --from-literal=client-id="${client}" \
    --from-file=client-secret=/dev/stdin \
    --dry-run=client --output yaml |
  k apply --filename -

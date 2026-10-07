#!/bin/sh
# Creates or updates Secret `observability-mcp-credentials` in namespace
# `tools`, for the Grafana MCP server (workloads/observability-mcp):
#
#   grafana-token   a token of the Grafana service account `observability-mcp`,
#                   role Viewer: what the server reads Grafana with
#   Authorization   a random token the server requires from its caller. The
#                   gateway sends it, so the server cannot be used around the
#                   gateway.
#
# Neither value is written to a file in this repository. Safe to re-run: a
# token that still works is kept. Grafana keeps the service account in its
# database; if that is lost, the next run creates both again.
#
# Run by the release `observability-mcp` before each sync, and by
# `task observability:mcp-credential`.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

grafana_url="${GRAFANA_URL:-http://localhost:18084}"
account="observability-mcp"
namespace="tools"
secret="observability-mcp-credentials"

field() { k -n "${namespace}" get secret "${secret}" --output "jsonpath={.data.$1}" 2>/dev/null | base64 -d 2>/dev/null || true; }

admin_password="$(k -n telemetry get secret kube-prometheus-stack-grafana --output 'jsonpath={.data.admin-password}' | base64 -d)"
# The admin login goes to curl through a config on stdin, not the command line.
grafana() {
  method="$1"; path="$2"; shift 2
  printf 'user = "admin:%s"\n' "${admin_password}" |
    curl --config - --silent --show-error --fail-with-body --max-time 20 \
      --request "${method}" --header 'content-type: application/json' "$@" "${grafana_url}${path}"
}

k get namespace "${namespace}" >/dev/null 2>&1 || k create namespace "${namespace}"

grafana_token="$(field grafana-token)"
if [ -n "${grafana_token}" ]; then
  code="$(printf 'header = "Authorization: Bearer %s"\n' "${grafana_token}" |
    curl --config - --silent --output /dev/null --max-time 20 --write-out '%{http_code}' "${grafana_url}/api/search?limit=1")"
  [ "${code}" = "200" ] || grafana_token=""
fi

if [ -z "${grafana_token}" ]; then
  id="$(grafana GET "/api/serviceaccounts/search?query=${account}" | jq -r --arg n "${account}" '.serviceAccounts[] | select(.name == $n) | .id')"
  if [ -z "${id}" ]; then
    id="$(grafana POST /api/serviceaccounts --data "{\"name\":\"${account}\",\"role\":\"Viewer\"}" | jq -r '.id')"
    echo "grafana-mcp-credential: created Grafana service account ${account} (Viewer)"
  fi
  # One token at a time: remove what an earlier run left.
  for token_id in $(grafana GET "/api/serviceaccounts/${id}/tokens" | jq -r '.[].id'); do
    grafana DELETE "/api/serviceaccounts/${id}/tokens/${token_id}" >/dev/null
  done
  grafana_token="$(grafana POST "/api/serviceaccounts/${id}/tokens" --data "{\"name\":\"${account}\"}" | jq -r '.key')"
  [ -n "${grafana_token}" ] && [ "${grafana_token}" != "null" ] || { echo "grafana-mcp-credential: Grafana returned no token" >&2; exit 1; }
  echo "grafana-mcp-credential: created a token for ${account}"
fi

server_token="$(field Authorization)"
[ -n "${server_token}" ] || server_token="$(head -c 32 /dev/urandom | base64 | tr -d '=+/\n')"

# kubectl reads each value from a file; the directory is private and removed.
umask 077
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
printf '%s' "${grafana_token}" > "${work}/grafana-token"
printf '%s' "${server_token}" > "${work}/Authorization"
k -n "${namespace}" create secret generic "${secret}" \
  --from-file="grafana-token=${work}/grafana-token" \
  --from-file="Authorization=${work}/Authorization" \
  --dry-run=client --output yaml |
  k apply --filename -

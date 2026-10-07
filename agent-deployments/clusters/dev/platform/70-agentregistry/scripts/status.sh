#!/bin/sh
# Read-only summary for `task registry:status`: pods, memory per pod, the
# addresses, and what the catalog holds. Never fails the task.
#
# The cluster has no metrics-server, so memory comes from the kubelet's
# summary API (working set).
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../../../../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

node="agentgateway-demo-control-plane"
namespace="agentregistry"
ui_url="http://localhost:18086"

echo "== Release"
helm --kubeconfig "${kubeconfig}" --kube-context "${context}" -n "${namespace}" list --no-headers 2>/dev/null |
  awk '{ printf "  %-14s %-10s %s (app %s)\n", $1, $8, $9, $10 }'

echo "== Pods"
k -n "${namespace}" get pods --no-headers 2>/dev/null |
  awk '{ printf "  %-44s %-6s %-10s restarts %s\n", $1, $2, $3, $4 }'

echo "== Memory per pod (working set)"
k get --raw "/api/v1/nodes/${node}/proxy/stats/summary" 2>/dev/null |
  jq -r --arg ns "${namespace}" '
    [.pods[] | select(.podRef.namespace == $ns) | {name: .podRef.name, bytes: (.memory.workingSetBytes // 0)}]
    | sort_by(-.bytes)
    | (.[] | "  \(.name)\t\(.bytes / 1048576 | round) MiB"),
      "  total\t\(map(.bytes) | add // 0 | . / 1048576 | round) MiB"' |
  awk -F '\t' '{ printf "%-46s %s\n", $1, $2 }'

echo "== Kubernetes rights of the registry (catalog only: both must be no)"
for what in "create deployments.apps" "create agents.kagent.dev"; do
  # shellcheck disable=SC2086
  answer="$(k auth can-i ${what} --all-namespaces --as "system:serviceaccount:${namespace}:agentregistry" 2>/dev/null)"
  printf '  %-28s %s\n' "${what}" "${answer:-unknown}"
done

probe() {
  code="$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "$2" 2>/dev/null)"
  printf '  %-10s %-52s HTTP %s\n' "$1" "$2" "${code}"
}
echo "== Endpoints"
probe "UI" "${ui_url}/"
probe "API" "${ui_url}/v0/version"

echo "== Addresses"
echo "  UI and API, from the host   ${ui_url}   (API reference: ${ui_url}/docs)"
echo "  API, in the cluster         http://agentregistry.agentregistry.svc.cluster.local:12121"

echo "== Catalog"
if [ -x "${repo}/.tools/bin/arctl" ]; then
  "${repo}/.tools/bin/arctl" --registry-url "${ui_url}" get all 2>&1 | sed 's/^/  /'
else
  echo "  arctl is not installed. Run: task registry:arctl"
fi

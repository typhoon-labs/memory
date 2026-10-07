#!/bin/sh
# Read-only summary for `task status`. Never fails the task: a missing cluster
# is a state to report, not an error.
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

cluster="agentgateway-demo"
node="${cluster}-control-plane"
registry="agentgateway-demo-registry"
registry_port="5002"
gateway_url="${GATEWAY_URL:-http://localhost:18080}"
keycloak_url="${KEYCLOAK_URL:-http://localhost:18081}"

echo "== Containers"
docker ps -a --filter "name=^${node}$" --filter "name=^${registry}$" \
  --format '  {{.Names}}\t{{.Status}}\t{{.Ports}}' | sed 's/, /\n\t\t\t/g'

if ! docker inspect "${node}" >/dev/null 2>&1; then
  echo "  cluster ${cluster} does not exist. Run: task up:trunk"
  exit 0
fi

echo "== Node memory (limit: $(docker inspect -f '{{.HostConfig.Memory}}' "${node}" | awk '{ if ($1 == 0) printf "none"; else printf "%.0f GiB", $1 / 1073741824 }'))"
docker stats --no-stream --format '  {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}' "${node}"

echo "== Kubernetes ($(k version -o json 2>/dev/null | jq -r '.serverVersion.gitVersion // "unreachable"'))"
k get pods -A --no-headers 2>/dev/null |
  awk '$1 !~ /^(kube-system|local-path-storage)$/ { printf "  %-22s %-48s %-6s %s\n", $1, $2, $3, $4 }'

echo "== Helm releases"
helm --kubeconfig "${kubeconfig}" --kube-context "${context}" list -A --no-headers 2>/dev/null | awk '{ printf "  %-22s %-22s %-10s %s\n", $2, $1, $8, $9 }'

echo "== Gateway routes"
k get httproute -A --no-headers 2>/dev/null | awk '{ printf "  %-22s %s\n", $1, $2 }'

probe() {
  code="$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "$2" 2>/dev/null)"
  printf '  %-12s %-62s HTTP %s\n' "$1" "$2" "${code}"
}
echo "== Endpoints"
probe "Keycloak" "${keycloak_url}/realms/demo/.well-known/openid-configuration"
probe "Gateway" "${gateway_url}/v1/models"
echo "               (401 from the gateway is the healthy answer without a token)"
# The endpoint on this machine is the provider unless `task model` switched it.
if [ "$(model_provider)" = "bedrock" ]; then
  printf '  %-12s %s\n' "Model host" "Amazon Bedrock, with the credentials in the cluster: task model"
else
  probe "Model host" "http://localhost:7070/v1/models"
fi
probe "Registry" "http://localhost:${registry_port}/v2/"
echo "  Every web UI, its address and whether it answers: task ui"

echo "== In-cluster addresses"
echo "  Gateway    http://agentgateway-proxy.agentgateway-system.svc.cluster.local"
echo "  Keycloak   http://keycloak.keycloak.svc.cluster.local:8080"
echo "  Registry   localhost:${registry_port} in image names; ${registry}:5000 from inside a pod"

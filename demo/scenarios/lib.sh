# Shared by the scenario scripts. Sourced, not run.
#
# Always the repo-local kubeconfig and our context, whatever the caller
# exported: with any other kubeconfig the context does not exist and the
# command fails before it changes anything.
repo="$(cd "$(dirname "$0")/../.." && pwd)"
kubeconfig="${repo}/local/kind/kubeconfig"
context="kind-agentgateway-demo"
k() { kubectl --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }
h() { helm --kubeconfig "${kubeconfig}" --kube-context "${context}" "$@"; }

web_url="${WEB_URL:-http://localhost:18082}"
gateway_url="${GATEWAY_URL:-http://localhost:18080}"
search_url="${web_url}/api/search?q=red"

# The Sample App's Helm release, and the registry as this machine sees it.
release="sample-app"
namespace="sample-app"
chart_ref="oci://localhost:5002/charts/sample-app"

search_status() {
  curl --silent --output /dev/null --max-time 3 --write-out '%{http_code}' "${search_url}" 2>/dev/null || true
}

# The search-service version the release selects now.
selected_version() {
  h get values "${release}" --namespace "${namespace}" --all --output json | jq -r '.searchService.image.tag'
}

# wait_for_search <status> <seconds>: until the search answers <status>.
wait_for_search() {
  wanted="$1"; limit="$2"; waited=0
  while [ "$(search_status)" != "${wanted}" ]; do
    waited=$((waited + 1))
    if [ "${waited}" -gt "${limit}" ]; then
      echo "the search at ${search_url} did not answer ${wanted} within ${limit}s (last: $(search_status))" >&2
      return 1
    fi
    sleep 1
  done
}

# How many search alerts Alertmanager holds as firing. Empty when there is no
# Alertmanager to ask (the observability stack is not installed).
firing_search_alerts() {
  k --namespace telemetry exec alertmanager-kube-prometheus-stack-alertmanager-0 --container alertmanager -- \
    wget -qO- 'http://localhost:9093/api/v2/alerts?active=true' 2>/dev/null |
    jq -r '[.[] | select(.labels.alertname == "SearchErrorRatioHigh")] | length' 2>/dev/null || true
}

# One delivery-mcp tool call through the gateway: mcp_call <token> <tool> <arguments as JSON>.
# Prints the tool's object (structuredContent), or nothing.
mcp_call() {
  curl --silent --max-time 30 -X POST "${gateway_url}/mcp/delivery" \
    -H "authorization: Bearer $1" \
    -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
    -d "$(jq -n --arg tool "$2" --argjson arguments "$3" '{jsonrpc: "2.0", id: 1, method: "tools/call", params: {name: $tool, arguments: $arguments}}')" |
    sed -n 's/^data: //p' | jq -c '.result.structuredContent // empty' 2>/dev/null || true
}

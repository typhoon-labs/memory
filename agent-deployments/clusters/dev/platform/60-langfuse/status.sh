#!/bin/sh
# Read-only summary for `task langfuse:status`: pods, memory per pod, the
# addresses and the Secrets. Never fails the task: a missing release is a
# state to report, not an error.
#
# The cluster has no metrics-server, so memory comes from the kubelet's
# summary API: the working set, the figure the kubelet itself acts on.
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "${here}/../../../../.." && pwd)"
# Always the repo-local kubeconfig and our context, whatever the caller exported.
kubeconfig="${root}/local/kind/kubeconfig"
context="kind-agentgateway-demo"
k() { kubectl --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }

node="agentgateway-demo-control-plane"
namespace="langfuse"
ui_url="http://localhost:18085"

echo "== Release"
helm --kubeconfig "${kubeconfig}" --kube-context "${context}" -n "${namespace}" list --no-headers 2>/dev/null |
  awk '{ printf "  %-12s %-10s %s (app %s)\n", $1, $8, $9, $10 }'

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

echo "== Node memory"
docker stats --no-stream --format '  {{.Name}}  {{.MemUsage}}  {{.MemPerc}}' "${node}" 2>/dev/null

probe() {
  code="$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "$2" 2>/dev/null)"
  printf '  %-10s %-52s HTTP %s\n' "$1" "$2" "${code}"
}
echo "== Endpoints"
probe "UI" "${ui_url}"
probe "Health" "${ui_url}/api/public/health"

echo "== Addresses"
echo "  UI, from the host        ${ui_url}   (login: task langfuse:login)"
echo "  OTLP, in the cluster     http://langfuse-web.langfuse.svc.cluster.local:3000/api/public/otel"
echo "                           HTTP only; an exporter adds /v1/traces"
echo "  Headers                  Authorization: the value in telemetry/langfuse-ingest"
echo "                           x-langfuse-ingestion-version: 4 (asked for by Langfuse's docs)"

echo "== Secrets"
for item in "langfuse/langfuse-init" "langfuse/langfuse-clickhouse" "telemetry/langfuse-ingest"; do
  if k -n "${item%%/*}" get secret "${item##*/}" >/dev/null 2>&1; then state="present"; else state="MISSING"; fi
  printf '  %-30s %s\n' "${item}" "${state}"
done

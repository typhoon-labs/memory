#!/bin/sh
# Read-only summary for `task observability:status`. Never fails the task: a
# part that is missing is a state to report, not an error.
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"
# Always the repo-local kubeconfig and our context, whatever the caller exported.
k() { kubectl --kubeconfig "${repo}/local/kind/kubeconfig" --context kind-agentgateway-demo "$@"; }

grafana_url="${GRAFANA_URL:-http://localhost:18084}"
gateway_url="${GATEWAY_URL:-http://localhost:18080}"
namespace="telemetry"

if ! k get namespace "${namespace}" >/dev/null 2>&1; then
  echo "Namespace ${namespace} does not exist. Run: task observability:install"
  exit 0
fi

admin_password="$(k -n "${namespace}" get secret kube-prometheus-stack-grafana --output 'jsonpath={.data.admin-password}' 2>/dev/null | base64 -d 2>/dev/null)"
# The admin login goes to curl through a config on stdin, not the command line.
grafana() {
  path="$1"; shift
  printf 'user = "admin:%s"\n' "${admin_password}" |
    curl --config - --silent --max-time 10 "$@" "${grafana_url}${path}" 2>/dev/null
}
prometheus() { grafana "/api/datasources/proxy/uid/prometheus/api/v1/$1" --get --data-urlencode "query=${2:-}"; }
value() { prometheus query "$1" | jq -r '.data.result[0].value[1] // "none"' 2>/dev/null; }

echo "== Pods"
k -n "${namespace}" get pods --no-headers 2>/dev/null | awk '{ printf "  %-22s %-52s %-6s %s\n", "telemetry", $1, $2, $3 }'
k -n tools get pods --no-headers --selector app.kubernetes.io/name=observability-mcp 2>/dev/null | awk '{ printf "  %-22s %-52s %-6s %s\n", "tools", $1, $2, $3 }'

echo "== Grafana ${grafana_url}"
printf '  %-24s %s\n' "health" "$(curl --silent --max-time 5 "${grafana_url}/api/health" 2>/dev/null | jq -r '"database \(.database), version \(.version)"' 2>/dev/null || echo unreachable)"
for uid in prometheus loki; do
  printf '  %-24s %s\n' "data source ${uid}" "$(grafana "/api/datasources/uid/${uid}/health" | jq -r '.status // "no answer"' 2>/dev/null)"
done
# Tempo has no health check behind this API; a search that answers is the check.
printf '  %-24s %s\n' "data source tempo" "$(grafana '/api/datasources/proxy/uid/tempo/api/search?limit=1' | jq -r 'if .traces then "OK" else "no answer" end' 2>/dev/null)"
printf '  %-24s %s\n' "dashboards" "$(grafana '/api/search?type=dash-db' | jq -r '[.[].title] | sort | join(", ")' 2>/dev/null)"

echo "== Prometheus targets"
prometheus query 'up' | jq -r '.data.result[] | "  \(if .value[1] == "1" then "up  " else "DOWN" end)  \(.metric.namespace)/\(.metric.job)  \(.metric.pod // .metric.instance)"' 2>/dev/null | sort
[ "$(value 'count(up{namespace="sample-app"})')" = "none" ] &&
  echo "  none in sample-app: the Sample App is not deployed, or its Services lack the labels in local/observability/values.yaml"

echo "== Alert"
grafana "/api/datasources/proxy/uid/prometheus/api/v1/rules" |
  jq -r '.data.groups[]? | . as $g | .rules[] | select(.type == "alerting") | "  \(.name): \(.state), health \(.health), evaluated every \($g.interval)s, held for \(.duration)s"' 2>/dev/null
# Alertmanager is asked directly; Prometheus does not scrape it.
alertmanager() { k -n "${namespace}" exec alertmanager-kube-prometheus-stack-alertmanager-0 --container alertmanager -- wget -qO- "http://localhost:9093$1" 2>/dev/null; }
metrics="$(alertmanager /metrics)"
sent="$(printf '%s\n' "${metrics}" | awk '/^alertmanager_notifications_total\{integration="webhook"/ { n += $2 } END { print n + 0 }')"
failed="$(printf '%s\n' "${metrics}" | awk '/^alertmanager_notifications_failed_total\{integration="webhook"/ { n += $2 } END { print n + 0 }')"
printf '  %-24s %s\n' "webhook" "$(k -n "${namespace}" get alertmanagerconfig alert-automation --output 'jsonpath={.spec.receivers[0].webhookConfigs[0].url}' 2>/dev/null)"
printf '  %-24s %s sent, %s failed (since Alertmanager started)\n' "notifications" "${sent}" "${failed}"
printf '  %-24s %s\n' "active silences" "$(alertmanager /api/v2/silences | jq -r '[.[] | select(.status.state == "active")] | length' 2>/dev/null || echo unknown)"

echo "== Collector"
printf '  %-24s %s\n' "OTLP over gRPC" "otel-collector.telemetry.svc.cluster.local:4317"
printf '  %-24s %s\n' "OTLP over HTTP" "http://otel-collector.telemetry.svc.cluster.local:4318"
if k -n "${namespace}" get configmap otel-collector --output 'jsonpath={.data.relay}' 2>/dev/null | grep -q 'otlphttp/langfuse'; then
  langfuse="on"
else
  langfuse="off (settings.yaml langfuse.enabled, and Secret ${namespace}/langfuse-ingest must exist; then task observability:install)"
fi
printf '  %-24s %s\n' "Langfuse pipeline" "${langfuse}"
printf '  %-24s %s\n' "spans sent, last 5 min" "$(prometheus query 'sum by (exporter) (increase(otelcol_exporter_sent_spans_total[5m]))' | jq -r '[.data.result[] | "\(.metric.exporter) \(.value[1] | tonumber | round)"] | join(", ")' 2>/dev/null)"
printf '  %-24s %s\n' "lost, last 5 min" "$(value 'round(sum(increase(otelcol_receiver_refused_spans_total[5m])) + sum(increase(otelcol_receiver_refused_log_records_total[5m])) + sum(increase(otelcol_exporter_send_failed_spans_total[5m])) + sum(increase(otelcol_exporter_send_failed_log_records_total[5m])))')"

echo "== observability-mcp"
printf '  %-24s %s\n' "with a Keycloak token" "http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/observability   (from the host: ${gateway_url}/mcp/observability)"
printf '  %-24s %s\n' "with a workload key" "http://agentgateway-proxy.agentgateway-system.svc/workloads/<workload>/mcp/observability"
code="$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' -X POST -H 'content-type: application/json' -d '{}' "${gateway_url}/mcp/observability" 2>/dev/null)"
printf '  %-24s HTTP %s  (401 is the healthy answer)\n' "without a token" "${code}"

echo "== Memory"
printf '  %-24s %s MiB\n' "namespace telemetry" "$(value 'round(sum(container_memory_working_set_bytes{namespace="telemetry", image=""}) / 1048576)')"
printf '  %-24s %s MiB\n' "observability-mcp" "$(value 'round(sum(container_memory_working_set_bytes{namespace="tools", pod=~"observability-mcp-.*", image=""}) / 1048576)')"
printf '  %-24s %s\n' "node" "$(docker stats --no-stream --format '{{.MemUsage}}' agentgateway-demo-control-plane 2>/dev/null || echo unknown)"

#!/bin/sh
# Backup drill: the telemetry collector is down, and the work goes on.
#
# Every component and the gateway send their traces to one OpenTelemetry
# Collector, and none of them waits for it. The drill scales the collector to
# zero, uses the Sample App's search, makes one call through the gateway, and
# puts the collector back.
#
# What is lost is the traces and the gateway's log records of that minute.
# Metrics are not: Prometheus scrapes them itself, so the search alert, which
# starts the incident, does not depend on the collector either.
set -o nounset
. "$(dirname "$0")/lib.sh"

search_url="${WEB_URL:-http://localhost:18082}/api/search?q=red"
collector_ready() { [ "$(k --namespace telemetry get deployment otel-collector --output jsonpath='{.status.readyReplicas}')" = "${down_replicas}" ]; }

showing "the telemetry collector is scaled to zero; the Sample App's search and a call through the gateway go on working; then it is put back."

if take_down telemetry otel-collector && within 30 no_pods; then
  line down "deployment otel-collector scaled to 0" "no collector pod is running"
else
  unexpected "the collector's pods are still there"
fi

answer="$(curl --silent --max-time 10 --write-out '\n%{http_code} %{time_total}' "${search_url}")"
status="$(printf '%s' "${answer}" | tail -n 1 | cut -d' ' -f1)"
took="$(printf '%s' "${answer}" | tail -n 1 | cut -d' ' -f2 | awk '{ printf "%.0f ms", $1 * 1000 }')"
count="$(printf '%s' "${answer}" | sed '$d' | jq -r '.count // empty' 2>/dev/null)"
if [ "${status}" = "200" ] && [ -n "${count}" ]; then
  line works "Sample App: ${search_url}" "HTTP 200, ${count} results, in ${took}"
else
  unexpected "the search answered HTTP ${status} while the collector was down. If it is 500, search-service is the broken release: task demo:reset"
fi

answer="$(mcp "${gateway_url}/mcp/delivery" developer list)"
tools="$(printf '%s' "${answer}" | jq -r '(.tools // []) | join(", ")')"
if [ -n "${tools}" ]; then
  line works "developer: tools/list at ${gateway_url}/mcp/delivery" "${tools}"
else
  unexpected "tools/list through the gateway failed while the collector was down: ${answer}"
fi

if put_back && within 30 collector_ready; then
  line restored "deployment otel-collector back at ${down_replicas} replica(s)" "the collector is ready and receiving again"
else
  unexpected "the collector did not come back. Run: task observability:status"
fi

result "with the collector down, the Sample App and the gateway answered as before; only that minute's traces are missing."

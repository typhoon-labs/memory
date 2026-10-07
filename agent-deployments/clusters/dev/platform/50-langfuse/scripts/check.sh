#!/bin/sh
# End-to-end check of trace ingestion, for `task langfuse:check`.
#
#   1. From a short-lived pod in the cluster, post one small trace as OTLP over
#      HTTP to the address the collector uses, with the header from the Secret
#      telemetry/langfuse-ingest.
#   2. From the same pod, post it again with made-up keys: it must be refused.
#   3. From the host, read the trace back through Langfuse's public API, then
#      ask Langfuse to delete it, so that the check leaves the project as it
#      found it. Langfuse deletes in the background, within a few minutes.
#
# The header reaches the pod on standard input, so it is in no pod spec and no
# process list. The pod runs in the namespace `langfuse` and removes itself.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../../../../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

otlp_url="http://langfuse-web.langfuse.svc.cluster.local:3000/api/public/otel/v1/traces"
api_url="http://localhost:18085"
image="curlimages/curl:8.22.0"

field() { k -n langfuse get secret langfuse-init -o "jsonpath={.data.$1}" | base64 -d; }
authorization="$(k -n telemetry get secret langfuse-ingest -o 'jsonpath={.data.authorization}' | base64 -d)"
public_key="$(field LANGFUSE_INIT_PROJECT_PUBLIC_KEY)"
secret_key="$(field LANGFUSE_INIT_PROJECT_SECRET_KEY)"

trace_id="$(openssl rand -hex 16)"
span_id="$(openssl rand -hex 8)"
now="$(date +%s)"
body="$(jq -cn --arg trace "${trace_id}" --arg span "${span_id}" \
  --arg start "$((now - 1))000000000" --arg end "${now}000000000" '
  {resourceSpans: [{
    resource: {attributes: [
      {key: "service.name", value: {stringValue: "langfuse-check"}},
      {key: "deployment.environment", value: {stringValue: "dev"}}]},
    scopeSpans: [{
      scope: {name: "langfuse-check"},
      spans: [{
        traceId: $trace, spanId: $span, name: "langfuse-check", kind: 1,
        startTimeUnixNano: $start, endTimeUnixNano: $end,
        attributes: [{key: "langfuse.user.id", value: {stringValue: "langfuse-check"}}]}]}]}]}')"

# Runs in the pod. Reads the header, then the body, one line each.
in_pod='
IFS= read -r authorization
IFS= read -r body
post() {
  curl --silent --output /dev/null --max-time 20 --write-out "%{http_code}" \
    --request POST "$OTLP_URL" \
    --header "Content-Type: application/json" \
    --header "x-langfuse-ingestion-version: 4" \
    --header "Authorization: $1" --data "$body"
}
echo "sent=$(post "$authorization")"
echo "refused=$(post "Basic $(printf "pk-lf-wrong:sk-lf-wrong" | base64)")"
'

echo "Posting trace ${trace_id} from inside the cluster to"
echo "  ${otlp_url}"
result="$(printf '%s\n%s\n' "${authorization}" "${body}" |
  k -n langfuse run "langfuse-check-${span_id}" --rm --stdin --quiet --restart=Never \
    --image="${image}" --env="OTLP_URL=${otlp_url}" --command -- sh -c "${in_pod}")"
sent="$(printf '%s\n' "${result}" | sed -n 's/^sent=//p')"
refused="$(printf '%s\n' "${result}" | sed -n 's/^refused=//p')"

failed=0
verdict() {
  if [ "$2" = "$3" ]; then printf '  ok    %-44s HTTP %s\n' "$1" "$2"
  else printf '  FAIL  %-44s HTTP %s, expected %s\n' "$1" "${2:-none}" "$3"; failed=1; fi
}
verdict "trace accepted with the generated keys" "${sent}" "200"
verdict "trace refused with wrong keys" "${refused}" "401"

# Ingestion is asynchronous: web stores the event, the worker writes it to
# ClickHouse. Langfuse 4 answers the older /api/public/traces with 404
# ("events_only mode"); observations are read through /api/public/v2.
found=0
elapsed=0
while [ "${elapsed}" -lt 90 ]; do
  curl --silent --output /tmp/langfuse-check.$$ --max-time 10 \
    --user "${public_key}:${secret_key}" \
    "${api_url}/api/public/v2/observations?traceId=${trace_id}" || true
  found="$(jq -r '.data | length' /tmp/langfuse-check.$$ 2>/dev/null || echo 0)"
  [ "${found:-0}" -ge 1 ] && break
  sleep 3
  elapsed=$((elapsed + 3))
done
if [ "${found:-0}" -ge 1 ]; then
  printf '  ok    %-44s after %ss\n' "trace read back through the API" "${elapsed}"
  jq -r '.data[0] | "        span \(.name), user \(.userId), environment \(.environment)"' /tmp/langfuse-check.$$
  echo "        ${api_url}/project/$(field LANGFUSE_INIT_PROJECT_ID)/traces/${trace_id}"
else
  printf '  FAIL  %-44s not found after %ss\n' "trace read back through the API" "${elapsed}"
  failed=1
fi
rm -f /tmp/langfuse-check.$$

code="$(curl --silent --output /dev/null --max-time 10 --write-out '%{http_code}' --request DELETE \
  --user "${public_key}:${secret_key}" "${api_url}/api/public/traces/${trace_id}" || true)"
if [ "${code}" = "200" ]; then
  echo "  The test trace is queued for deletion."
else
  echo "  The test trace was not removed (HTTP ${code:-none}); it stays in the project."
fi

exit "${failed}"

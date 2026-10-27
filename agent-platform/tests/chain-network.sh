#!/bin/sh
# Denied path: a workload outside the agents and the tool servers calls
# chain-sts, the token exchange.
#
#   direct     from a web pod of the Sample App, which no rule limits on its
#              way out, to chain-sts's Service and to one of its pods: no
#              connection (chain-sts's own NetworkPolicy lets in namespaces
#              agents, tools and agentgateway-system only). The same pod
#              reaches a Service of its own namespace, so the probe works.
#   governed   from remediation-agent's pod (`agents`), chain-sts's metadata;
#              from delivery-mcp's pod (`tools`), its keys at /jwks. Both
#              namespaces may go out to it only because of the `delegation`
#              exception in their boundaries (80-policies).
#
# Connections and two reads; nothing is exchanged and nothing changes.
set -o nounset
. "$(dirname "$0")/lib.sh"

sts_host="chain-sts.chain-sts.svc.cluster.local"

showing "a pod of the Sample App calls chain-sts; then a pod in agents and one in tools do."

answer="$(from_outside_pod "${sts_host}" 80)"
if [ "$(printf '%s' "${answer}" | jq -r '.connected')" = "false" ]; then
  line direct "pod web in namespace ${outside_namespace} -> ${sts_host}:80" "no connection ($(printf '%s' "${answer}" | jq -r '.error'))"
else
  unexpected "a pod in namespace ${outside_namespace} connected to chain-sts: ${answer}. Is its NetworkPolicy applied (task sts:status)?"
fi
pod_ip="$(k --namespace chain-sts get pod --selector app.kubernetes.io/name=chain-sts,app.kubernetes.io/instance=chain-sts --output jsonpath='{.items[0].status.podIP}')"
answer="$(from_outside_pod "${pod_ip}" 8080)"
if [ -n "${pod_ip}" ] && [ "$(printf '%s' "${answer}" | jq -r '.connected')" = "false" ]; then
  line direct "the same pod -> a chain-sts pod, ${pod_ip}:8080" "no connection ($(printf '%s' "${answer}" | jq -r '.error'))"
else
  unexpected "a pod in namespace ${outside_namespace} connected to chain-sts's pod at ${pod_ip:-no address}:8080: ${answer}"
fi
answer="$(from_outside_pod "search-service.${outside_namespace}.svc.cluster.local" 8080)"
if [ "$(printf '%s' "${answer}" | jq -r '.connected')" = "true" ]; then
  line works "the same pod -> search-service.${outside_namespace}.svc.cluster.local:8080" "connected: the pod can open connections"
else
  unexpected "the probe pod connects to nothing, so the two refusals above show nothing: ${answer}"
fi

answer="$(in_pod get "http://${sts_host}/.well-known/oauth-authorization-server" </dev/null)"
issuer="$(printf '%s' "${answer}" | jq -r '.body | fromjson? | .issuer // empty')"
if [ "$(printf '%s' "${answer}" | jq -r '.status')" = "200" ] && [ -n "${issuer}" ]; then
  line governed "pod remediation-agent in namespace agents -> http://${sts_host}/.well-known/oauth-authorization-server" "HTTP 200, issuer ${issuer}"
else
  unexpected "remediation-agent's pod could not read chain-sts's metadata: $(printf '%s' "${answer}" | jq -c '{connected, status, error}')"
fi

answer="$(probe_namespace=tools probe_workload=deployment/delivery-mcp in_pod get "http://${sts_host}/jwks" </dev/null)"
kids="$(printf '%s' "${answer}" | jq -r '.body | fromjson? | [.keys[].kid] | length')"
if [ "$(printf '%s' "${answer}" | jq -r '.status')" = "200" ] && [ "${kids:-0}" -ge 1 ]; then
  line governed "pod delivery-mcp in namespace tools -> http://${sts_host}/jwks" "HTTP 200, ${kids} key(s)"
else
  unexpected "delivery-mcp's pod could not read chain-sts's keys: $(printf '%s' "${answer}" | jq -c '{connected, status, error}')"
fi

result "chain-sts takes no connection from the Sample App; the agents and the tool servers reach it."

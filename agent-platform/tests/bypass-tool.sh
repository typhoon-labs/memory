#!/bin/sh
# Denied path: an agent's pod calls a tool server directly, around the gateway.
#
#   direct     from a pod in `agents` to delivery-mcp's Service: no connection
#   direct     from a pod of another namespace, which no rule limits on its way
#              out: no connection either
#   governed   the first request again, from the same pod, with the same token,
#              to the gateway's route /mcp/delivery: answered
#
# Two rules refuse the first attempt, and either would do: the agents may call
# nothing but the gateway (`only-to-the-platform` in namespace `agents`), and
# the tool servers take calls from nothing but the gateway
# (`only-from-the-gateway` in namespace `tools`). The second attempt is there
# to show the latter by itself.
#
# The first and the last are a real MCP `tools/list` as `developer`, sent from
# inside remediation-agent's own pod, the agent that does call delivery-mcp.
# The second only opens a connection. Nothing is changed.
set -o nounset
. "$(dirname "$0")/lib.sh"

direct_url="http://delivery-mcp.tools.svc.cluster.local:8080/mcp"
governed_url="${gateway_in_cluster}/mcp/delivery"
request='{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

showing "a pod in namespace agents, and one in another namespace, call delivery-mcp directly; then the same call through the gateway."

bearer="$(token developer)" || { unexpected "no token for developer from ${PLATFORM_TOKEN_CMD}"; result ""; }

answer="$(printf '%s' "${bearer}" | in_pod post "${direct_url}" "${request}" bearer)"
if [ "$(printf '%s' "${answer}" | jq -r '.connected')" = "false" ]; then
  line direct "pod remediation-agent in namespace agents -> ${direct_url}" "no connection ($(printf '%s' "${answer}" | jq -r '.error | sub("^[A-Za-z]+: "; "")'))"
else
  unexpected "the direct call was answered with HTTP $(printf '%s' "${answer}" | jq -r '.status'): nothing stops a pod from going around the gateway. Is release tools-network-boundary applied?"
fi

answer="$(from_outside_pod delivery-mcp.tools.svc.cluster.local 8080)"
if [ "$(printf '%s' "${answer}" | jq -r '.connected')" = "false" ]; then
  line direct "pod web in namespace ${outside_namespace} -> delivery-mcp.tools.svc.cluster.local:8080" "no connection ($(printf '%s' "${answer}" | jq -r '.error'))"
else
  unexpected "a pod in namespace ${outside_namespace} connected to delivery-mcp directly: the tool server takes calls from more than the gateway. Is release tools-network-boundary applied?"
fi

answer="$(printf '%s' "${bearer}" | in_pod post "${governed_url}" "${request}" bearer)"
tools="$(printf '%s' "${answer}" | jq -r '.body' | sed -n 's/^data: //p' | jq -r '[.result.tools[].name] | sort | join(", ")' 2>/dev/null)"
if [ "$(printf '%s' "${answer}" | jq -r '.status')" = "200" ] && [ -n "${tools}" ]; then
  line governed "pod remediation-agent again -> ${governed_url}" "HTTP 200, developer's tools: ${tools}"
else
  unexpected "through the gateway the call did not work: $(printf '%s' "${answer}" | jq -c '{connected, status, error, body: .body[0:160]}')"
fi

result "blocked directly, answered through the gateway."

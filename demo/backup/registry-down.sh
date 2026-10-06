#!/bin/sh
# Backup drill: Agentregistry is down, and nothing in the request path notices.
#
# The registry is a catalog: it says what exists and who owns it. No agent,
# tool or gateway route asks it anything while serving a request. The drill
# scales its server to zero, lists tools as a signed-in user, makes one agent
# call, and puts the server back. The catalog's entries are in the registry's
# own database, which keeps running.
#
# The agent call asks remediation-agent to apply a change that does not exist.
# The agent calls delivery-mcp as the caller, through the gateway, and passes
# on its answer, so the whole chain is exercised and nothing changes.
set -o nounset
. "$(dirname "$0")/lib.sh"

registry_url="${REGISTRY_UI_URL:-http://localhost:18086}"
probe() { curl --silent --output /dev/null --max-time 4 --write-out '%{http_code}' "$1" 2>/dev/null; }
answers() { [ "$(probe "${registry_url}/v0/version")" = "200" ]; }
entries() { curl --silent --max-time 5 "${registry_url}/v0/agents" 2>/dev/null | jq -r '[.. | objects | select(has("metadata") and (.metadata | type == "object") and (.metadata | has("name"))) | .metadata.name] | unique | length' 2>/dev/null; }

showing "Agentregistry is scaled to zero; a signed-in tool list and an agent call go on working; then it is put back."

before="$(entries)"
# The server's pod takes its full 30 seconds to stop. It is out of its Service
# at once, which is what counts here: nothing can ask the registry anything.
unanswered() { ! answers; }
if take_down agentregistry agentregistry && within 20 unanswered; then
  line down "deployment agentregistry scaled to 0" "${registry_url} does not answer"
else
  unexpected "Agentregistry still answers at ${registry_url}"
fi

answer="$(mcp "${gateway_url}/mcp/delivery" developer list)"
tools="$(printf '%s' "${answer}" | jq -r '(.tools // []) | join(", ")')"
if [ -n "${tools}" ]; then
  line works "developer: tools/list at ${gateway_url}/mcp/delivery" "${tools}"
else
  unexpected "tools/list through the gateway failed while the registry was down: ${answer}"
fi

answer="$(a2a_send /a2a/remediation-agent platform-engineer '{"action": "apply_and_verify", "change_id": "CHG-0000"}')"
said="$(printf '%s' "${answer}" | jq -r '.result.artifacts[0].parts[] | select(.kind == "text") | .text' 2>/dev/null)"
layer="$(printf '%s' "${answer}" | jq -r '.result.artifacts[0].parts[] | select(.kind == "data") | .data.refusal.layer // empty' 2>/dev/null)"
if [ -n "${said}" ] && [ "${layer}" = "service" ]; then
  line works "platform-engineer: remediation-agent, asked to apply a change that does not exist" "the agent answered with delivery-mcp's reply: ${said}"
else
  unexpected "remediation-agent did not answer through the gateway while the registry was down: $(printf '%s' "${answer}" | head -c 300)"
fi

# Its pod is ready a moment before its address answers from this machine.
if put_back && within 30 answers; then
  after="$(entries)"
  if [ "${after}" = "${before}" ]; then
    line restored "deployment agentregistry back at ${down_replicas} replica(s)" "${registry_url} answers again, with the same ${after} agent entries"
  else
    unexpected "Agentregistry is back but lists ${after} agent entries, not ${before} as before"
  fi
else
  unexpected "Agentregistry did not come back. Run: task registry:status"
fi

result "with the catalog down, tools and agents answered as before; the catalog is back."

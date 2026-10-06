#!/bin/sh
# Backup drill: `developer` calls `apply_change`, and the gateway does not
# offer it.
#
# Applying a change is for `platform-engineer`
# (agent-deployments/clusters/dev/domains/operations/delivery-mcp.yaml). The
# gateway leaves the tool out of what it lists for a developer and answers a
# call to it as it answers a call to a tool that does not exist. The call
# never reaches delivery-mcp, which would refuse it as well.
#
# Reads only: the change id is made up and nothing is applied.
set -o nounset
. "$(dirname "$0")/lib.sh"

url="${gateway_url}/mcp/delivery"

showing "developer asks the gateway for delivery-mcp's tools, then calls apply_change anyway."

answer="$(mcp "${url}" developer list)"
tools="$(printf '%s' "${answer}" | jq -r '(.tools // []) | join(", ")')"
if [ -n "${tools}" ] && ! printf '%s' "${answer}" | jq -e '.tools | index("apply_change")' >/dev/null; then
  line offered "developer: tools/list at ${url}" "${tools}"
else
  unexpected "developer's tools/list is not as expected: ${answer}"
fi

answer="$(mcp "${url}" developer call apply_change '{"change_id": "CHG-0000"}')"
if [ "$(printf '%s' "${answer}" | jq -r '.http')" = "400" ] && [ "$(printf '%s' "${answer}" | jq -r '.error.message')" = "Unknown tool: apply_change" ]; then
  line refused "developer: tools/call apply_change" "HTTP 400 from the gateway: $(printf '%s' "${answer}" | jq -r '.error.message')"
else
  unexpected "developer's call to apply_change was not refused by the gateway: ${answer}"
fi

answer="$(mcp "${url}" platform-engineer list)"
if printf '%s' "${answer}" | jq -e '.tools | index("apply_change")' >/dev/null 2>&1; then
  line offered "platform-engineer: tools/list at the same address" "$(printf '%s' "${answer}" | jq -r '.tools | join(", ")')"
else
  unexpected "platform-engineer is not offered apply_change: ${answer}"
fi

result "the gateway does not offer apply_change to developer and refuses the call; platform-engineer is offered it."

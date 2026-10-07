#!/bin/sh
# Drill for the run of show: `platform-engineer` calls `apply_change` on a
# change that is proposed but not yet approved, and delivery-mcp refuses.
#
# The incident card shows the same refusal: a platform-engineer may press
# Apply on a proposed change, and the card says "Refused by the service: this
# change has not been approved yet". This drill is the fallback if the card
# stalls, and it makes the call without the card: the gateway offers
# apply_change to a platform-engineer and lets the call through, and
# delivery-mcp's own rule `change_is_approved` says no.
#
# Needs an open incident with a proposed change, so it belongs between the
# developer's proposal and the incident manager's approval. Without one it
# says so and exits 3.
#
# Reads only: the call is refused, and the change is read back to show that
# it did not move.
set -o nounset
. "$(dirname "$0")/lib.sh"

url="${gateway_url}/mcp/delivery"

# The first change that is still `proposed`, in an incident that is not resolved.
change_id=""
for incident_id in $(mcp "${url}" platform-engineer call list_incidents '{}' |
  jq -r '.result.incidents[]? | select(.status != "resolved") | .incident_id'); do
  change_id="$(mcp "${url}" platform-engineer call get_incident "$(jq -cn --arg id "${incident_id}" '{incident_id: $id}')" |
    jq -r '[.result.changes[]? | select(.status == "proposed") | .change_id][0] // empty')"
  [ -n "${change_id}" ] && break
done
if [ -z "${change_id}" ]; then
  echo "Nothing to show yet: no incident has a change that is proposed and not approved."
  echo "Run this after the developer has pressed Propose and before the incident manager approves."
  exit 3
fi

showing "platform-engineer calls apply_change on ${change_id} (${incident_id}) before an incident manager has approved it."

answer="$(mcp "${url}" platform-engineer list)"
if printf '%s' "${answer}" | jq -e '.tools | index("apply_change")' >/dev/null 2>&1; then
  line offered "platform-engineer: tools/list at ${url}" "$(printf '%s' "${answer}" | jq -r '.tools | join(", ")')"
else
  unexpected "platform-engineer is not offered apply_change by the gateway: ${answer}"
fi

answer="$(mcp "${url}" platform-engineer call apply_change "$(jq -cn --arg id "${change_id}" '{change_id: $id}')")"
if [ "$(printf '%s' "${answer}" | jq -r '.isError')" = "true" ] &&
  [ "$(printf '%s' "${answer}" | jq -r '.result.layer')" = "service" ] &&
  [ "$(printf '%s' "${answer}" | jq -r '.result.rule')" = "change_is_approved" ]; then
  line refused "platform-engineer: tools/call apply_change ${change_id}" \
    "HTTP $(printf '%s' "${answer}" | jq -r '.http') from the gateway, then delivery-mcp, rule change_is_approved: $(printf '%s' "${answer}" | jq -r '.result.message')"
else
  unexpected "apply_change on ${change_id} was not refused by rule change_is_approved: ${answer}"
fi

status="$(mcp "${url}" platform-engineer call get_incident "$(jq -cn --arg id "${incident_id}" '{incident_id: $id}')" |
  jq -r --arg id "${change_id}" '.result.changes[]? | select(.change_id == $id) | .status')"
if [ "${status}" = "proposed" ]; then
  line unchanged "${change_id} read back" "status ${status}; nothing was applied"
else
  unexpected "${change_id} is now '${status:-unknown}', not proposed"
fi

result "the gateway lets a platform-engineer call apply_change; delivery-mcp refuses it until the change is approved."

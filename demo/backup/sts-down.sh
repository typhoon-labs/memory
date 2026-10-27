#!/bin/sh
# Backup drill: chain-sts, the token exchange, is down, and the agents fail
# closed.
#
# Every call an agent makes goes out with a token chain-sts issued, never with
# the caller's own. With chain-sts at zero replicas, each agent asked to do
# something stops before it calls anything:
#
#   chat-assistant     the card's sync answers, saying chain-sts failed; the
#                      alert hook answers 502
#   remediation-agent  an apply ends failed
#   comms-agent        a draft ends failed
#
# and none of those requests reaches delivery-mcp (its audit lines). Then
# chain-sts goes back to the replica count its release sets (two in the dev
# cluster), and the same calls work again. It is put back also when the drill
# is interrupted.
#
# Each call is made with a token just issued by Keycloak, so that no agent
# holds an exchanged token for it from before. A Chat UI that is open keeps
# working for up to five minutes on the token chat-assistant exchanged for it
# before the outage (a chain token is a bearer token until it expires); its
# calls are counted apart. Nothing is changed: the apply is of a change that
# does not exist, the draft is for an incident that does not exist, and the
# alert cannot open an incident while chain-sts is down. The sync and the
# hook's alert come from developer-other-team and alert-automation, so their
# lines at delivery-mcp can be told apart.
set -o nounset
. "$(dirname "$0")/lib.sh"

sts_url="http://chain-sts.chain-sts.svc.cluster.local"
sync='{"jsonrpc":"2.0","id":"sts-down","method":"SendMessage","params":{"message":{"messageId":"sts-down","role":"ROLE_USER","parts":[{"data":{"request":"sync"},"mediaType":"application/vnd.chat-assistant.sync+json"}]}}}'
alert='{"version":"4","status":"firing","alerts":[{"status":"firing","labels":{"alertname":"SearchErrorRatioHigh","service":"search-service","severity":"critical"},"annotations":{"summary":"backup drill: chain-sts is down"}}]}'

# chat_sync <identity>: the card's sync, as the Chat UI asks it every two
# seconds. Prints "<status> <what chat-assistant says about chain-sts, if anything>".
chat_sync() {
  sync_out="$(printf 'Authorization: Bearer %s\n' "$(token "$1")" |
    curl --silent --max-time 60 -H @- -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
      -H 'A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v0.9.1' --write-out '\n%{http_code}' \
      -d "${sync}" "${gateway_url}/a2a/chat-assistant")"
  printf '%s %s\n' "$(printf '%s' "${sync_out}" | tail -n 1)" \
    "$(printf '%s' "${sync_out}" | sed '$d' | jq -r '[.. | strings | select(test("chain-sts"))] | first // ""' 2>/dev/null | head -c 160)"
}
# hook <identity>: the alert hook with one firing alert. Prints "<status> <first result's outcome and message>".
hook() {
  hook_out="$(printf 'Authorization: Bearer %s\n' "$(token "$1")" |
    curl --silent --max-time 60 -H @- -H 'content-type: application/json' --write-out '\n%{http_code}' \
      -d "${alert}" "${gateway_url}/hooks/alert")"
  printf '%s %s\n' "$(printf '%s' "${hook_out}" | tail -n 1)" \
    "$(printf '%s' "${hook_out}" | sed '$d' | jq -r '.results[0] | "\(.outcome): \(.message)"' 2>/dev/null | head -c 160)"
}
# agent_task <route> <identity> <request>: an agent's task, as "<state> <its words>".
agent_task() {
  a2a_send "$1" "$2" "$3" | jq -r '"\(.result.status.state // .error.message // "no answer") \([.result.artifacts[0].parts[]? | select(.kind == "text") | .text][0] // .result.status.message.parts[0].text // "" | .[0:160])"'
}
# delivery_lines <since, as 2026-01-01 00:00:00>: delivery-mcp's audit lines from then on.
delivery_lines() {
  k --namespace tools logs deployment/delivery-mcp --since=10m 2>/dev/null |
    awk -v since="$1" 'index($0, " delivery.audit ") && substr($0, 1, 19) >= since { sub(/^.* delivery\.audit /, ""); print }'
}
sts_answers() { [ "$(in_pod get "${sts_url}/.well-known/oauth-authorization-server" </dev/null | jq -r '.status')" = "200" ]; }
sts_silent() { ! sts_answers; }

showing "chain-sts is scaled to zero; chat-assistant, remediation-agent and comms-agent are asked to act and stop before calling anything; then chain-sts is put back and they work."

replicas="$(h get values chain-sts --namespace chain-sts --all --output json | jq -r '.replicas // 1')"
if take_down chain-sts chain-sts && within 15 sts_silent; then
  # Back to the release's count, whatever the Deployment said when it was found.
  down_replicas="${replicas}"
  since="$(date -u '+%Y-%m-%d %H:%M:%S')"
  line down "deployment chain-sts scaled to 0" "its metadata does not answer from remediation-agent's pod"
else
  unexpected "chain-sts still answers after being scaled to zero"
  result ""
fi

answer="$(chat_sync developer-other-team)"
case "${answer}" in
  "200 "*chain-sts*) line closed "developer-other-team: the card's sync at /a2a/chat-assistant" "HTTP ${answer}" ;;
  *) unexpected "chat-assistant's sync did not say chain-sts failed: ${answer}" ;;
esac
answer="$(hook alert-automation)"
case "${answer}" in
  "502 failed: "*chain-sts*) line closed "alert-automation: a firing alert at /hooks/alert" "HTTP ${answer}" ;;
  *) unexpected "the alert hook did not fail closed: ${answer}" ;;
esac
answer="$(agent_task /a2a/remediation-agent platform-engineer '{"action": "apply_and_verify", "change_id": "CHG-0000"}')"
case "${answer}" in
  failed*) line closed "platform-engineer: remediation-agent, apply CHG-0000" "${answer}" ;;
  *) unexpected "remediation-agent did not fail: ${answer}" ;;
esac
answer="$(agent_task /a2a/comms-agent incident-manager '{"action": "draft_status_update", "incident_id": "INC-0000"}')"
case "${answer}" in
  failed*) line closed "incident-manager: comms-agent, draft for INC-0000" "${answer}" ;;
  *) unexpected "comms-agent did not fail: ${answer}" ;;
esac

lines="$(delivery_lines "${since}")"
ours="$(printf '%s\n' "${lines}" | jq -c 'select(.user == "developer-other-team" or .user == "service-account-alert-automation" or .target == "CHG-0000" or .target == "INC-0000" or .tool == "open_incident")' 2>/dev/null)"
others="$(printf '%s\n' "${lines}" | jq -c 'select(.)' 2>/dev/null | grep -c . )"
if [ -z "${ours}" ]; then
  line nothing "delivery-mcp's audit lines since ${since} UTC" "none of the four calls reached it$([ "${others}" -gt 0 ] && printf ' (%s line(s) of other callers, such as an open Chat UI on a token exchanged before the outage)' "${others}")"
else
  unexpected "delivery-mcp has lines from the calls above: ${ours}"
fi

if put_back && within 30 sts_answers; then
  line restored "deployment chain-sts back at ${replicas} replica(s)" "$(k --namespace chain-sts get deployment chain-sts --output jsonpath='{.status.readyReplicas}') ready; its metadata answers"
else
  unexpected "chain-sts did not come back. Run: task sts:install"
  result ""
fi

answer="$(chat_sync developer-other-team)"
case "${answer}" in
  "200 ") line works "developer-other-team: the card's sync again" "HTTP 200, and nothing about chain-sts" ;;
  *) unexpected "chat-assistant's sync after chain-sts is back: ${answer}" ;;
esac
answer="$(a2a_send /a2a/remediation-agent platform-engineer '{"action": "apply_and_verify", "change_id": "CHG-0000"}')"
said="$(printf '%s' "${answer}" | jq -r '.result.artifacts[0].parts[] | select(.kind == "text") | .text' 2>/dev/null)"
layer="$(printf '%s' "${answer}" | jq -r '.result.artifacts[0].parts[] | select(.kind == "data") | .data.refusal.layer // empty' 2>/dev/null)"
if [ "${layer}" = "service" ]; then
  line works "platform-engineer: remediation-agent, apply CHG-0000 again" "it reached delivery-mcp, which answered: ${said}"
else
  unexpected "remediation-agent did not reach delivery-mcp after chain-sts is back: $(printf '%s' "${answer}" | head -c 300)"
fi
# The audit lines read above are the ones this call has now added to: the
# "none" earlier was read from the right place.
applied="$(delivery_lines "${since}" | jq -c 'select(.target == "CHG-0000")' 2>/dev/null | tail -n 1)"
if [ -n "${applied}" ]; then
  line works "delivery-mcp's audit lines again" "$(printf '%s' "${applied}" | jq -r '"\(.tool) \(.target) \(.outcome), user \(.user), chain \(.chain | join(", "))"')"
else
  unexpected "delivery-mcp's audit lines show no line for the call that reached it, so the \"none\" above shows nothing"
fi

result "with chain-sts down every agent stopped before calling out and nothing reached delivery-mcp; it is back at ${replicas} replicas and the agents work."

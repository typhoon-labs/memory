#!/bin/sh
# Denied path: a token chain-sts issued, presented where the gateway does not
# expect it; and a user's token from the Chat UI, or a forged one, presented
# where it does not belong.
#
#   replayed   a token whose newest actor is the wrong agent: chat-assistant's
#              at apply_change on /mcp/delivery (the gateway does not offer the
#              tool), comms-agent's and remediation-agent's own at
#              /a2a/remediation-agent (403). Next to each, the token of the
#              agent the route expects, let in.
#              (route-auth `actors`, mcp-route `toolActors`)
#   act        a token with `act` at the routes that take none:
#              /a2a/chat-assistant, and the alert hook at /hooks/alert and at
#              /a2a/chat-assistant/hooks/alert (403). Next to each, the same
#              caller's own token, without `act`, let in.
#   audience   platform-engineer's Chat UI sign-in (audience chat-assistant) at
#              /a2a/remediation-agent, /mcp/delivery and the model route (401).
#              Next to it, the same token let in at /a2a/chat-assistant, and
#              the same user's `task token` token at the three routes.
#   forged     the claims of a token chain-sts issued, signed with a key it
#              does not publish, once naming the key that signs and once a key
#              nobody has (401). Next to it, the real token, let in.
#
# Tokens are exchanged at chain-sts from inside remediation-agent's pod, with
# actor tokens from `kubectl create token`, as the agents themselves would;
# requests go to the gateway from this machine. The calls read, except
# apply_change on a change that does not exist, which delivery-mcp refuses.
# Nothing is changed. No token is printed: what is shown of one is its chain.
set -o nounset
. "$(dirname "$0")/lib.sh"

card() { printf '/a2a/%s/.well-known/agent-card.json' "$1"; }
quiet_alert='{"version":"4","status":"resolved","alerts":[]}'
not_allowed="403 authorization failed"
wrong_audience="401 authentication failure: the token is invalid or malformed: Error(InvalidAudience)"
# status_is <answer of gw> <expected status and start of body>
status_is() { case "$1" in "$2"*) return 0 ;; *) return 1 ;; esac; }
# mcp_as <token> <list | call TOOL ARGS>: mcp.py with a token this script holds.
mcp_as() { mcp_token="$1"; shift; printf '%s' "${mcp_token}" | mcp "${gateway_url}/mcp/delivery" @- "$@"; }

showing "tokens chain-sts issued, replayed where the gateway expects another agent or none; a Chat UI sign-in and a forged token where they do not belong."

pe="$(token platform-engineer)" && dev="$(token developer)" && alert="$(token alert-automation)" ||
  { unexpected "no token from ${PLATFORM_TOKEN_CMD}"; result ""; }
pe_ui="$(token platform-engineer --chat-ui)" || { unexpected "no Chat UI sign-in for platform-engineer from ${PLATFORM_TOKEN_CMD}"; result ""; }

pe_chat="$(exchange_for "${pe}" chat-assistant)"
pe_rem="$(exchange_for "${pe_chat}" remediation-agent)"
pe_comms="$(exchange_for "${pe_chat}" comms-agent)"
dev_chat="$(exchange_for "${dev}" chat-assistant)"
alert_chat="$(exchange_for "${alert}" chat-assistant)"
if [ -n "${pe_chat}" ] && [ -n "${pe_rem}" ] && [ -n "${pe_comms}" ] && [ -n "${dev_chat}" ] && [ -n "${alert_chat}" ]; then
  line tokens "exchanged at chain-sts" "platform-engineer [$(chain "${pe_chat}")], [$(chain "${pe_rem}")], [$(chain "${pe_comms}")]; developer [$(chain "${dev_chat}")]; alert-automation [$(chain "${alert_chat}")]"
else
  unexpected "an exchange at chain-sts failed, so nothing can be shown; chain-gateway needs chain-sts (task sts:status, and chain-exchange.sh for its rules)"
  result ""
fi

# --- replayed: the newest actor is the wrong agent ---------------------------

answer="$(mcp_as "${pe_rem}" list)"
if printf '%s' "${answer}" | jq -e '.tools | index("apply_change")' >/dev/null 2>&1; then
  line allowed "[remediation-agent, chat-assistant]: tools/list at /mcp/delivery" "$(printf '%s' "${answer}" | jq -r '.tools | join(", ")')"
else
  unexpected "remediation-agent's token is not offered apply_change: ${answer}"
fi
answer="$(mcp_as "${pe_rem}" call apply_change '{"change_id": "CHG-0000"}')"
if [ "$(printf '%s' "${answer}" | jq -r '"\(.http) \(.result.error) \(.result.layer)"')" = "200 not_found service" ]; then
  line allowed "[remediation-agent, chat-assistant]: apply_change CHG-0000" "reached delivery-mcp, which answered: $(printf '%s' "${answer}" | jq -r '.result.message')"
else
  unexpected "remediation-agent's apply_change did not reach delivery-mcp: ${answer}"
fi

answer="$(mcp_as "${pe_chat}" list)"
if [ "$(printf '%s' "${answer}" | jq -r '.http')" = "200" ] && ! printf '%s' "${answer}" | jq -e '.tools | index("apply_change")' >/dev/null; then
  line refused "[chat-assistant], replayed: tools/list at /mcp/delivery" "no apply_change: $(printf '%s' "${answer}" | jq -r '.tools | join(", ")')"
else
  unexpected "chat-assistant's token is offered apply_change, or no list: ${answer}"
fi
answer="$(mcp_as "${pe_chat}" call apply_change '{"change_id": "CHG-0000"}')"
if [ "$(printf '%s' "${answer}" | jq -r '"\(.http) \(.error.message)"')" = "400 Unknown tool: apply_change" ]; then
  line refused "[chat-assistant], replayed: apply_change CHG-0000" "HTTP 400 from the gateway: Unknown tool: apply_change"
else
  unexpected "chat-assistant's token at apply_change was not refused by the gateway: ${answer}"
fi

answer="$(gw GET "$(card remediation-agent)" "${pe_chat}")"
if status_is "${answer}" "200 "; then
  line allowed "[chat-assistant]: /a2a/remediation-agent, its agent card" "HTTP 200"
else
  unexpected "chat-assistant's token at /a2a/remediation-agent: ${answer}"
fi
for held in pe_comms pe_rem; do
  eval "held_token=\${${held}}"
  answer="$(gw GET "$(card remediation-agent)" "${held_token}")"
  if status_is "${answer}" "${not_allowed}"; then
    line refused "[$(chain "${held_token}")], replayed: /a2a/remediation-agent" "HTTP ${answer}"
  else
    unexpected "[$(chain "${held_token}")] at /a2a/remediation-agent: ${answer}, not ${not_allowed}"
  fi
done

# --- act: routes that take no acting agent -----------------------------------

answer="$(gw GET "$(card chat-assistant)" "${dev}")"
if status_is "${answer}" "200 "; then
  line allowed "developer's own token: /a2a/chat-assistant, its agent card" "HTTP 200"
else
  unexpected "developer's own token at /a2a/chat-assistant: ${answer}"
fi
answer="$(gw GET "$(card chat-assistant)" "${dev_chat}")"
if status_is "${answer}" "${not_allowed}"; then
  line refused "developer [chat-assistant]: /a2a/chat-assistant" "HTTP ${answer}"
else
  unexpected "a token with act at /a2a/chat-assistant: ${answer}, not ${not_allowed}"
fi
for path in /hooks/alert /a2a/chat-assistant/hooks/alert; do
  answer="$(gw POST "${path}" "${alert}" "${quiet_alert}")"
  if status_is "${answer}" '200 {"results":[]}'; then
    line allowed "alert-automation's own token: ${path}, a resolved alert" "HTTP ${answer}"
  else
    unexpected "alert-automation's own token at ${path}: ${answer}"
  fi
  answer="$(gw POST "${path}" "${alert_chat}" "${quiet_alert}")"
  if status_is "${answer}" "${not_allowed}"; then
    line refused "alert-automation [chat-assistant]: ${path}" "HTTP ${answer}"
  else
    unexpected "a token with act at ${path}: ${answer}, not ${not_allowed}"
  fi
done

# --- audience: the Chat UI's sign-in, past chat-assistant ---------------------

answer="$(gw GET "$(card chat-assistant)" "${pe_ui}")"
if status_is "${answer}" "200 "; then
  line allowed "platform-engineer's Chat UI sign-in (aud $(claims "${pe_ui}" | jq -r '.aud')): /a2a/chat-assistant" "HTTP 200"
else
  unexpected "the Chat UI sign-in at /a2a/chat-assistant: ${answer}"
fi
for path in "$(card remediation-agent)" /mcp/delivery /v1/models; do
  if [ "${path}" = /mcp/delivery ]; then
    ui_answer="$(mcp_as "${pe_ui}" list | jq -r '"\(.http) \(.error.message // .tools)"')"
    own_answer="$(mcp_as "${pe}" list | jq -r '"\(.http) \(.error.message // .tools)"')"
  else
    ui_answer="$(gw GET "${path}" "${pe_ui}")"
    own_answer="$(gw GET "${path}" "${pe}")"
  fi
  if status_is "${ui_answer}" "${wrong_audience}"; then
    line refused "the same sign-in: ${path}" "HTTP ${ui_answer}"
  else
    unexpected "the Chat UI sign-in at ${path}: ${ui_answer}, not ${wrong_audience}"
  fi
  if status_is "${own_answer}" "200 "; then
    line allowed "platform-engineer's \`task token\` token (aud agentgateway): ${path}" "HTTP 200"
  else
    unexpected "platform-engineer's own token at ${path}: ${own_answer}"
  fi
done

# --- forged: chain-sts's claims, another key ----------------------------------

kid="$(header "${pe_rem}" | jq -r '.kid')"
for forged_kid in "${kid}" "forged-$(openssl rand -hex 4)"; do
  forged="$(forge "${pe_rem}" "${forged_kid}")"
  answer="$(mcp_as "${forged}" list | jq -r '"\(.http) \(.error.message // .tools)"')"
  case "${forged_kid}" in
    "${kid}") expected="401 authentication failure: the token is invalid or malformed: Error(InvalidSignature)"; named="the signing key's kid" ;;
    *) expected="401 authentication failure: token uses the unknown key \"${forged_kid}\""; named="a kid nobody publishes" ;;
  esac
  if [ "${answer}" = "${expected}" ]; then
    line refused "[$(chain "${forged}")] forged, header naming ${named}: /mcp/delivery" "HTTP ${answer}"
  else
    unexpected "a forged token at /mcp/delivery: ${answer}, not ${expected}"
  fi
done

result "the gateway lets a chain token in only where its newest actor is expected, takes none where no agent calls, keeps the Chat UI's sign-in at chat-assistant, and refuses a token chain-sts did not sign; each allowed twin went through."

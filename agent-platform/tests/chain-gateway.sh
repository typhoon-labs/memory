#!/bin/sh
# Denied path: a token chain-sts issued, presented where the gateway does not
# expect it; and a user's token from the Chat UI, or a forged one, presented
# where it does not belong.
#
#   target     a token chain-sts issued for one route, presented at another:
#              the [chat-assistant] tokens that remediation-agent and
#              diagnosis-agent are called with, at restart_workload on
#              /mcp/delivery and at the model route (401, the wrong audience).
#              Next to each, chat-assistant's token for that route, let in.
#              (route-auth `resource`, delegation.resources in identity.yaml)
#   replayed   a token for the right route whose newest actor is the wrong
#              agent: chat-assistant's at apply_change on /mcp/delivery (the
#              gateway does not offer the tool), comms-agent's and
#              remediation-agent's own at /a2a/remediation-agent (403). Next
#              to each, the token of the agent the route expects, let in.
#              (route-auth `actors`, mcp-route `toolActors`)
#   act        a token chain-sts issued, at the routes that take none and so
#              do not trust chain-sts: /a2a/chat-assistant, and the alert hook
#              at /hooks/alert and at /a2a/chat-assistant/hooks/alert (401).
#              Next to each, the same caller's own token, without `act`, let
#              in.
#   audience   platform-engineer's Chat UI sign-in (audience chat-assistant) at
#              /a2a/remediation-agent, /mcp/delivery and the model route (401).
#              Next to it, the same token let in at /a2a/chat-assistant, and
#              the same user's `task token` token at the three routes.
#   forged     the claims of a token chain-sts issued, signed with a key it
#              does not publish, once naming the key that signs and once a key
#              nobody has (401). Next to it, the real token, let in.
#
# Tokens are exchanged at chain-sts from inside remediation-agent's pod, with
# actor tokens from `kubectl create token`, each for one route as the agents
# themselves ask; requests go to the gateway from this machine. The gateway's
# answer to a refused token says only `authentication failed`, so the
# audiences and the two forged tokens are told apart by the reason in its
# access log (lib.sh `traced`). The calls read, except apply_change on a
# change that does not exist and restart_workload of a service that does not
# exist, which delivery-mcp refuses. Nothing is changed. No token is printed:
# what is shown of one is its chain and the route it is for.
#
# Run it once the rollout of tokens per target has ended, with its last step
# (platform/90-chain-sts/README.md, "Tokens per target"): before that the
# routes also take the shared audience, and the `act` lines see 403.
set -o nounset
. "$(dirname "$0")/lib.sh"

card() { printf '/a2a/%s/.well-known/agent-card.json' "$1"; }
quiet_alert='{"version":"4","status":"resolved","alerts":[]}'
not_allowed="403 authorization failed"
not_signed_in="401 authentication failed"
wrong_audience="authentication failure: the token is invalid or malformed: Error(InvalidAudience)"
# status_is <answer of gw> <expected status and start of body>
status_is() { case "$1" in "$2"*) return 0 ;; *) return 1 ;; esac; }
# mcp_as <token> <list | call TOOL ARGS>: mcp.py with a token this script holds.
mcp_as() { mcp_token="$1"; shift; printf '%s' "${mcp_token}" | mcp "${gateway_url}/mcp/delivery" @- "$@"; }

showing "tokens chain-sts issued, replayed where the gateway expects another agent or none; a Chat UI sign-in and a forged token where they do not belong."

pe="$(token platform-engineer)" && dev="$(token developer)" && alert="$(token alert-automation)" ||
  { unexpected "no token from ${PLATFORM_TOKEN_CMD}"; result ""; }
pe_ui="$(token platform-engineer --chat-ui)" || { unexpected "no Chat UI sign-in for platform-engineer from ${PLATFORM_TOKEN_CMD}"; result ""; }

# Each [chat-assistant] token for one route, as chat-assistant asks for it:
# the ones remediation-agent and diagnosis-agent are called with, and the ones
# chat-assistant itself calls delivery-mcp and the model with.
pe_chat="$(exchange_for "${pe}" "${target_delivery}" chat-assistant)"
pe_chat_model="$(exchange_for "${pe}" "${target_model}" chat-assistant)"
pe_chat_rem="$(exchange_for "${pe}" "$(route_of remediation-agent)" chat-assistant)"
pe_chat_diag="$(exchange_for "${pe}" "$(route_of diagnosis-agent)" chat-assistant)"
# remediation-agent's own, for delivery-mcp as it asks; and comms-agent's and
# remediation-agent's for remediation-agent's route, where neither is expected.
pe_rem="$(exchange_for "${pe}" "${target_delivery}" chat-assistant remediation-agent)"
pe_rem_rem="$(exchange_for "${pe_chat_rem}" "$(route_of remediation-agent)" remediation-agent)"
pe_comms_rem="$(exchange_for "${pe_chat_rem}" "$(route_of remediation-agent)" comms-agent)"
dev_chat="$(exchange_for "${dev}" "${target_delivery}" chat-assistant)"
alert_chat="$(exchange_for "${alert}" "${target_delivery}" chat-assistant)"
all_issued=true
for held in pe_chat pe_chat_model pe_chat_rem pe_chat_diag pe_rem pe_rem_rem pe_comms_rem dev_chat alert_chat; do
  eval "[ -n \"\${${held}}\" ]" || all_issued=false
done
# shown_token <token>: what is shown of it: its chain, and the route it is for.
shown_token() { printf '[%s] for %s' "$(chain "$1")" "$(target_of "$1")"; }
if "${all_issued}"; then
  line tokens "exchanged at chain-sts" "platform-engineer $(shown_token "${pe_chat}"), $(shown_token "${pe_chat_rem}"), $(shown_token "${pe_rem}"), and six more"
else
  unexpected "an exchange at chain-sts failed, so nothing can be shown; chain-gateway needs chain-sts (task sts:status, and chain-exchange.sh for its rules)"
  result ""
fi

# --- target: a token for one route, at another --------------------------------

answer="$(mcp_as "${pe_chat}" list)"
if printf '%s' "${answer}" | jq -e '.tools | index("restart_workload")' >/dev/null 2>&1; then
  line allowed "$(shown_token "${pe_chat}"): tools/list at /mcp/delivery" "$(printf '%s' "${answer}" | jq -r '.tools | join(", ")')"
else
  unexpected "chat-assistant's token for /mcp/delivery is not offered restart_workload: ${answer}"
fi
answer="$(mcp_as "${pe_chat}" call restart_workload '{"service": "no-such-service"}')"
if [ "$(printf '%s' "${answer}" | jq -r '"\(.http) \(.result.error) \(.result.layer)"')" = "200 invalid_argument service" ]; then
  line allowed "$(shown_token "${pe_chat}"): restart_workload no-such-service" "reached delivery-mcp, which answered: $(printf '%s' "${answer}" | jq -r '.result.message')"
else
  unexpected "chat-assistant's restart_workload did not reach delivery-mcp: ${answer}"
fi
answer="$(gw GET /v1/models "${pe_chat_model}")"
if status_is "${answer}" "200 "; then
  line allowed "$(shown_token "${pe_chat_model}"): /v1/models" "HTTP 200"
else
  unexpected "chat-assistant's token for the model route at /v1/models: ${answer}"
fi
for held in pe_chat_rem pe_chat_diag; do
  eval "held_token=\${${held}}"
  traced
  answer="$(mcp_as "${held_token}" call restart_workload '{"service": "no-such-service"}' | jq -r '"\(.http) \(.error.message // .result)"')"
  logged="$(logged_reason)"
  untraced
  if [ "${answer}" = "${not_signed_in}" ] && [ "${logged}" = "${wrong_audience}" ]; then
    line refused "$(shown_token "${held_token}"), replayed: restart_workload at /mcp/delivery" "HTTP ${answer}; the gateway logged: ${logged}"
  else
    unexpected "$(shown_token "${held_token}") at restart_workload: ${answer}, logged: ${logged:-nothing}; not ${not_signed_in}, ${wrong_audience}"
  fi
  traced
  answer="$(gw GET /v1/models "${held_token}")"
  logged="$(logged_reason)"
  untraced
  if status_is "${answer}" "${not_signed_in}" && [ "${logged}" = "${wrong_audience}" ]; then
    line refused "$(shown_token "${held_token}"), replayed: /v1/models" "HTTP ${answer}; the gateway logged: ${logged}"
  else
    unexpected "$(shown_token "${held_token}") at /v1/models: ${answer}, logged: ${logged:-nothing}; not ${not_signed_in}, ${wrong_audience}"
  fi
done

# --- replayed: the right route, the wrong newest actor -----------------------

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
traced
answer="$(mcp_as "${pe_chat}" call apply_change '{"change_id": "CHG-0000"}')"
logged="$(logged_reason)"
untraced
if [ "$(printf '%s' "${answer}" | jq -r '"\(.http) \(.error.message)"')" = "400 unknown resource" ] &&
  [ "${logged}" = "mcp: authorization denied for tool: apply_change" ]; then
  line refused "[chat-assistant], replayed: apply_change CHG-0000" "HTTP 400 from the gateway: unknown resource; it logged: ${logged}"
else
  unexpected "chat-assistant's token at apply_change was not refused by the gateway: ${answer}, logged: ${logged:-nothing}"
fi

answer="$(gw GET "$(card remediation-agent)" "${pe_chat_rem}")"
if status_is "${answer}" "200 "; then
  line allowed "$(shown_token "${pe_chat_rem}"): /a2a/remediation-agent, its agent card" "HTTP 200"
else
  unexpected "chat-assistant's token at /a2a/remediation-agent: ${answer}"
fi
for held in pe_comms_rem pe_rem_rem; do
  eval "held_token=\${${held}}"
  answer="$(gw GET "$(card remediation-agent)" "${held_token}")"
  if status_is "${answer}" "${not_allowed}"; then
    line refused "$(shown_token "${held_token}"), replayed: /a2a/remediation-agent" "HTTP ${answer}"
  else
    unexpected "$(shown_token "${held_token}") at /a2a/remediation-agent: ${answer}, not ${not_allowed}"
  fi
done

# --- act: routes that take no acting agent, and no token chain-sts issued ----

answer="$(gw GET "$(card chat-assistant)" "${dev}")"
if status_is "${answer}" "200 "; then
  line allowed "developer's own token: /a2a/chat-assistant, its agent card" "HTTP 200"
else
  unexpected "developer's own token at /a2a/chat-assistant: ${answer}"
fi
answer="$(gw GET "$(card chat-assistant)" "${dev_chat}")"
if status_is "${answer}" "${not_signed_in}"; then
  line refused "developer $(shown_token "${dev_chat}"): /a2a/chat-assistant" "HTTP ${answer}"
else
  unexpected "a token chain-sts issued at /a2a/chat-assistant: ${answer}, not ${not_signed_in}"
fi
for path in /hooks/alert /a2a/chat-assistant/hooks/alert; do
  answer="$(gw POST "${path}" "${alert}" "${quiet_alert}")"
  if status_is "${answer}" '200 {"results":[]}'; then
    line allowed "alert-automation's own token: ${path}, a resolved alert" "HTTP ${answer}"
  else
    unexpected "alert-automation's own token at ${path}: ${answer}"
  fi
  answer="$(gw POST "${path}" "${alert_chat}" "${quiet_alert}")"
  if status_is "${answer}" "${not_signed_in}"; then
    line refused "alert-automation $(shown_token "${alert_chat}"): ${path}" "HTTP ${answer}"
  else
    unexpected "a token chain-sts issued at ${path}: ${answer}, not ${not_signed_in}"
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
  traced
  if [ "${path}" = /mcp/delivery ]; then
    ui_answer="$(mcp_as "${pe_ui}" list | jq -r '"\(.http) \(.error.message // .tools)"')"
    own_answer="$(mcp_as "${pe}" list | jq -r '"\(.http) \(.error.message // .tools)"')"
  else
    ui_answer="$(gw GET "${path}" "${pe_ui}")"
    own_answer="$(gw GET "${path}" "${pe}")"
  fi
  logged="$(logged_reason)"
  untraced
  if status_is "${ui_answer}" "${not_signed_in}" && [ "${logged}" = "${wrong_audience}" ]; then
    line refused "the same sign-in: ${path}" "HTTP ${ui_answer}; the gateway logged: ${logged}"
  else
    unexpected "the Chat UI sign-in at ${path}: ${ui_answer}, logged: ${logged:-nothing}; not ${not_signed_in}, ${wrong_audience}"
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
  traced
  answer="$(mcp_as "${forged}" list | jq -r '"\(.http) \(.error.message // .tools)"')"
  logged="$(logged_reason)"
  untraced
  case "${forged_kid}" in
    "${kid}") expected="authentication failure: the token is invalid or malformed: Error(InvalidSignature)"; named="the signing key's kid" ;;
    *) expected="authentication failure: token uses the unknown key \"${forged_kid}\""; named="a kid nobody publishes" ;;
  esac
  if [ "${answer}" = "${not_signed_in}" ] && [ "${logged}" = "${expected}" ]; then
    line refused "[$(chain "${forged}")] forged, header naming ${named}: /mcp/delivery" "HTTP ${answer}; the gateway logged: ${logged}"
  else
    unexpected "a forged token at /mcp/delivery: ${answer}, logged: ${logged:-nothing}; not ${not_signed_in}, ${expected}"
  fi
done

result "the gateway lets a chain token in only on the route it was issued for and where its newest actor is expected, takes none where no agent calls, keeps the Chat UI's sign-in at chat-assistant, and refuses a token chain-sts did not sign; each allowed twin went through."

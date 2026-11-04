#!/bin/sh
# One connected trace through an agent on Agent Substrate.
#
# A request with a trace id of its own goes through the gateway to
# diagnosis-agent, which calls a tool and the model, and what Tempo then holds
# under that id is judged by trace_shape.py, which also says why a turn may
# fall short of one piece.
#
# Three real turns: two new conversations, then one that continues the first,
# so that its suspended Actor has to be woken. It needs the model, and about
# two minutes. It works the same whichever provider `task model` has chosen.
# The conversations are deleted at the end, also when it is interrupted.
#
# Exit status is the number of lines marked WRONG.
set -o nounset
. "$(dirname "$0")/lib.sh"

agent="diagnosis-agent"
agent_namespace="kagent"
agent_url="${gateway_url}/a2a/${agent}"
question='Trace check, not an incident. Call query_prometheus once with the query `up{job="search-service"}`, even if you have called it before, and reply with one short sentence.'
tempo="/api/v1/namespaces/telemetry/services/tempo:tempo-prom-metrics/proxy/api/traces"
ate_bin="${tests}/../../.tools/bin/kubectl-ate"
turn_timeout="${TURN_TIMEOUT:-170}"

work="$(mktemp -d)"
conversations=""
cleanup() {
  for conversation in ${conversations}; do
    if [ ! -x "${ate_bin}" ] || ! "${ate_bin}" --kubeconfig "${kubeconfig}" --context "${context}" \
      delete actor "session-${conversation}" --atespace "${agent_namespace}" >/dev/null 2>&1; then
      printf '  %-9s conversation %s not deleted\n' note "${conversation}"
    fi
  done
  rm -rf "${work}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# send <turn directory> <conversation, or empty>: one SendMessage. The token
# goes to curl on standard input. Prints the HTTP status.
send() {
  jq -cn --arg id "$(openssl rand -hex 16)" --arg text "${question}" --arg conversation "$2" \
    '{jsonrpc: "2.0", id: "1", method: "SendMessage",
      params: {message: ({messageId: $id, role: "ROLE_USER", parts: [{text: $text}]}
                         + (if $conversation == "" then {} else {contextId: $conversation} end))}}' \
    > "$1/request.json"
  printf 'Authorization: Bearer %s\n' "${bearer}" |
    curl --silent --max-time "${turn_timeout}" --output "$1/response.json" --write-out '%{http_code}' \
      -H @- -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
      -H "traceparent: ${TRACEPARENT}" -d @"$1/request.json" "${agent_url}"
}

# wait_for_spans <turn directory>: Tempo's answer for the trace id, once the
# number of spans has stood still for 15 seconds. The last spans of a turn take
# that long to come in; 2 minutes at the most.
wait_for_spans() {
  polls=0; still=0; seen=-1
  while [ "${polls}" -lt 24 ] && [ "${still}" -lt 3 ]; do
    sleep 5
    polls=$((polls + 1))
    k get --raw "${tempo}/${trace_id}" > "$1/trace.json" 2>/dev/null || continue
    count="$(grep -o '"spanId"' "$1/trace.json" | wc -l)"
    if [ "${count}" -gt 0 ] && [ "${count}" -eq "${seen}" ]; then still=$((still + 1)); else still=0; fi
    seen="${count}"
  done
}

# turn <number> <conversation, or empty>: one turn into ${work}/turn-<number>.
# kagent can refuse a message for a moment with -32004, so that is asked again.
turn() {
  directory="${work}/turn-$1"
  mkdir "${directory}"
  traced
  printf '%s\n' "${trace_id}" > "${directory}/trace-id"
  send "${directory}" "$2" >/dev/null
  attempts=0
  while [ "${attempts}" -lt 6 ] && jq -e '.error.code == -32004' "${directory}/response.json" >/dev/null 2>&1; do
    sleep 5
    attempts=$((attempts + 1))
    send "${directory}" "$2" >/dev/null
  done
  wait_for_spans "${directory}"
  untraced
  conversation="$(jq -r '.result.task.contextId // empty' "${directory}/response.json" 2>/dev/null)"
  case " ${conversations} " in
    *" ${conversation} "*) ;;
    *) conversations="${conversations} ${conversation}" ;;
  esac
}

showing "one request through the gateway to ${agent}, a tool and the model, as one trace in Tempo (three real turns, about 2 minutes)"

bearer="$(token alert-automation)" || { unexpected "no token from ${PLATFORM_TOKEN_CMD}"; result ""; }

turn 1 ""
first_conversation="${conversation}"
turn 2 ""
turn 3 "${first_conversation}"

python3 "${tests}/trace_shape.py" "${work}"/turn-*
failures=$?
result "the trace ids came through every hop, and a turn came to one connected trace."

#!/bin/sh
# Asks diagnosis-agent one question, the way every caller does: A2A 1.0 over
# JSON-RPC, through the gateway, with a Keycloak token.
#
#   ask.sh "Alert SearchErrorRateHigh is firing for service search-service."
#   ask.sh --as developer "..."        whose token (default: alert-automation)
#   ask.sh --context <id> "..."        continue a conversation (the id is printed)
#   ask.sh --raw "..."                 print the whole JSON-RPC response instead,
#                                      with `seconds` and `http_status` added
#
# Prints the tool calls the agent made, its answer, the JSON block of the
# answer on its own, and how long the turn took.
#
# The request, for callers that do not use an A2A SDK:
#   POST <DIAGNOSIS_AGENT_URL>      Authorization: Bearer <token>
#   {"jsonrpc":"2.0","id":"1","method":"SendMessage","params":{"message":
#     {"messageId":"<uuid>","role":"ROLE_USER","parts":[{"text":"..."}]}}}
# The answer is the text of the last artifact of result.task. Earlier
# artifacts are the agent's tool calls and their results, as data parts.
# kagent 1.0.0-alpha7 answers A2A 1.0 only: the 0.3 method `message/send` is
# refused with -32601.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../.." && pwd)"
url="${DIAGNOSIS_AGENT_URL:-http://localhost:18080/a2a/diagnosis-agent}"

usage='usage: ask.sh [--as <user>] [--context <id>] [--raw] "<question>"'
who="alert-automation"; context=""; raw=""; question=""
while [ $# -gt 0 ]; do
  case "$1" in
    --as) who="${2:?${usage}}"; shift 2 ;;
    --context) context="${2:?${usage}}"; shift 2 ;;
    --raw) raw=1; shift ;;
    *) question="$1"; shift ;;
  esac
done
if [ -z "${question}" ]; then echo "${usage}" >&2; exit 2; fi

token="$("${repo}/local/identity/token.sh" "${who}")"
out="$(mktemp)"
trap 'rm -f "${out}"' EXIT

request="$(jq -cn --arg text "${question}" --arg id "$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)" --arg context "${context}" \
  '{jsonrpc: "2.0", id: "1", method: "SendMessage",
    params: {message: ({messageId: $id, role: "ROLE_USER", parts: [{text: $text}]}
                       + (if $context == "" then {} else {contextId: $context} end))}}')"

send() {
  curl --silent --show-error --max-time "${ASK_TIMEOUT:-180}" --output "${out}" \
    --write-out '%{http_code} %{time_total}' \
    -H "authorization: Bearer ${token}" -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
    -d "${request}" "${url}"
}
status="$(send)"
# kagent can refuse a message for a moment with -32004 ("input was not
# accepted; retry after the session becomes available"). Seen once, right
# after Substrate's egress gateway restarted. It asks for a retry, so retry once.
if [ "$(jq -r '.error.code // empty' "${out}" 2>/dev/null)" = "-32004" ]; then
  sleep 1
  status="$(send)"
fi
code="${status% *}"; seconds="${status#* }"

if [ -n "${raw}" ]; then
  # The response as received, plus how long it took and the HTTP status.
  jq -c --arg seconds "${seconds}" --arg code "${code}" '. + {seconds: ($seconds | tonumber), http_status: ($code | tonumber)}' "${out}" 2>/dev/null \
    || { cat "${out}"; echo; }
  exit 0
fi
if [ "${code}" != "200" ] || ! jq -e '.result.task' "${out}" >/dev/null 2>&1; then
  echo "diagnosis-agent at ${url} answered HTTP ${code} after ${seconds}s:" >&2
  head -c 600 "${out}" >&2; echo >&2
  exit 1
fi

jq -r --arg who "${who}" --arg seconds "${seconds}" '
  .result.task as $t
  | ($t.artifacts // []) as $a
  | ([$a[].parts[] | select(.metadata["kagent.dev/a2a/part-type"] == "function_call") | .data]) as $calls
  | ([$a[] | select(any(.parts[]; has("text")))] | last | [.parts[] | .text // empty] | join("\n")) as $answer
  | ([$a[].metadata["kagent.dev/a2a/usage"] // empty]) as $usage
  | "caller:   \($who)",
    "state:    \($t.status.state)\(if $t.status.message then "  " + ([$t.status.message.parts[]?.text // empty] | join(" ")) else "" end)",
    "context:  \($t.contextId)",
    "seconds:  \($seconds)",
    "model:    \($usage | length) calls, \($usage | map(.promptTokenCount // 0) | add // 0) tokens in, \($usage | map(.candidatesTokenCount // 0) | add // 0) out",
    "tools:    \($calls | length)",
    ($calls[] | "  \(.name) \(.args | tojson)"),
    "answer:",
    ($answer // "(no text)")
' "${out}"

# The JSON block of the answer, as a caller would extract it.
block="$(jq -r '[.result.task.artifacts[]? | select(any(.parts[]; has("text")))] | last | [.parts[] | .text // empty] | join("\n")' "${out}" \
  | sed -n '/^```json/,/^```$/p' | sed '1d;$d')"
echo "json:"
if printf '%s' "${block}" | jq -e 'has("suspected_cause") and (.evidence | type == "array") and has("recommended_version")' >/dev/null 2>&1; then
  printf '%s' "${block}" | jq .
else
  echo "  (the answer has no JSON block with suspected_cause, evidence and recommended_version)"
  [ "$(jq -r '.result.task.status.state' "${out}")" = "TASK_STATE_COMPLETED" ] || exit 1
  exit 3
fi

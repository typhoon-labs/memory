#!/bin/sh
# Denied path: a workload calls the model provider directly, around the gateway.
#
#   direct     from a pod in `agents` to the model endpoint on this machine
#              (host.docker.internal:7070): no connection
#              (NetworkPolicy `only-to-the-platform` in namespace `agents`)
#   governed   the gateway's model route, from the same pod:
#              without a token HTTP 401, with a token a completion
#
# The direct attempt only opens a connection and sends nothing, so that it
# costs no model call even on a cluster where it is not refused. The last step
# is the one real model call: the fast model, 16 tokens at most.
#
# The endpoint on this machine needs no key. That is why the network rule is
# the control here; with a real provider the first control is that only the
# gateway holds the credential.
set -o nounset
. "$(dirname "$0")/lib.sh"

model_host="${MODEL_HOST:-host.docker.internal}"
model_port="${MODEL_PORT:-7070}"
model="${MODEL_ID_FAST:-claude-haiku-4-5-20251001}"
governed_url="${gateway_in_cluster}/v1/messages"
request="$(jq -cn --arg model "${model}" '{model: $model, max_tokens: 16, messages: [{role: "user", content: "Reply with the single word: ok"}]}')"

showing "a pod in namespace agents calls the model endpoint on this machine directly, then the gateway's model route without and with a token."

# The refusal means something only while the endpoint is there to be reached.
up="$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "http://localhost:${model_port}/v1/models" 2>/dev/null)"
if [ "${up}" = "000" ] || [ -z "${up}" ]; then
  unexpected "the model endpoint at http://localhost:${model_port} does not answer this machine either, so nothing can be shown. Start it and run this again."
  result ""
fi

answer="$(in_pod connect "${model_host}" "${model_port}" </dev/null)"
if [ "$(printf '%s' "${answer}" | jq -r '.connected')" = "false" ]; then
  line direct "pod remediation-agent -> ${model_host}:${model_port}" "no connection ($(printf '%s' "${answer}" | jq -r '.error | sub("^[A-Za-z]+: "; "")')); the endpoint is up, it answers this machine with HTTP ${up}"
else
  unexpected "the pod connected to ${model_host}:${model_port}: a workload can call the model without the gateway. Is release agents-network-boundary applied?"
fi

answer="$(in_pod post "${governed_url}" "${request}" </dev/null)"
status="$(printf '%s' "${answer}" | jq -r '.status')"
if [ "${status}" = "401" ]; then
  line governed "the same pod -> ${governed_url}, no token" "HTTP 401: $(printf '%s' "${answer}" | jq -r '.body' | head -c 60)"
else
  unexpected "the model route without a token answered ${status}, not 401: $(printf '%s' "${answer}" | jq -c '{connected, error, body: .body[0:120]}')"
fi

bearer="$(token developer)" || { unexpected "no token for developer from Keycloak"; result ""; }
answer="$(printf '%s' "${bearer}" | in_pod post "${governed_url}" "${request}" bearer patient)"
status="$(printf '%s' "${answer}" | jq -r '.status')"
text="$(printf '%s' "${answer}" | jq -r '.body' | jq -r '.content[0].text // empty' 2>/dev/null | head -c 60)"
if [ "${status}" = "200" ] && [ -n "${text}" ]; then
  line governed "the same pod -> ${governed_url}, developer's token" "HTTP 200, ${model} answered: ${text}"
else
  unexpected "the model route with a token did not return a completion: $(printf '%s' "${answer}" | jq -c '{connected, status, error, body: .body[0:160]}')"
fi

result "blocked directly; through the gateway 401 without a token and a completion with one."

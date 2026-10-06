#!/bin/sh
# Checks the gateway's model route from the host: one request that must
# succeed and three that the gateway must refuse.
#
# Only the first check reaches the model provider: one call to the fast model
# with a tiny prompt and max_tokens 16. Set SMOKE_OPENAI=1 to also send one
# OpenAI-format request (a second small provider call).
#
# Exit status is the number of failed checks.
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
gateway_url="${GATEWAY_URL:-http://localhost:18080}"
keycloak_url="${KEYCLOAK_URL:-http://localhost:18081}"
model="${MODEL_ID_FAST:-claude-haiku-4-5-20251001}"
unapproved_model="${UNAPPROVED_MODEL:-claude-3-opus-20240229}"
out="$(mktemp)"
trap 'rm -f "${out}"' EXIT
failures=0

body() {
  printf '{"model":"%s","max_tokens":16,"messages":[{"role":"user","content":"Reply with the single word: ok"}]}' "$1"
}

# check <description> <expected status> <path> <model> [bearer token]
check() {
  description="$1"; expected="$2"; path="$3"; request_model="$4"; bearer="${5:-}"
  if [ -n "${bearer}" ]; then
    status="$(curl --silent --max-time 60 --output "${out}" --write-out '%{http_code}' \
      -H "authorization: Bearer ${bearer}" -H 'content-type: application/json' \
      -d "$(body "${request_model}")" "${gateway_url}${path}")"
  else
    status="$(curl --silent --max-time 60 --output "${out}" --write-out '%{http_code}' \
      -H 'content-type: application/json' \
      -d "$(body "${request_model}")" "${gateway_url}${path}")"
  fi
  if [ "${status}" = "${expected}" ]; then
    result="ok  "
  else
    result="FAIL"
    failures=$((failures + 1))
  fi
  printf '%s  %-52s expected %s, got %s  %s\n' "${result}" "${description}" "${expected}" "${status}" \
    "$(head -c 90 "${out}" | tr '\n' ' ')"
}

token="$("${here}/../identity/token.sh" developer)" || { echo "FAIL  no token for developer from ${keycloak_url}"; exit 1; }

# A real token for the same user and issuer, issued to Keycloak's built-in
# admin-cli client, which does not carry the audience `agentgateway`.
other_audience_token="$(curl --silent --max-time 15 \
  -d grant_type=password -d client_id=admin-cli -d username=developer -d password=demo \
  "${keycloak_url}/realms/demo/protocol/openid-connect/token" | jq -r '.access_token // empty')"

echo "Model route at ${gateway_url}, model ${model}"
check "developer token, Anthropic /v1/messages"         200 /v1/messages "${model}" "${token}"
if [ "${status}" = "200" ] && [ "$(jq -r '.content[0].text // empty' "${out}" 2>/dev/null)" = "" ]; then
  echo "FAIL  the 200 response carries no completion text"
  failures=$((failures + 1))
fi
if [ "${SMOKE_OPENAI:-0}" = "1" ]; then
  check "developer token, OpenAI /v1/chat/completions"  200 /v1/chat/completions "${model}" "${token}"
fi
check "no token"                                        401 /v1/messages "${model}"
if [ -n "${other_audience_token}" ]; then
  check "token without audience agentgateway"           401 /v1/messages "${model}" "${other_audience_token}"
else
  echo "FAIL  could not get a token from client admin-cli for the audience check"
  failures=$((failures + 1))
fi
check "developer token, unapproved model"               403 /v1/messages "${unapproved_model}" "${token}"

if [ "${failures}" -eq 0 ]; then
  echo "All checks passed."
else
  echo "${failures} check(s) failed."
fi
exit "${failures}"

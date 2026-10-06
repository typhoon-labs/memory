#!/bin/sh
# Registers the model prices of model-prices.json in Langfuse, for
# `task langfuse:prices`. Langfuse works out the cost of a model call from the
# tokens it used and the price of a model definition whose pattern matches the
# model's name; a model without one shows tokens and no cost.
#
# Safe to re-run: a definition this script made earlier is replaced, Langfuse's
# own built-in definitions are left alone (a project's definition wins over a
# built-in one for the same name). Prices apply to calls recorded afterwards;
# Langfuse does not re-price what it already holds.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "${here}/../../../../.." && pwd)"
# Always the repo-local kubeconfig and our context, whatever the caller exported.
k() { kubectl --kubeconfig "${root}/local/kind/kubeconfig" --context kind-agentgateway-demo "$@"; }

api_url="${LANGFUSE_URL:-http://localhost:18085}"
prices="${here}/model-prices.json"

field() { k -n langfuse get secret langfuse-init -o "jsonpath={.data.$1}" | base64 -d; }
# The keys go to curl through a config on stdin, not the command line.
api() {
  printf 'user = "%s:%s"\n' "${public_key}" "${secret_key}" |
    curl --config - --silent --show-error --max-time 30 "$@"
}
public_key="$(field LANGFUSE_INIT_PROJECT_PUBLIC_KEY)"
secret_key="$(field LANGFUSE_INIT_PROJECT_SECRET_KEY)"

existing="$(mktemp)"
request="$(mktemp)"
trap 'rm -f "${existing}" "${request}"' EXIT
: > "${existing}"
page=1
while :; do
  body="$(api "${api_url}/api/public/models?limit=100&page=${page}")"
  printf '%s' "${body}" | jq -c '.data[] | select(.isLangfuseManaged == false) | {id, modelName}' >> "${existing}"
  [ "${page}" -ge "$(printf '%s' "${body}" | jq -r '.meta.totalPages // 1')" ] && break
  page=$((page + 1))
done

jq -c '.models[]' "${prices}" | while IFS= read -r model; do
  name="$(printf '%s' "${model}" | jq -r '.modelName')"
  jq -r --arg name "${name}" 'select(.modelName == $name) | .id' "${existing}" | while IFS= read -r id; do
    api --output /dev/null --request DELETE "${api_url}/api/public/models/${id}"
  done
  # Langfuse takes the price of one token. The request goes through a file:
  # curl's standard input already carries the keys.
  printf '%s' "${model}" | jq -c '{
      modelName, matchPattern, unit: "TOKENS",
      inputPrice: (.inputUsdPerMTok / 1000000), outputPrice: (.outputUsdPerMTok / 1000000)}' > "${request}"
  created="$(api --request POST --header 'Content-Type: application/json' --data "@${request}" "${api_url}/api/public/models")"
  if [ "$(printf '%s' "${created}" | jq -r '.modelName // empty' 2>/dev/null)" != "${name}" ]; then
    echo "Langfuse did not take the price of ${name}: ${created}" >&2
    exit 1
  fi
  printf '  %-28s $%s in, $%s out per million tokens   (%s)\n' "${name}" \
    "$(printf '%s' "${model}" | jq -r '.inputUsdPerMTok')" "$(printf '%s' "${model}" | jq -r '.outputUsdPerMTok')" \
    "$(printf '%s' "${model}" | jq -r '.source')"
done

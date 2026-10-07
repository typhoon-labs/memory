#!/bin/sh
# Runs the scenarios in this directory against the agent as it is deployed,
# through the gateway, as alert-automation. Each scenario is one real turn of
# the model the agent is configured with, so run them on purpose.
#
#   run.sh                      every scenario whose precondition holds now
#   run.sh bad-release          one scenario (the file name without .json)
#
# A scenario does not set up the cluster. It states what it requires
# (`requires.search_status`, and how to get there) and is skipped when the
# Sample App is not in that state: shipping and withdrawing a release are the
# demo's tasks (`task demo:break`, `task demo:reset`), not this script's.
#
# What `expect` may hold:
#   recommended_version              the value in the answer's JSON block
#   suspected_cause_matches          regular expressions, each must match
#   suspected_cause_does_not_match   regular expressions, none may match
#   evidence_matches                 each must match the evidence list as one text
#   answer_matches / answer_does_not_match    against the whole answer
#   tools_called                     tools the agent must have used
#   max_seconds                      the turn, as the caller sees it
#   cluster_unchanged                the Deployment's generation and the names
#                                    of its ReplicaSets and pods are the same
#                                    after the turn as before it
# Always checked: the turn completes, the answer ends in a JSON block with
# suspected_cause, evidence (a list) and recommended_version, and every tool
# the agent called is one of the read tools in ../config/agent.yaml.
#
# Exit status: the number of failed checks.
set -o nounset
component_dir="$(cd "$(dirname "$0")/.." && pwd)"
# The cluster the agent runs in, for `cluster_unchanged`: from the environment,
# as the tasks set it, never the default kubeconfig or the current context.
k() {
  kubectl --kubeconfig "${PLATFORM_KUBECONFIG:?set PLATFORM_KUBECONFIG and PLATFORM_CONTEXT (task diagnosis-agent:eval does)}" \
    --context "${PLATFORM_CONTEXT:?set PLATFORM_CONTEXT (task diagnosis-agent:eval does)}" "$@"
}

web_url="${WEB_URL:-http://localhost:18082}"
# Every tool of every group under `tools:` in the agent's definition: its
# Kubernetes tools and its observability tools. All of them only read.
allowed_tools="$(sed -n '/^tools:/,$p' "${component_dir}/config/agent.yaml" | sed -n 's/^      - //p' | jq -Rnc '[inputs]')"
failures=0
out="$(mktemp)"; trap 'rm -f "${out}"' EXIT

check() {
  if [ "$2" = "true" ]; then
    printf '   ok    %s\n' "$1"
  else
    printf '   FAIL  %s%s\n' "$1" "${3:+  -> $3}"
    failures=$((failures + 1))
  fi
}

snapshot() {
  k -n sample-app get deployment search-service -o jsonpath='{.metadata.generation}' 2>/dev/null
  printf ' '
  k -n sample-app get replicasets,pods -l app.kubernetes.io/name=search-service -o name 2>/dev/null | sort | tr '\n' ' '
}

run_scenario() {
  file="$1"
  name="$(jq -r .name "${file}")"
  echo "== ${name}"
  wanted="$(jq -r '.requires.search_status // empty' "${file}")"
  if [ -n "${wanted}" ]; then
    actual="$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "${web_url}/api/search?q=red" 2>/dev/null || true)"
    if [ "${actual}" != "${wanted}" ]; then
      echo "   skipped: needs the search to answer ${wanted}, it answers ${actual}. To get there: $(jq -r '.requires.how // "?"' "${file}")"
      return 0
    fi
  fi

  before="$(snapshot)"
  "${component_dir}/scripts/ask.sh" --raw "$(jq -r .question "${file}")" >"${out}" 2>/dev/null
  # Kept for a closer look: the whole response, tool results included.
  kept="${TMPDIR:-/tmp}/diagnosis-agent-eval-${name}.json"
  cp "${out}" "${kept}" 2>/dev/null && echo "   response kept in ${kept}"
  seconds="$(jq -r '.seconds // empty' "${out}" 2>/dev/null)"
  after="$(snapshot)"

  state="$(jq -r '.result.task.status.state // .error.message // "no answer"' "${out}" 2>/dev/null || echo "no answer")"
  check "the turn completed" "$([ "${state}" = "TASK_STATE_COMPLETED" ] && echo true || echo false)" "${state}"
  [ "${state}" = "TASK_STATE_COMPLETED" ] || return 0

  answer="$(jq -r '[.result.task.artifacts[]? | select(any(.parts[]; has("text")))] | last | [.parts[] | .text // empty] | join("\n")' "${out}")"
  block="$(printf '%s\n' "${answer}" | sed -n '/^```json/,/^```$/p' | sed '1d;$d')"
  valid="$(printf '%s' "${block}" | jq -e 'has("suspected_cause") and (.evidence | type == "array") and has("recommended_version")' 2>/dev/null || echo false)"
  check "the answer ends in a JSON block with suspected_cause, evidence[] and recommended_version" "${valid}"
  [ "${valid}" = "true" ] || { printf '%s\n' "${answer}" | sed 's/^/      /' | head -20; return 0; }

  called="$(jq -c '[.result.task.artifacts[]?.parts[] | select(.metadata["kagent.dev/a2a/part-type"] == "function_call") | .data.name]' "${out}")"
  check "only read tools were called ($(printf '%s' "${called}" | jq -r 'length') calls)" \
    "$(jq -n --argjson called "${called}" --argjson allowed "${allowed_tools}" '$called - $allowed | length == 0')" \
    "$(jq -nc --argjson called "${called}" --argjson allowed "${allowed_tools}" '$called - $allowed')"

  expect="$(jq -c .expect "${file}")"
  # matches <field of expect> <text> <true if each must match, false if none may>
  matches() {
    for pattern in $(printf '%s' "${expect}" | jq -r --arg f "$1" '.[$f] // [] | .[] | @base64'); do
      regex="$(printf '%s' "${pattern}" | base64 --decode)"
      found="$(jq -n --arg text "$2" --arg regex "${regex}" '$text | test($regex; "i")')"
      if [ "$3" = "true" ]; then
        check "$1: /${regex}/" "${found}"
      else
        check "$1: /${regex}/" "$([ "${found}" = "false" ] && echo true || echo false)"
      fi
    done
  }
  want_version="$(printf '%s' "${expect}" | jq -r '.recommended_version // empty')"
  got_version="$(printf '%s' "${block}" | jq -r '.recommended_version | tostring')"
  [ -z "${want_version}" ] || check "recommended_version is ${want_version}" "$([ "${got_version}" = "${want_version}" ] && echo true || echo false)" "${got_version}"
  cause="$(printf '%s' "${block}" | jq -r .suspected_cause)"
  evidence="$(printf '%s' "${block}" | jq -r '.evidence | map(tostring) | join("\n")')"
  matches suspected_cause_matches "${cause}" true
  matches suspected_cause_does_not_match "${cause}" false
  matches evidence_matches "${evidence}" true
  matches answer_matches "${answer}" true
  matches answer_does_not_match "${answer}" false
  for tool in $(printf '%s' "${expect}" | jq -r '.tools_called // [] | .[]'); do
    check "called ${tool}" "$(jq -n --argjson called "${called}" --arg tool "${tool}" '$called | index($tool) != null')"
  done
  limit="$(printf '%s' "${expect}" | jq -r '.max_seconds // empty')"
  [ -z "${limit}" ] || check "answered within ${limit}s" "$(jq -n --arg s "${seconds:-999}" --arg l "${limit}" '($s | tonumber) <= ($l | tonumber)')" "${seconds}s"
  if [ "$(printf '%s' "${expect}" | jq -r '.cluster_unchanged // false')" = "true" ]; then
    check "the Deployment, its ReplicaSets and its pods are unchanged" "$([ "${before}" = "${after}" ] && echo true || echo false)"
  fi
  usage="$(jq -c '[.result.task.artifacts[]?.metadata["kagent.dev/a2a/usage"] // empty] | {model_calls: length, tokens_in: (map(.promptTokenCount // 0) | add // 0), tokens_out: (map(.candidatesTokenCount // 0) | add // 0)}' "${out}")"
  echo "   ${seconds}s, ${usage}"
  echo "   suspected_cause: ${cause}"
}

if [ $# -gt 0 ]; then
  for name in "$@"; do run_scenario "${component_dir}/evals/${name%.json}.json"; done
else
  for file in "${component_dir}"/evals/*.json; do run_scenario "${file}"; done
fi

echo
if [ "${failures}" -eq 0 ]; then echo "No check failed."; else echo "${failures} check(s) failed."; fi
exit "${failures}"

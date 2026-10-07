# Shared by the backup drills in this directory. Sourced, not run.
#
# A drill is safe to run in front of an audience: it prints one line saying
# what it is about to show, one entry per step, and one line with the result,
# and it puts back whatever it changed, also when it is interrupted.
#
# The output helpers and the MCP client are the platform tests'
# (agent-platform/tests/lib.sh); which cluster and whose tokens they use is
# this demo's (scripts/lib/cluster.sh).
repo="$(cd "$(dirname "$0")/../.." && pwd)"
. "${repo}/scripts/lib/cluster.sh"
tests="${repo}/agent-platform/tests"
. "${tests}/lib.sh"

# One A2A `message/send` through the gateway, as JSON on stdout.
# a2a_send <route path> <identity> <request as JSON>
a2a_send() {
  curl --silent --max-time 60 -X POST "${gateway_url}$1" \
    -H "authorization: Bearer $(token "$2")" -H 'content-type: application/json' \
    -d "$(jq -cn --argjson data "$3" '{jsonrpc: "2.0", id: "backup-drill", method: "message/send", params: {message: {kind: "message", role: "user", messageId: "backup-drill", parts: [{kind: "data", data: $data}]}}}')"
}

# take_down <namespace> <deployment>: scale to zero and wait until its pods are
# gone, at most 5 seconds. A pod that takes longer to stop has already been
# taken out of its Service by then, so nothing reaches it; the caller checks
# what "down" means for its drill. `put_back` restores the replica count the
# deployment had; it is also run when the script ends for any reason, and
# does nothing the second time.
down_namespace=""; down_deployment=""; down_replicas=""
take_down() {
  down_namespace="$1"; down_deployment="$2"
  down_replicas="$(k --namespace "$1" get deployment "$2" --output jsonpath='{.spec.replicas}')"
  # Found at zero: an earlier run was cut off before it could restore.
  if [ "${down_replicas:-0}" = "0" ]; then down_replicas=1; fi
  trap put_back EXIT
  trap 'exit 130' INT TERM
  down_selector="$(k --namespace "$1" get deployment "$2" --output json | jq -r '.spec.selector.matchLabels | to_entries | map(.key + "=" + .value) | join(",")')"
  k --namespace "$1" scale deployment "$2" --replicas=0 >/dev/null
  k --namespace "$1" wait --for=delete pod --selector "${down_selector}" --timeout=5s >/dev/null 2>&1
  [ "$(k --namespace "$1" get deployment "$2" --output jsonpath='{.spec.replicas}')" = "0" ]
}
# no_pods: true when none of the deployment's pods is left, stopping ones included.
no_pods() { [ -z "$(k --namespace "${down_namespace}" get pod --selector "${down_selector}" --output name 2>/dev/null)" ]; }
put_back() {
  [ -n "${down_deployment}" ] || return 0
  k --namespace "${down_namespace}" scale deployment "${down_deployment}" --replicas="${down_replicas}" >/dev/null
  k --namespace "${down_namespace}" rollout status deployment "${down_deployment}" --timeout=180s >/dev/null 2>&1
  status=$?
  down_deployment=""
  return "${status}"
}

# within <seconds> <command...>: run the command once a second until it
# succeeds; fails when the seconds are used up.
within() {
  limit="$1"; shift
  waited=0
  until "$@"; do
    waited=$((waited + 1))
    [ "${waited}" -lt "${limit}" ] || return 1
    sleep 1
  done
}

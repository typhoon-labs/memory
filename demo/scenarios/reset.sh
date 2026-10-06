#!/bin/sh
# The second half of `task demo:reset`. The first half, in demo/Taskfile.yml,
# applies the release `sample-app` from its selection file, which returns
# search-service to 2.0.0 whatever was shipped since.
#
# This half waits for that rollout and for the search alert to stop firing,
# then forgets every incident:
#
#   delivery-mcp     keeps incidents and changes in memory
#   chat-assistant   keeps, in memory, where each incident's diagnosis stands;
#                    left alone, a diagnosis that was still running would be
#                    written into the next incident, which gets the same id
#
# Their pods are deleted and their Deployments start others; the Deployments
# themselves are not touched.
#
# It ends by checking the clean start through the gateway: the search works,
# no search alert is firing, and delivery-mcp lists no incidents.
set -o errexit
set -o nounset
. "$(dirname "$0")/lib.sh"

k --namespace "${namespace}" rollout status deployment/search-service --timeout=120s >/dev/null
version="$(selected_version)"
if [ "${version}" != "2.0.0" ]; then
  echo "release ${release} selects search-service ${version}, not 2.0.0. Is the selection file changed?" >&2
  exit 1
fi
wait_for_search 200 60

# Until the alert of the last break has resolved, the next break would not be
# a new alert, and Alertmanager would not call the hook for it.
waited=0
while [ "$(firing_search_alerts)" != "0" ] && [ -n "$(firing_search_alerts)" ]; do
  waited=$((waited + 2))
  if [ "${waited}" -gt 120 ]; then
    echo "the search alert is still firing ${waited}s after search-service returned to ${version}" >&2
    exit 1
  fi
  sleep 2
done

k --namespace tools delete pod --selector app.kubernetes.io/name=delivery-mcp --wait=true >/dev/null
if k --namespace agents get deployment chat-assistant >/dev/null 2>&1; then
  k --namespace agents delete pod --selector app.kubernetes.io/name=chat-assistant --wait=true >/dev/null
  k --namespace agents rollout status deployment/chat-assistant --timeout=120s >/dev/null
fi
k --namespace tools rollout status deployment/delivery-mcp --timeout=120s >/dev/null

# Through the gateway, as the demo will call it. The route can take a moment to
# reach the new pod.
token="$("${repo}/local/identity/token.sh" developer)"
tries=0
while :; do
  incidents="$(mcp_call "${token}" list_incidents '{}' | jq -c '.incidents // empty' 2>/dev/null || true)"
  [ "${incidents}" = "[]" ] && break
  tries=$((tries + 1))
  if [ "${tries}" -gt 30 ]; then
    echo "delivery-mcp did not list an empty set of incidents through ${gateway_url}/mcp/delivery (last answer: ${incidents:-none})" >&2
    exit 1
  fi
  sleep 1
done

alert="$(firing_search_alerts)"
echo "Clean start: search-service ${version} (release ${release} revision $(h list --namespace "${namespace}" --filter "^${release}\$" --output json | jq -r '.[0].revision')), search answers HTTP $(search_status), no incidents${alert:+, no search alert firing}."

#!/bin/sh
# Ships search-service 2.1.0, the release that starts the incident.
#
# It does what a release does: an upgrade of the Helm release `sample-app` that
# changes one value, searchService.image.tag, from the chart in the registry.
# No tracked file is edited, so the selection in
# agent-deployments/clusters/dev/workloads/sample-app/values.yaml keeps saying
# 2.0.0: the cluster has drifted from it, which is the state the rollback and
# `task demo:reset` both end.
#
#   break.sh            ship 2.1.0 and wait until the rollout has finished
#   BREAK_VERSION=...   another tag to ship
set -o errexit
set -o nounset
. "$(dirname "$0")/lib.sh"

version="${BREAK_VERSION:-2.1.0}"

before="$(selected_version)"
if [ "${before}" = "${version}" ]; then
  echo "search-service is already ${version}; nothing to ship. Run: task demo:reset"
  exit 0
fi

# The chart version the release was installed from, so nothing but the tag changes.
chart_version="$(h list --namespace "${namespace}" --filter "^${release}\$" --output json | jq -r '.[0].chart | sub("^sample-app-"; "")')"

echo "Shipping search-service ${version} (was ${before}) as an upgrade of release ${release}, chart ${chart_version}"
h upgrade "${release}" "${chart_ref}" --version "${chart_version}" --plain-http \
  --namespace "${namespace}" \
  --reuse-values \
  --set-string "searchService.image.tag=${version}" \
  --description "release: search-service ${version}" \
  --wait --timeout 120s >/dev/null

k --namespace "${namespace}" rollout status deployment/search-service --timeout=120s >/dev/null
# The 2.0.0 pod answers for a few more seconds while it shuts down; the
# incident has started when the search fails.
wait_for_search 500 60
echo "Release ${release} is at revision $(h list --namespace "${namespace}" --filter "^${release}\$" --output json | jq -r '.[0].revision'), search-service ${version}"
echo "Search check: ${search_url} answers HTTP $(search_status)"

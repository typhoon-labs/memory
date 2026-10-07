#!/bin/sh
# Lists what the local registry holds: every repository and its tags. Read-only.
# Used by `task publish` to show what was published.
set -o errexit
set -o nounset

registry="${REGISTRY_URL:-http://localhost:5002}"

echo "== ${registry}"
curl --silent --fail --max-time 10 "${registry}/v2/_catalog" | jq -r '.repositories[]' |
  while read -r repository; do
    tags="$(curl --silent --fail --max-time 10 "${registry}/v2/${repository}/tags/list" | jq -r '(.tags // []) | sort | join(", ")')"
    printf '  %-28s %s\n' "${repository}" "${tags}"
  done

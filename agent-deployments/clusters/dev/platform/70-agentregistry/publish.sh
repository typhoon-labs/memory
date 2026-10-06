#!/bin/sh
# Publishes the catalog entries under catalog/ to the registry, then lists
# what the registry holds. Safe to re-run: `arctl apply` creates an entry or
# replaces it in place, under the tag `latest`.
#
# Publishing writes to the registry's database and nothing else. It talks to
# the registry's HTTP API only; it does not use kubectl.
#
#   publish.sh             apply
#   publish.sh --dry-run   let the registry validate the files, change nothing.
#                          On an empty registry the agents fail a dry run,
#                          because the MCP servers they name are not there yet.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
arctl="${here}/.bin/arctl"
# The registry's API and UI through the kind port mapping (NodePort 30086).
url="http://localhost:18086"

[ -x "${arctl}" ] || "${here}/get-arctl.sh"

# Agents refer to MCP servers by name, and the registry refuses a reference to
# an entry it does not have. So: MCP servers and skills first, agents last.
# A kind with no entries (there is no skill at present: a Skill needs a git
# repository the registry can reach, and this repository has no remote) leaves
# its pattern unmatched, and is skipped.
for file in \
  "${here}"/catalog/mcp-servers/*.yaml \
  "${here}"/catalog/skills/*/skill.yaml \
  "${here}"/catalog/agents/*.yaml; do
  [ -f "${file}" ] || continue
  set -- "$@" -f "${file}"
done

"${arctl}" --registry-url "${url}" apply "$@"

case " $* " in *" --dry-run "*) exit 0 ;; esac

# The catalog is the whole truth: an agent, MCP server or skill that the
# registry holds and the catalog no longer names is removed, so that a deleted
# file does not leave a stale entry in the UI.
catalog_has() {
  grep --quiet --recursive --line-regexp --fixed-strings "  name: $2" "${here}/catalog/$1" 2>/dev/null
}
for pair in "agent agents" "mcp mcp-servers" "skill skills"; do
  kind="${pair% *}"; directory="${pair#* }"
  "${arctl}" --registry-url "${url}" get "${kind}" --output json 2>/dev/null |
    jq -r '(if type == "array" then . else (.items // .data // []) end) | .[] | .metadata.name // empty' 2>/dev/null |
    while IFS= read -r name; do
      catalog_has "${directory}" "${name}" && continue
      echo "removing ${kind} ${name}: it is not in the catalog"
      "${arctl}" --registry-url "${url}" delete "${kind}" "${name}" --all-tags
    done
done

echo
"${arctl}" --registry-url "${url}" get all

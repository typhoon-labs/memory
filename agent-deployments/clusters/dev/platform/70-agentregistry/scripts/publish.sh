#!/bin/sh
# Publishes the catalog entries (every catalog.yaml of a component, and of a
# workload that is not one) to the registry, then lists
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
arctl="$(cd "${here}/../../../../../.." && pwd)/.tools/bin/arctl"
# The registry's API and UI through the kind port mapping (NodePort 30086).
url="http://localhost:18086"

[ -x "${arctl}" ] || "${here}/get-arctl.sh"

# An entry is one catalog.yaml: with the component that owns the agent or tool
# server (components/<name>/), or, for a server that is not one of our
# components, with its workload in this cluster (../../../workloads/<name>/).
repo="$(cd "${here}/../../../../../.." && pwd)"
catalog_files() {
  for file in "${repo}"/components/*/catalog.yaml "${here}"/../../../workloads/*/catalog.yaml; do
    if [ -f "${file}" ]; then printf '%s\n' "${file}"; fi
  done
}
# of_kind <Kind>: the catalog files that hold an entry of that kind.
of_kind() {
  catalog_files | while IFS= read -r file; do
    if grep --quiet --line-regexp --fixed-strings "kind: $1" "${file}"; then printf '%s\n' "${file}"; fi
  done
}

# Agents refer to MCP servers by name, and the registry refuses a reference to
# an entry it does not have. So: MCP servers and skills first, agents last.
# (There is no skill at present: a Skill needs a git repository the registry
# can reach, and this repository has no remote.)
newline='
'
for kind in MCPServer Skill Agent; do
  old_ifs="${IFS}"; IFS="${newline}"
  for file in $(of_kind "${kind}"); do set -- "$@" -f "${file}"; done
  IFS="${old_ifs}"
done

"${arctl}" --registry-url "${url}" apply "$@"

case " $* " in *" --dry-run "*) exit 0 ;; esac

# The catalog is the whole truth: an agent, MCP server or skill that the
# registry holds and the catalog no longer names is removed, so that a deleted
# file does not leave a stale entry in the UI.
catalog_has() {
  of_kind "$1" | while IFS= read -r file; do
    if grep --quiet --line-regexp --fixed-strings "  name: $2" "${file}"; then echo yes; fi
  done | grep --quiet yes
}
for pair in "agent Agent" "mcp MCPServer" "skill Skill"; do
  kind="${pair% *}"; entry_kind="${pair#* }"
  "${arctl}" --registry-url "${url}" get "${kind}" --output json 2>/dev/null |
    jq -r '(if type == "array" then . else (.items // .data // []) end) | .[] | .metadata.name // empty' 2>/dev/null |
    while IFS= read -r name; do
      catalog_has "${entry_kind}" "${name}" && continue
      echo "removing ${kind} ${name}: it is not in the catalog"
      "${arctl}" --registry-url "${url}" delete "${kind}" "${name}" --all-tags
    done
done

echo
"${arctl}" --registry-url "${url}" get all

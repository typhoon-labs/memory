#!/bin/sh
# Removes kagent and Agent Substrate from this cluster, including what Helm
# does not own. Follows https://kagent.dev/docs/kagent/1.x/operations/uninstall/
#
# Everything in namespaces kagent and ate-system goes: agents, conversations,
# snapshots and the signing pools. Workloads that live in `kagent`, such as
# diagnosis-agent, go with it; apply them again after the next install.
#
# What would block or silently break a reinstall if it were left behind:
#   - the identity pools (kubectl-ate refuses to create a pool that exists)
#   - Substrate's database volume: a database from an earlier install keeps
#     its schema version and never picks up a changed schema
set -o errexit
set -o nounset

. "$(dirname "$0")/lib.sh"

h() { helm --kubeconfig "${kubeconfig}" --kube-context "${context}" "$@"; }

remove() {
  if h status "$1" -n "$2" >/dev/null 2>&1; then
    h uninstall "$1" -n "$2" --wait --timeout 5m
  else
    echo "release $2/$1: not installed"
  fi
}

# Every other release in `kagent` first, while the CRDs still exist; Helm
# cannot remove a custom resource whose definition is gone.
for release in $(h list -n kagent -q 2>/dev/null | grep -v -x -e kagent -e kagent-crds || true); do
  remove "${release}" kagent
done

# kagent before its CRDs: deleting the definitions first strands the controller.
remove kagent kagent
remove kagent-crds kagent
remove substrate ate-system
remove substrate-crds ate-system

k delete secret actor-id-jwt-pool actor-id-ca-pool actor-id-ca-certs egress-mitm-ca-pool \
  -n ate-system --ignore-not-found
k delete configmap ate-api-authentication -n ate-system --ignore-not-found
k delete pvc data-postgres-0 -n ate-system --ignore-not-found

k delete namespace kagent ate-system --ignore-not-found --timeout=5m

left="$(k get crd -o name 2>/dev/null | grep -E 'kagent\.dev|ate\.dev' || true)"
if [ -n "${left}" ]; then
  echo "uninstall: these definitions are still present:" >&2
  echo "${left}" >&2
  exit 1
fi
echo "uninstall: done. node memory in use: $(node_memory)"

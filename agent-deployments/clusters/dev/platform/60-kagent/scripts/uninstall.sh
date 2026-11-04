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
#     and the trust bundles Substrate's controllers publish from them
#   - the database volumes: a database from an earlier install keeps its schema
#     version and never picks up a changed schema
#   - the node agent's image cache on the kind node (/var/lib/ate/image-cache):
#     an atelet that finds one in another layout does not start. Substrate
#     1.0 changed it. It is removed once no Actor runs, after ate-system has
#     gone; the next atelet creates it again.
#
# Also removed on the node: each Actor's own directory (/var/lib/ate/actors),
# which holds a conversation's state between turns. The next atelet reports
# those it finds to a control plane that no longer knows them, and keeps them.
#
# Also removes an install from before Substrate 0.5, where each chart brought
# its own database and Substrate's chart its certificate controller. What only
# that layout had is the volume data-postgres-0; the rest it finds gone or not
# installed, and says so.
set -o errexit
set -o nounset

. "$(dirname "$0")/lib.sh"

remove() {
  if h status "$1" -n "$2" >/dev/null 2>&1; then
    h uninstall "$1" -n "$2" --wait --timeout 5m
  else
    echo "release $2/$1: not installed"
  fi
}

# delete_all <resource> [flags]: nothing to do once the definition is gone,
# which is how a second run finishes an interrupted one.
delete_all() {
  resource="$1"; shift
  if k get crd "${resource}" >/dev/null 2>&1; then
    k delete "${resource}" --all "$@" --ignore-not-found --timeout=5m
  fi
}

# Every other release in `kagent` first, while the CRDs still exist; Helm
# cannot remove a custom resource whose definition is gone. The database stays
# until kagent has gone.
for release in $(h list -n kagent -q 2>/dev/null | grep -v -x -e kagent -e kagent-crds -e kagent-postgresql || true); do
  remove "${release}" kagent
done

# The controller finalizes these, so they go while it runs. After that, deleting
# their definition would wait forever.
delete_all sandboxtemplates.api.kagent.dev --all-namespaces

# kagent before its CRDs: deleting the definitions first strands the controller.
# Its release holds the WorkerPool, which needs Substrate's CRDs to be deleted.
remove kagent kagent
remove kagent-crds kagent

# Substrate's controller lets go of a SandboxConfig once no WorkerPool uses it,
# so with the pool gone they go while it still runs.
delete_all sandboxconfigs.ate.dev
remove substrate ate-system
remove kagent-postgresql kagent
remove substrate-podcert podcertificate-controller-system
remove substrate-crds ate-system

k delete secret actor-id-jwt-pool actor-id-ca-pool actor-id-ca-certs egress-mitm-ca-pool \
  -n ate-system --ignore-not-found
k delete configmap ate-api-authentication -n ate-system --ignore-not-found
k delete pvc data-postgres-0 -n ate-system --ignore-not-found

k delete namespace kagent ate-system podcertificate-controller-system --ignore-not-found --timeout=5m
k delete clustertrustbundle \
  podidentity.podcert.ate.dev:identity:primary-bundle \
  servicedns.podcert.ate.dev:identity:primary-bundle \
  postgres.podcert.ate.dev:identity:primary-bundle \
  egress-mitm.ate.dev:mitm:primary-bundle \
  --ignore-not-found

# The namespace's deletion waited for atelet and every Worker to stop.
docker exec agentgateway-demo-control-plane rm -rf /var/lib/ate/image-cache /var/lib/ate/actors
echo "uninstall: removed /var/lib/ate/image-cache and /var/lib/ate/actors on the node"

left="$(k get crd -o name 2>/dev/null | grep -E 'kagent\.dev|ate\.dev' || true)"
if [ -n "${left}" ]; then
  echo "uninstall: these definitions are still present:" >&2
  echo "${left}" >&2
  exit 1
fi
echo "uninstall: done. node memory in use: $(node_memory)"

#!/bin/sh
# Creates Secret `agentgateway-postgresql` in namespace `agentgateway-system`:
# the password of the gateway's database, generated here. A Secret that exists is
# kept, because the database keeps the password it first started with.
#
# Run by the release `agentgateway-postgresql` before each sync (helmfile.yaml).
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../../../../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

namespace="agentgateway-system"
name="agentgateway-postgresql"

if k -n "${namespace}" get secret "${name}" >/dev/null 2>&1; then
  echo "postgres-secret: ${namespace}/${name} exists, kept"
  exit 0
fi

# Whoever comes first creates the namespace; it may exist already.
k get namespace "${namespace}" >/dev/null 2>&1 || k create namespace "${namespace}"

# Hex, because the gateway writes it into a URL.
k -n "${namespace}" create secret generic "${name}" \
  --from-literal=password="$(openssl rand -hex 24)" >/dev/null
echo "postgres-secret: ${namespace}/${name} created"

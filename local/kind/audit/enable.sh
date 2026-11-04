#!/bin/sh
# Turns on the Kubernetes API server's audit log in the kind node, with
# policy.yaml next to this file. Safe to re-run: nothing changes unless the
# policy did, and then the API server restarts once to read it.
#
# Run by `task up:trunk` after the cluster exists. kind cannot take the policy
# at creation time on this machine: kind reads it from the node at `kubeadm
# init`, and Docker Desktop does not share this repository's path with the
# node. So the files are written into the node, and kubeadm regenerates the
# API server's static Pod manifest from kind's own configuration
# (/kind/kubeadm.conf) with a JSON patch that adds the audit flags. The
# kubelet notices the new manifest and restarts the API server.
#
# The log is /var/log/kubernetes/audit/audit.log in the node, rotated at 50 MB
# with 4 old files kept. The release `kube-audit-forwarder` sends it to the
# cluster's collector, and so to Loki (platform/40-observability). On EKS the
# control plane's audit log is a logging setting of the cluster instead, and
# none of this exists.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../.." && pwd)"
. "${repo}/scripts/lib/cluster.sh"

node="agentgateway-demo-control-plane"
dir="/etc/kubernetes/audit"
manifest="/etc/kubernetes/manifests/kube-apiserver.yaml"

n() { docker exec "${node}" "$@"; }

policy_sha="$(sha256sum "${here}/policy.yaml" | cut -c1-16)"
if n grep -q "agentgateway-demo/audit-policy: \"\{0,1\}${policy_sha}" "${manifest}" 2>/dev/null; then
  echo "audit: the API server already records with this policy (${policy_sha})"
  exit 0
fi

n mkdir -p "${dir}/patches" /var/log/kubernetes/audit
docker exec -i "${node}" sh -c "cat > ${dir}/policy.yaml" < "${here}/policy.yaml"
# The patch, with the policy's hash as an annotation: a changed policy makes a
# changed manifest, which is what restarts the API server.
jq --arg sha "${policy_sha}" \
  '. + [{"op": "add", "path": "/metadata/annotations/agentgateway-demo~1audit-policy", "value": $sha}]' \
  "${here}/kube-apiserver+json.json" |
  docker exec -i "${node}" sh -c "cat > '${dir}/patches/kube-apiserver+json.json'"
# kind's configuration with the patch directory added; kubeadm takes patches
# only from its configuration, not with --config on the command line.
n sh -c "perl -pe 's|^kind: InitConfiguration\$|kind: InitConfiguration\npatches:\n  directory: ${dir}/patches|' /kind/kubeadm.conf > ${dir}/kubeadm.conf"

before="$(n crictl ps --name kube-apiserver --output json | jq -r '.containers[0].id // empty')"
echo "audit: regenerating the API server's manifest with the audit flags (policy ${policy_sha})"
n kubeadm init phase control-plane apiserver --config "${dir}/kubeadm.conf" 2>&1 | grep -v '^W' || true

# The kubelet replaces the API server; wait for a new container that answers.
printf 'audit: waiting for the API server to restart'
i=0
while :; do
  now="$(n crictl ps --name kube-apiserver --state running --output json 2>/dev/null | jq -r '.containers[0].id // empty')"
  if [ -n "${now}" ] && [ "${now}" != "${before}" ] && k get --raw /readyz >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  if [ "${i}" -ge 90 ]; then
    echo
    echo "audit: the API server did not come back within 3 minutes; see: docker exec ${node} crictl ps -a --name kube-apiserver" >&2
    exit 1
  fi
  printf '.'
  sleep 2
done
echo " ready"
n test -f /var/log/kubernetes/audit/audit.log && echo "audit: writing /var/log/kubernetes/audit/audit.log in the node"

#!/bin/sh
# Shared by the scripts in this directory. Sourced, not run.
#
# The kubeconfig, the context, `k`, `h` and `ate` come from
# scripts/lib/cluster.sh, which says why they are spelled out.

scripts_dir="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${scripts_dir}/../../../../../.." && pwd)"
. "${repo}/scripts/lib/cluster.sh"

if [ ! -f "${kubeconfig}" ]; then
  echo "$(basename "$0"): ${kubeconfig} does not exist. Run \`task up:trunk\` first." >&2
  exit 1
fi

# Node memory in use, as Docker reports it for the kind node container.
node_memory() {
  docker stats --no-stream --format '{{.MemUsage}}' agentgateway-demo-control-plane 2>/dev/null | cut -d' ' -f1
}

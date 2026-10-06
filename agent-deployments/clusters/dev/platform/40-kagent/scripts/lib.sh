#!/bin/sh
# Shared by the scripts in this directory. Sourced, not run.
#
# Every command names the repo-local kubeconfig and this cluster's context,
# whatever the caller exported. With any other kubeconfig the context does not
# exist and the command fails before it changes anything.

scripts_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${scripts_dir}/../../../../../.." && pwd)"
kubeconfig="${repo_root}/local/kind/kubeconfig"
context="kind-agentgateway-demo"
ate_bin="${scripts_dir}/../.bin/kubectl-ate"

if [ ! -f "${kubeconfig}" ]; then
  echo "$(basename "$0"): ${kubeconfig} does not exist. Run \`task up\` first." >&2
  exit 1
fi

k() { kubectl --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }

# The Agent Substrate plugin, run as a binary: as `kubectl ate` it would be
# found only on PATH, and kubectl does not pass it --kubeconfig or --context.
ate() { "${ate_bin}" --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }

# Node memory in use, as Docker reports it for the kind node container.
node_memory() {
  docker stats --no-stream --format '{{.MemUsage}}' agentgateway-demo-control-plane 2>/dev/null | cut -d' ' -f1
}

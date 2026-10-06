#!/bin/sh
# Shared by the scripts of this component. Sourced, not run.
#
# Always the repo-local kubeconfig and this cluster's context, whatever the
# caller exported: with any other kubeconfig the context does not exist and
# the command fails before it changes anything.
component_dir="$(cd "$(dirname "$0")" && pwd)"
case "${component_dir}" in */evals) component_dir="$(dirname "${component_dir}")" ;; esac
repo="$(cd "${component_dir}/../.." && pwd)"
kubeconfig="${repo}/local/kind/kubeconfig"
context="kind-agentgateway-demo"
agent="diagnosis-agent"
agent_namespace="kagent"
gateway_url="${GATEWAY_URL:-http://localhost:18080}"
agent_url="${DIAGNOSIS_AGENT_URL:-${gateway_url}/a2a/${agent}}"
ate_bin="${repo}/agent-deployments/clusters/dev/platform/40-kagent/.bin/kubectl-ate"

k() { kubectl --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }
ate() { "${ate_bin}" --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }

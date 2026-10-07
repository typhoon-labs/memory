# Shared by the scripts that talk to the demo cluster. Sourced, not run.
#
# Set `repo` to the repository root first:
#
#   repo="$(cd "$(dirname "$0")/../.." && pwd)"
#   . "${repo}/scripts/lib/cluster.sh"
#
# Always the repo-local kubeconfig and our context, whatever the caller
# exported: with any other kubeconfig the context does not exist and the
# command fails before it changes anything.
kubeconfig="${repo}/local/kind/kubeconfig"
context="kind-agentgateway-demo"
k() { kubectl --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }
h() { helm --kubeconfig "${kubeconfig}" --kube-context "${context}" "$@"; }

# The model provider the gateway uses now, `local` or `bedrock`: the label the
# release `model-route` puts on its backend. Empty when the cluster or the
# release is not there. `task model` switches it.
model_provider() {
  k --namespace agentgateway-system get agentgatewaybackend model-provider --output 'jsonpath={.metadata.labels.model-provider}' 2>/dev/null || true
}

# An access token for a user or for `alert-automation`; see local/identity/token.sh.
token() { "${repo}/local/identity/token.sh" "$1"; }

# The platform's own checks (agent-platform/tests/) take the cluster and the
# token source from the environment; for this cluster they are the ones above.
export PLATFORM_KUBECONFIG="${kubeconfig}"
export PLATFORM_CONTEXT="${context}"
export PLATFORM_TOKEN_CMD="${repo}/local/identity/token.sh"

# Command line tools the tasks download (git-ignored): kubectl-ate, kagent, arctl.
tools_bin="${repo}/.tools/bin"

# The Agent Substrate plugin, run as a binary: as `kubectl ate` it would be
# found only on PATH, and kubectl does not pass it --kubeconfig or --context.
ate_bin="${tools_bin}/kubectl-ate"
ate() { "${ate_bin}" --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }

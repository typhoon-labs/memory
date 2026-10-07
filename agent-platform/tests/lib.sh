# Shared by the denied-path checks in this directory, and by the backup drills
# in demo/backup/. Sourced, not run.
#
# Each check proves two halves: the path around the control fails, and the
# governed path next to it works. A check prints one line saying what it is
# about to show, one line per attempt, and one line with the result, and
# exits non-zero when either half is not as expected.
#
# Which cluster, and whose tokens, come from the environment, so that the same
# checks run against any cluster that carries the platform:
#
#   PLATFORM_KUBECONFIG   the kubeconfig file
#   PLATFORM_CONTEXT      the context in it. It is named on every command:
#                         with any other kubeconfig it does not exist, and the
#                         command fails before it changes anything
#   PLATFORM_TOKEN_CMD    a command that prints an access token for the
#                         identity given as its argument
#
# Nothing here falls back to the default kubeconfig or the current context.
# For the dev cluster the root Taskfile sets all three, and so does
# scripts/lib/cluster.sh for a script that sources it first.
kubeconfig="${PLATFORM_KUBECONFIG:?set PLATFORM_KUBECONFIG, PLATFORM_CONTEXT and PLATFORM_TOKEN_CMD (the tasks do; see agent-platform/tests/lib.sh)}"
context="${PLATFORM_CONTEXT:?set PLATFORM_CONTEXT (see agent-platform/tests/lib.sh)}"
: "${PLATFORM_TOKEN_CMD:?set PLATFORM_TOKEN_CMD (see agent-platform/tests/lib.sh)}"
# This directory: of the check that was started, unless the caller is a
# script elsewhere and has set `tests` already.
tests="${tests:-$(cd "$(dirname "$0")" && pwd)}"
k() { kubectl --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }
h() { helm --kubeconfig "${kubeconfig}" --kube-context "${context}" "$@"; }

# The gateway as this machine reaches it, and as a pod does.
gateway_url="${GATEWAY_URL:-http://localhost:18080}"
gateway_in_cluster="http://agentgateway-proxy.agentgateway-system.svc.cluster.local"

token() { "${PLATFORM_TOKEN_CMD}" "$1"; }

failures=0
showing() { printf 'Showing: %s\n' "$*"; }
# line <label> <what was tried> <what happened>
line() { printf '  %-9s %s\n            %s\n' "$1" "$2" "$3"; }
unexpected() { failures=$((failures + 1)); printf '  %-9s %s\n' "WRONG" "$*"; }
# result <what a pass means>: the last line of a check, and its exit status.
result() {
  if [ "${failures}" -eq 0 ]; then
    printf 'Result: %s\n' "$1"
  else
    printf 'Result: NOT as expected: %s line(s) above are marked WRONG.\n' "${failures}"
  fi
  exit "${failures}"
}

# The workload the probes run in: a real agent's pod, which has Python.
probe_namespace="agents"
probe_workload="deployment/remediation-agent"

# in_pod <mode> [arguments]: run pod_probe.py inside the probe workload and
# print its one line of JSON. A bearer token, if any, is read from stdin, so
# that it is on no command line.
in_pod() {
  k --namespace "${probe_namespace}" exec --stdin "${probe_workload}" -- \
    python -c "$(cat "${tests}/pod_probe.py")" "$@"
}

# mcp <url> <identity or -> <list | call TOOL JSON-ARGUMENTS>: one MCP exchange
# from this machine, as JSON; see mcp.py.
mcp() { python3 "${tests}/mcp.py" "$@"; }

# from_outside_pod <host> <port>: a TCP connection attempt from a pod that no
# network rule limits on its way out, a web pod of the Sample App, which has
# Node. Prints {"connected": bool, "error": text}. Whether it gets through is
# then decided by the rules of the namespace it calls into, and by nothing else.
outside_namespace="sample-app"
outside_workload="deployment/web"
from_outside_pod() {
  k --namespace "${outside_namespace}" exec "${outside_workload}" -- node -e '
    const net = require("net");
    const [host, port] = process.argv.slice(1);
    const socket = net.connect({ host, port: Number(port), timeout: 4000 });
    const say = (answer) => { console.log(JSON.stringify(answer)); socket.destroy(); };
    socket.on("connect", () => say({ connected: true, error: "" }));
    socket.on("timeout", () => say({ connected: false, error: "timed out" }));
    socket.on("error", (error) => say({ connected: false, error: error.code || String(error) }));
  ' "$1" "$2"
}

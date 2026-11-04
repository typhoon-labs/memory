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
#                         identity given as its argument. The checks of the
#                         token exchange also ask it for `<user> --chat-ui`,
#                         the token a browser gets when the user signs in to
#                         the Chat UI (an audience only chat-assistant takes)
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

token() { "${PLATFORM_TOKEN_CMD}" "$@"; }

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

# --- the token exchange (chain-sts) -----------------------------------------
# Tokens are kept in shell variables and handed to commands on standard input,
# never as arguments, and no helper here prints one: what a check shows of a
# token is its decoded claims, and of an exchange its status and refusal.

# chain-sts's token endpoint as a pod in `agents` reaches it.
sts_url="${STS_URL:-http://chain-sts.chain-sts.svc.cluster.local}"

# The targets chain-sts issues for, one per token: each gateway route that
# takes its tokens, by the address a pod calls it at, which is the token's
# `aud` (`delegation.resources` in the cluster's identity.yaml). A route
# accepts a chain-sts token for itself alone. route_of <agent> is the route
# of an agent that is called through the gateway.
target_delivery="${gateway_in_cluster}/mcp/delivery"
target_model="${gateway_in_cluster}/v1"
route_of() { printf '%s/a2a/%s' "${gateway_in_cluster}" "$1"; }

# actor_token <namespace> <service account> [kubectl create token flags]: a
# service-account token, valid 10 minutes, as an agent proves who it is.
# Name the audience in the flags: `--audience chain-sts` is the one chain-sts
# takes; without it the token is for the API server.
actor_token() {
  actor_namespace="$1"; actor_account="$2"; shift 2
  k --namespace "${actor_namespace}" create token "${actor_account}" --duration 10m "$@"
}

# exchange <subject token> <actor token, or empty for none> [target]: one
# RFC 8693 exchange at chain-sts, sent from inside the probe workload, which
# may reach it, for one target, sent as `resource` (RFC 8707): delivery-mcp's
# route when none is given, and none at all when it is given empty. Prints
# {"connected", "status", "body": the answer's JSON, "error"}; the issued
# token is in .body.access_token, so print the answer only through `shown`
# below. STS_URL, when set, sends it to another instance.
exchange() {
  {
    printf '{"grant_type":"urn:ietf:params:oauth:grant-type:token-exchange"'
    printf ',"subject_token":"%s","subject_token_type":"urn:ietf:params:oauth:token-type:jwt"' "$1"
    if [ -n "$2" ]; then
      printf ',"actor_token":"%s","actor_token_type":"urn:ietf:params:oauth:token-type:jwt"' "$2"
    fi
    exchange_target="${3-${target_delivery}}"
    if [ -n "${exchange_target}" ]; then printf ',"resource":"%s"' "${exchange_target}"; fi
    printf '}'
  } | in_pod form "${sts_url}/token"
}

# shown <exchange answer>: what may be printed of it.
shown() {
  printf '%s' "$1" | jq -c 'if .connected then {status, error: .body.error, reason: .body.error_description, issued: (.body.access_token != null)} else {connected, error} end'
}
# issued <exchange answer>: the issued token, for a variable; empty if none.
issued() { printf '%s' "$1" | jq -r '.body.access_token // empty'; }
# refused_with <exchange answer> <status> <error>: true when chain-sts refused
# with exactly that status and error code.
refused_with() {
  [ "$(printf '%s' "$1" | jq -r '"\(.status) \(.body.error)"')" = "$2 $3" ]
}
# reason <exchange answer>: chain-sts's error_description.
reason() { printf '%s' "$1" | jq -r '.body.error_description // .error // empty'; }

# claims <token>: its payload, decoded; never the token. jq reads stdin.
claims() {
  printf '%s' "$1" | cut -d. -f2 | tr '_-' '/+' | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d 2>/dev/null
}
# target_of <token>: its `aud`, the route it is for, by its path ("/mcp/delivery").
target_of() { claims "$1" | jq -r '.aud | if type == "array" then join(",") else . end' | sed "s#^${gateway_in_cluster}##"; }
# chain <token>: the agents in its `act`, newest first, as "a, b"; empty without `act`.
chain() { claims "$1" | jq -r '[.act | recurse(.act; . != null) | select(. != null) | .client_id] | join(", ")' 2>/dev/null; }

# exchange_for <subject token> <target> <agent> [<agent> ...]: the subject
# exchanged by each agent in turn, each with a fresh actor token of its own
# service account in namespace agents, as the agents do it: each agent but the
# last asks for the next one's route, and the last for <target>. Prints the
# last issued token, for a variable. Fails, printing nothing, at the first
# refusal.
exchange_for() {
  held="$1"; final_target="$2"; shift 2
  while [ "$#" -gt 0 ]; do
    agent="$1"; shift
    if [ "$#" -gt 0 ]; then hop_target="$(route_of "$1")"; else hop_target="${final_target}"; fi
    actor="$(actor_token agents "${agent}" --audience chain-sts)" || return 1
    held="$(issued "$(exchange "${held}" "${actor}" "${hop_target}")")"
    [ -n "${held}" ] || return 1
  done
  printf '%s\n' "${held}"
}

# gw <METHOD> <path> <token or empty> [JSON body]: one request to the gateway
# from this machine. The token goes to curl on standard input, as a header.
# Prints "<status> <the first 160 characters of the body, on one line>".
gw() {
  gw_out="$(mktemp)"
  if [ -n "${4:-}" ]; then set -- "$1" "$2" "$3" --data "$4" -H 'content-type: application/json'; fi
  gw_method="$1"; gw_path="$2"; gw_token="$3"; shift 3
  if [ -n "${TRACEPARENT:-}" ]; then set -- "$@" -H "traceparent: ${TRACEPARENT}"; fi
  gw_status="$(printf 'Authorization: Bearer %s\n' "${gw_token}" |
    curl --silent --max-time 30 --output "${gw_out}" --write-out '%{http_code}' -X "${gw_method}" \
      -H @- -H 'accept: application/json, text/event-stream' "$@" "${gateway_url}${gw_path}")"
  printf '%s %s\n' "${gw_status}" "$(head -c 160 "${gw_out}" | tr '\n' ' ')"
  rm -f "${gw_out}"
}

# Why the gateway refused. From Agentgateway 1.7 the body of a refusal is
# generic (`authentication failed`, `unknown resource`), and the reason is in
# the proxy's access log, on the request's own line. A check finds that line
# by a trace id of its own.
#
# traced: the requests that follow belong to a new trace. `trace_id` names it,
# and gw and mcp.py send TRACEPARENT as the header `traceparent`. `untraced`
# ends it.
traced() {
  trace_id="$(openssl rand -hex 16)"
  TRACEPARENT="00-${trace_id}-$(openssl rand -hex 8)-01"
  export TRACEPARENT
}
untraced() { unset TRACEPARENT; }
# logged_reason: the `error` of the newest line of that trace that has one;
# nothing if none does. A line is written when the response ends, so this asks
# up to five times, a second apart.
logged_reason() {
  for attempt in 1 2 3 4 5; do
    reason_line="$(k --namespace agentgateway-system logs --since=1m --tail=-1 \
      --selector gateway.networking.k8s.io/gateway-name=agentgateway-proxy 2>/dev/null |
      grep -F "trace.id=${trace_id} " | grep -F ' error="' | tail -n 1)"
    if [ -n "${reason_line}" ]; then
      printf '%s\n' "${reason_line}" | sed -e 's/.* error="//' -e 's/" [a-z_.]*=.*$/"/' -e 's/"$//' -e 's/\\"/"/g'
      return 0
    fi
    sleep 1
  done
}

# header <token>: its JOSE header, decoded.
header() {
  printf '%s' "$1" | cut -d. -f1 | tr '_-' '/+' | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d 2>/dev/null
}

# forge <token> <kid>: a token with the same claims, issued now with a new
# `jti`, signed RS256 with a key made for this call and thrown away, which no
# issuer publishes. `kid` is what its header names. Prints it, for a variable.
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
forge() {
  forge_key="$(mktemp)"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "${forge_key}" 2>/dev/null
  forge_now="$(date +%s)"
  forge_head="$(jq -cn --arg kid "$2" '{alg: "RS256", typ: "JWT", kid: $kid}' | b64url)"
  forge_body="$(claims "$1" | jq -c --argjson now "${forge_now}" --arg jti "$(openssl rand -hex 16)" \
    '.iat = $now | .nbf = $now | .exp = $now + 300 | .jti = $jti' | b64url)"
  forge_sig="$(printf '%s.%s' "${forge_head}" "${forge_body}" | openssl dgst -sha256 -sign "${forge_key}" -binary | b64url)"
  rm -f "${forge_key}"
  printf '%s.%s.%s\n' "${forge_head}" "${forge_body}" "${forge_sig}"
}

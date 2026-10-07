#!/bin/sh
# Issues the gateway key for one workload, once, and tells the gateway its hash.
#
#   mint-key.sh <workload> <workload-namespace> [--rotate]
#
#   Secret    <workload-namespace>/<workload>-gateway-key   key AGENTGATEWAY_API_KEY, and
#             AUTHORIZATION_HEADER: the same key as a whole header value,
#             "Bearer <key>", for a client that can only send a Secret's value
#             as it is (kagent's RemoteMCPServer `headersFrom`)
#   ConfigMap agentgateway-system/workload-key-<workload>   the SHA-256 and what the key names
#
# The key exists only in the Secret: it is generated here, printed nowhere and
# written to no file. The gateway never has it, only the hash.
#
# Safe to re-run: an existing key is kept and the ConfigMap is rewritten from
# it. `--rotate` replaces the key. Substrate's egress gateway caches the old
# value for a while; restart deployment/atenet-egress in ate-system to use the
# new one at once.
#
# Which cluster comes from the environment, so that the script serves any
# cluster this chart is installed in: PLATFORM_KUBECONFIG and PLATFORM_CONTEXT.
# The context is named on every command: with any other kubeconfig it does not
# exist, and the command fails before it changes anything. Nothing falls back
# to the default kubeconfig or the current context. For the dev cluster the
# root Taskfile sets both, so the hook that runs this gets them from
# `task deploy`; to run it by hand, as for --rotate, set the two yourself.
set -o errexit
set -o nounset

workload="${1:?usage: mint-key.sh <workload> <workload-namespace> [--rotate]}"
namespace="${2:?usage: mint-key.sh <workload> <workload-namespace> [--rotate]}"
rotate="${3:-}"

kubeconfig="${PLATFORM_KUBECONFIG:?set PLATFORM_KUBECONFIG and PLATFORM_CONTEXT (the tasks do; apply through task deploy)}"
context="${PLATFORM_CONTEXT:?set PLATFORM_CONTEXT (the tasks do; apply through task deploy)}"
gateway_namespace="agentgateway-system"
secret="${workload}-gateway-key"

k() { kubectl --kubeconfig "${kubeconfig}" --context "${context}" "$@"; }

if [ "${rotate}" = "--rotate" ]; then
  k delete secret "${secret}" -n "${namespace}" --ignore-not-found >/dev/null
fi

if k get secret "${secret}" -n "${namespace}" >/dev/null 2>&1; then
  echo "gateway key: ${namespace}/${secret} exists"
else
  # 192 bits from the system's generator, with a prefix that says what it is.
  k create secret generic "${secret}" -n "${namespace}" \
    --from-literal=AGENTGATEWAY_API_KEY="agw_${workload}_$(openssl rand -hex 24)" >/dev/null
  k label secret "${secret}" -n "${namespace}" agentgateway-demo/workload="${workload}" >/dev/null
  echo "gateway key: ${namespace}/${secret} created"
fi

# The header form is derived from the key on every run, so the two cannot
# differ after a rotation. Like the key, it is printed nowhere.
header="$(printf 'Bearer %s' "$(k get secret "${secret}" -n "${namespace}" -o jsonpath='{.data.AGENTGATEWAY_API_KEY}' | base64 --decode)" | base64 | tr -d '\n')"
k patch secret "${secret}" -n "${namespace}" --type merge \
  --patch "$(jq -cn --arg header "${header}" '{data: {AUTHORIZATION_HEADER: $header}}')" >/dev/null
unset header

hash="$(k get secret "${secret}" -n "${namespace}" -o jsonpath='{.data.AGENTGATEWAY_API_KEY}' \
  | base64 --decode | openssl dgst -sha256 -r | cut -d' ' -f1)"

entry="$(jq -cn --arg hash "sha256:${hash}" --arg workload "${workload}" --arg namespace "${namespace}" \
  '{keyHash: $hash, metadata: {workload: $workload, namespace: $namespace}}')"

k create configmap "workload-key-${workload}" -n "${gateway_namespace}" \
  --from-literal="${workload}=${entry}" --dry-run=client -o yaml \
  | k label --local -f - "agentgateway-demo/workload-key=${workload}" -o yaml \
  | k apply -f - | sed 's/^/gateway key: /'

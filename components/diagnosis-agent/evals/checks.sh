#!/bin/sh
# What diagnosis-agent cannot do, checked against the live cluster without a
# single model call. Each line is one attempt and what must happen to it.
#
#   1. Its tools: a write is refused three times over (the tool does not
#      exist on its server, its ServiceAccount has no such verb, and the model
#      is offered read tools only), and a read ends at namespace sample-app.
#   2. Its routes: no token, no call; its model key opens its own door only.
#   3. kagent's port: only the gateway and Substrate's egress reach it.
#   4. Its sandbox: what an Actor of the current revision may reach.
#   5. Its prompt: the runbook is really in what the model is given.
#
# Starts one short-lived pod (`diagnosis-agent-checks` in namespace kagent,
# removed at the end) to make the in-cluster attempts. Exit status: the number
# of failed checks.
set -o nounset
. "$(dirname "$0")/../lib.sh"

failures=0
tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' EXIT
check() {
  if [ "$2" = "true" ]; then printf '  ok    %s\n' "$1"; else printf '  FAIL  %s%s\n' "$1" "${3:+  -> $3}"; failures=$((failures + 1)); fi
}
is() { [ "$1" = "$2" ] && echo true || echo false; }
code() { curl --silent --output "${tmp}/body" --max-time 20 --write-out '%{http_code}' "$@" 2>/dev/null || true; }

tools_url="http://diagnosis-agent-tools.${agent_namespace}.svc.cluster.local:8084/mcp"
controller_url="http://kagent-controller.${agent_namespace}.svc.cluster.local:8083"
sa="system:serviceaccount:${agent_namespace}:diagnosis-agent-tools"

# --- in-cluster attempts, from a pod that is neither the gateway nor an Actor --
cat >"${tmp}/probe.sh" <<EOF
H='-H content-type:application/json -H accept:application/json,text/event-stream'
curl -s -D /tmp/h -o /dev/null \$H --max-time 15 -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"checks","version":"0"}}}' ${tools_url}
sid=\$(grep -i '^mcp-session-id:' /tmp/h | tr -d '\r' | cut -d' ' -f2)
S=""; [ -n "\$sid" ] && S="-H mcp-session-id:\$sid"
curl -s -o /dev/null \$H \$S --max-time 15 -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' ${tools_url}
call() { printf '%s\t' "\$1"; curl -s \$H \$S --max-time 30 -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"\$2\",\"params\":\$3}" ${tools_url} | sed -n 's/^data: //p; /^{/p' | head -1; echo; }
call list tools/list '{}'
call write tools/call '{"name":"k8s_scale","arguments":{"name":"search-service","namespace":"sample-app","replicas":0}}'
call restart tools/call '{"name":"k8s_rollout","arguments":{"action":"restart","resource_type":"deployment","resource_name":"search-service","namespace":"sample-app"}}'
call shell tools/call '{"name":"shell","arguments":{"command":"id"}}'
call read tools/call '{"name":"k8s_get_resources","arguments":{"resource_type":"deployment","namespace":"sample-app"}}'
call other-namespace tools/call '{"name":"k8s_get_resources","arguments":{"resource_type":"pod","namespace":"${agent_namespace}"}}'
call all-namespaces tools/call '{"name":"k8s_get_resources","arguments":{"resource_type":"pod","all_namespaces":true}}'
call secrets tools/call '{"name":"k8s_get_resources","arguments":{"resource_type":"secret","namespace":"sample-app"}}'
printf 'controller\t'; curl -s -o /dev/null -w '%{http_code}' --max-time 5 ${controller_url}/agents/${agent_namespace}/${agent}/.well-known/agent-card.json; echo
EOF
k -n "${agent_namespace}" delete pod diagnosis-agent-checks --ignore-not-found --wait=true >/dev/null 2>&1
k -n "${agent_namespace}" run diagnosis-agent-checks --image=curlimages/curl:8.14.1 --restart=Never --quiet --rm -i \
  --command -- sh -s <"${tmp}/probe.sh" >"${tmp}/probe.out" 2>"${tmp}/probe.err"
field() { grep "^$1	" "${tmp}/probe.out" | head -1 | cut -f2-; }
has_error() { field "$1" | jq -r 'if (.error != null) or (.result.isError == true) then "true" else "false" end' 2>/dev/null || echo false; }

echo "== Tools (${tools_url})"
served="$(field list | jq -c '[.result.tools[].name]' 2>/dev/null || echo '[]')"
offered="$(sed -n '/^  kubernetes:/,/^  [a-z]*:$/p' "${component_dir}/config/agent.yaml" | sed -n 's/^      - //p' | jq -Rnc '[inputs]')"
write_tools='["k8s_apply_manifest","k8s_create_resource","k8s_create_resource_from_url","k8s_patch_resource","k8s_patch_status","k8s_delete_resource","k8s_scale","k8s_rollout","k8s_label_resource","k8s_remove_label","k8s_annotate_resource","k8s_remove_annotation","k8s_execute_command","k8s_check_service_connectivity","shell","helm_upgrade","helm_uninstall"]'
check "the server serves tools ($(printf '%s' "${served}" | jq -r length))" "$(printf '%s' "${served}" | jq 'length > 0')" "$(head -c 200 "${tmp}/probe.err")"
check "it serves no write tool" "$(jq -n --argjson s "${served}" --argjson w "${write_tools}" '($s - ($s - $w)) | length == 0')" "$(jq -nc --argjson s "${served}" --argjson w "${write_tools}" '$s - ($s - $w)')"
check "every tool the agent is offered exists on it" "$(jq -n --argjson s "${served}" --argjson o "${offered}" '($o | length > 0) and (($o - $s) | length == 0)')" "$(jq -nc --argjson s "${served}" --argjson o "${offered}" '$o - $s')"
check "scale a Deployment (k8s_scale): refused, $(field write | jq -r '.error.message // "?"' 2>/dev/null)" "$(has_error write)"
check "restart a rollout (k8s_rollout): refused, $(field restart | jq -r '.error.message // "?"' 2>/dev/null)" "$(has_error restart)"
check "run a shell command (shell): refused, $(field shell | jq -r '.error.message // "?"' 2>/dev/null)" "$(has_error shell)"
check "read Deployments in sample-app: allowed" "$(field read | jq -r 'if .result.isError == true or .error != null then "false" else "true" end' 2>/dev/null || echo false)"
check "read pods in namespace ${agent_namespace}: refused" "$(has_error other-namespace)"
check "read pods in all namespaces: refused" "$(has_error all-namespaces)"
check "read Secrets in sample-app: refused" "$(has_error secrets)"

echo "== The tool server's ServiceAccount, asked of the API server"
can() { k auth can-i --as "${sa}" "$@" 2>/dev/null | head -1; }
check "get pods and their logs in sample-app: yes" "$(is "$(can get pods -n sample-app)$(can get pods/log -n sample-app)" yesyes)"
check "list replicasets in sample-app: yes" "$(is "$(can list replicasets.apps -n sample-app)" yes)"
for verb in "patch deployments.apps" "update deployments.apps" "delete pods" "create pods/exec" "get secrets" "get configmaps"; do
  # shellcheck disable=SC2086
  check "${verb} in sample-app: no" "$(is "$(can ${verb} -n sample-app)" no)"
done
check "list pods in ${agent_namespace}: no" "$(is "$(can list pods -n "${agent_namespace}")" no)"
check "list pods in kube-system: no" "$(is "$(can list pods -n kube-system)" no)"

echo "== The agent's route (${agent_url})"
check "agent card without a token: 401" "$(is "$(code "${agent_url}/.well-known/agent-card.json")" 401)"
check "message without a token: 401" "$(is "$(code -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":"1","method":"SendMessage","params":{}}' "${agent_url}")" 401)"
token="$("${repo}/local/identity/token.sh" developer 2>/dev/null || true)"
card_code="$(code -H "authorization: Bearer ${token}" "${agent_url}/.well-known/agent-card.json")"
check "agent card with a token: 200, JSON-RPC at the address the caller used" \
  "$([ "${card_code}" = 200 ] && jq -r --arg url "${agent_url}" '[.supportedInterfaces[] | select(.protocolBinding == "JSONRPC" and .url == $url)] | length == 1' "${tmp}/body" 2>/dev/null || echo false)"
code -H "authorization: Bearer ${token}" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"kind":"message","messageId":"0","role":"user","parts":[{"kind":"text","text":"x"}]}}}' "${agent_url}" >/dev/null
check "the A2A 0.3 method message/send: refused with -32601 (kagent speaks A2A 1.0 only)" "$(jq -r '.error.code == -32601' "${tmp}/body" 2>/dev/null || echo false)"
check "kagent's other paths are not routed (${gateway_url}/agents/...): 404" "$(is "$(code -H "authorization: Bearer ${token}" "${gateway_url}/agents/${agent_namespace}/${agent}/.well-known/agent-card.json")" 404)"

model_url="${gateway_url}/workloads/${agent}/v1"
echo "== The agent's door to the model route (${model_url})"
key="$(k -n "${agent_namespace}" get secret "${agent}-gateway-key" -o jsonpath='{.data.AGENTGATEWAY_API_KEY}' 2>/dev/null | base64 --decode)"
check "no credential: 401" "$(is "$(code "${model_url}/models")" 401)"
check "a user's token instead of the key: 401" "$(is "$(code -H "authorization: Bearer ${token}" "${model_url}/models")" 401)"
check "the agent's key: 200 (lists models; no completion is requested)" "$(is "$(code -H "authorization: Bearer ${key}" "${model_url}/models")" 200)"
check "the agent's key on everyone else's model route (/v1): 401" "$(is "$(code -H "authorization: Bearer ${key}" "${gateway_url}/v1/models")" 401)"
check "the agent's key on another route (/mcp/delivery): 401" "$(is "$(code -H "authorization: Bearer ${key}" -H 'content-type: application/json' -d '{}' "${gateway_url}/mcp/delivery")" 401)"
unset key

echo "== kagent's port (${controller_url})"
check "from a pod that is neither the gateway nor an Actor: no connection" "$(is "$(field controller)" 000)" "HTTP $(field controller)"

echo "== What an Actor of the current revision may reach"
revision="$(k -n "${agent_namespace}" get agents.api.kagent.dev "${agent}" -o jsonpath='{.status.latestSuccessfulRevision}' | cut -c1-12)"
actor="$(ate get actors --atespace "${agent_namespace}" 2>/dev/null | awk -v t="${agent_namespace}/${agent}-${revision}" '$3 == t { print $2; exit }')"
if [ -z "${actor}" ]; then
  echo "  skipped: revision ${revision} has no conversation yet. Ask the agent once (task diagnosis-agent:ask) and run this again."
else
  rules="$(ate get egress-policy "${actor}" --atespace "${agent_namespace}" -o json 2>/dev/null \
    | jq -c '[.rules[] | (.http // .https // .tcp // {}) as $r | {host: ($r.hostnames // $r.cidrs // ["?"] | join(",")), port: ($r.ports.numbers // [] | map(tostring) | join(",")), credential: (($r.effects.replaceHeaders // []) | length > 0)}]')"
  printf '%s' "${rules}" | jq -r '.[] | "        \(.host):\(.port)\(if .credential then "   (the egress gateway adds the credential)" else "" end)"'
  expected='["agentgateway-proxy.agentgateway-system.svc.cluster.local","diagnosis-agent-tools.kagent.svc.cluster.local","kagent-controller.kagent"]'
  check "the gateway, its tool server and kagent are allowed" "$(jq -n --argjson r "${rules}" --argjson e "${expected}" '($e - ($r | map(.host))) | length == 0')"
  check "only the gateway carries a credential" "$(jq -n --argjson r "${rules}" '[$r[] | select(.credential) | .host] == ["agentgateway-proxy.agentgateway-system.svc.cluster.local"]')"
  # The collector is there only when tracing is on for the cluster.
  wanted='["otel-collector.telemetry.svc.cluster.local"]'
  extra="$(jq -nc --argjson r "${rules}" --argjson e "${expected}" --argjson w "${wanted}" '($r | map(.host)) - $e - $w')"
  # kagent 1.0.0-alpha7 adds api.openai.com:443 to every agent whose
  # ModelConfig has provider OpenAI, whatever its baseUrl. Nothing here asks
  # for it and no credential goes with it. It is listed so that it is seen,
  # and it leads nowhere: release `substrate-egress-boundary` lets the egress
  # gateway connect to pods of this cluster only.
  check "nothing else is allowed, except what kagent adds by itself: ${extra}" "$(jq -n --argjson x "${extra}" '($x - ["api.openai.com"]) | length == 0')"
  check "and the egress gateway may connect to pods of this cluster only (NetworkPolicy actors-stay-in-cluster)" \
    "$(k -n ate-system get networkpolicy actors-stay-in-cluster -o json 2>/dev/null | jq -r '(.spec.policyTypes == ["Egress"]) and (.spec.egress | length == 1) and (.spec.egress[0].to == [{"namespaceSelector": {}}])' 2>/dev/null || echo false)"
fi

echo "== The prompt the model is given (revision ${revision})"
instruction="$(ate get actor-template "${agent}-${revision}" --atespace "${agent_namespace}" -o json 2>/dev/null \
  | jq -r '.. | objects | select(.name? == "KAGENT_CONFIG_JSON") | .value' | jq -r '.instruction // ""' 2>/dev/null)"
check "it holds the system prompt ($(printf '%s' "${instruction}" | wc -c | tr -d ' ') characters)" "$(printf '%s' "${instruction}" | grep -q 'the diagnosis agent for the Sample App' && echo true || echo false)"
check "it holds the search-service runbook" "$(printf '%s' "${instruction}" | grep -q '## Runbook: search-service' && echo true || echo false)"
check "it has no unrendered template" "$(printf '%s' "${instruction}" | grep -q '{{' && echo false || echo true)"

echo
if [ "${failures}" -eq 0 ]; then echo "No check failed."; else echo "${failures} check(s) failed."; fi
exit "${failures}"

#!/bin/sh
# `task demo:preflight`: is the demo ready to be shown? Read by the presenter
# just before the show.
#
# One line per check: GO or NO-GO, what was found, and under a NO-GO what to
# do about it. A NOTE does not block the show; it warns about something the
# room will see. The exit status is the number of NO-GO lines.
#
# It changes nothing. The first check makes one small model call (the fast
# model, 16 tokens) through the gateway, because a model endpoint that only
# listens is not one that answers.
set -o nounset
. "$(dirname "$0")/lib.sh"

token_script="${repo}/local/identity/token.sh"
model_host_url="${MODEL_HOST_URL:-http://localhost:7070}"
model_fast="${MODEL_ID_FAST:-claude-haiku-4-5-20251001}"
grafana_url="http://localhost:18084"
langfuse_url="http://localhost:18085"
registry_url="http://localhost:18086"
chat_url="http://localhost:18083"
kube="kubectl --kubeconfig ${kubeconfig} --context ${context}"

checks=0
failed=0
go() { checks=$((checks + 1)); printf '  GO     %-36s %s\n' "$1" "$2"; }
# no_go <check> <what was found> <what to do>...
no_go() {
  checks=$((checks + 1)); failed=$((failed + 1))
  printf '  NO-GO  %-36s %s\n' "$1" "$2"
  shift 2
  for fix in "$@"; do printf '         %-36s -> %s\n' "" "${fix}"; done
}
note() { printf '  NOTE   %-36s %s\n' "$1" "$2"; shift 2; for more in "$@"; do printf '         %-36s    %s\n' "" "${more}"; done; }
http_code() { curl --silent --output /dev/null --max-time "${2:-5}" --write-out '%{http_code}' "$1" 2>/dev/null || true; }
secret() { k --namespace "$1" get secret "$2" --output "jsonpath={.data.$3}" 2>/dev/null | base64 -d 2>/dev/null; }

echo "Pre-flight for the demo, $(date '+%H:%M:%S'). Every line must say GO."
echo

# --- the cluster -------------------------------------------------------------
if [ ! -f "${kubeconfig}" ] || ! version="$(k version --output json 2>/dev/null | jq -r '.serverVersion.gitVersion // empty')" || [ -z "${version}" ]; then
  no_go "Cluster" "the kind cluster does not answer" "task up   (about 15 minutes; safe to re-run)"
  echo
  echo "Result: NO-GO. Without the cluster nothing else can be checked."
  exit 1
fi
go "Cluster" "Kubernetes ${version}"

pods="$(k get pods --all-namespaces --output json 2>/dev/null)"
# A pod that is being deleted is on its way out, not unready: a drill that
# scaled a Deployment down and up leaves one for up to 30 seconds.
total="$(printf '%s' "${pods}" | jq '[.items[] | select(.status.phase != "Succeeded" and .metadata.deletionTimestamp == null)] | length')"
not_ready="$(printf '%s' "${pods}" | jq -r '
  [.items[] | select(.status.phase != "Succeeded" and .metadata.deletionTimestamp == null)
   | select(.status.phase != "Running" or ([.status.containerStatuses[]?.ready] | all | not))
   | "\(.metadata.namespace)/\(.metadata.name)"] | join(", ")')"
if [ -z "${not_ready}" ] && [ "${total:-0}" -gt 0 ]; then
  go "Every pod ready" "${total} of ${total}"
else
  no_go "Every pod ready" "not ready: ${not_ready:-no pods found}" \
    "wait a minute and run this again; a pod that has just started needs it" \
    "still not ready: ${kube} describe pod -n <namespace> <pod>" \
    "a release is missing or failed: task up   (safe to re-run)"
fi

routes="$(k get httproute --all-namespaces --output json 2>/dev/null | jq -r '
  [.items[] | {name: "\(.metadata.namespace)/\(.metadata.name)", ok: ([.status.parents[]?.conditions[]? | select(.type == "Accepted") | .status] | (length > 0 and all(. == "True")))}]')"
route_count="$(printf '%s' "${routes}" | jq 'length')"
route_bad="$(printf '%s' "${routes}" | jq -r '[.[] | select(.ok | not) | .name] | join(", ")')"
if [ "${route_count:-0}" -ge 10 ] && [ -z "${route_bad}" ]; then
  go "Gateway routes accepted" "${route_count} routes"
else
  no_go "Gateway routes accepted" "${route_count:-0} routes, 10 expected${route_bad:+; not accepted: ${route_bad}}" \
    "task install && task diagnosis-agent:deploy && task observability:install"
fi

# --- identity ----------------------------------------------------------------
bad_tokens=""
for who in developer incident-manager platform-engineer alert-automation; do
  roles="$("${token_script}" "${who}" --claims 2>/dev/null | jq -r '(.roles // []) | join(",")' 2>/dev/null || true)"
  case ",${roles}," in *",${who},"*) ;; *) bad_tokens="${bad_tokens}${bad_tokens:+, }${who}" ;; esac
done
if [ -z "${bad_tokens}" ]; then
  go "Sign-in for each role" "developer, incident-manager, platform-engineer and the alert's own client get a token"
else
  no_go "Sign-in for each role" "no token with the right role for: ${bad_tokens}" \
    "Keycloak at http://localhost:18081 must answer: task status" \
    "the realm is applied by: task up:trunk   (safe to re-run)"
fi

# --- the model ---------------------------------------------------------------
developer_token="$("${token_script}" developer 2>/dev/null || true)"
model_out="$(mktemp)"
trap 'rm -f "${model_out}"' EXIT
model_started="$(date +%s)"
model_code="$(curl --silent --max-time 60 --output "${model_out}" --write-out '%{http_code}' \
  -H "authorization: Bearer ${developer_token}" -H 'content-type: application/json' \
  -d "{\"model\":\"${model_fast}\",\"max_tokens\":16,\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: ok\"}]}" \
  "${gateway_url}/v1/messages" 2>/dev/null || true)"
model_seconds=$(($(date +%s) - model_started))
# `local`, or `bedrock` after `task model -- bedrock`; from scripts/lib/cluster.sh.
provider="$(model_provider)"
if [ "${model_code}" = "200" ] && [ -n "$(jq -r '.content[0].text // empty' "${model_out}" 2>/dev/null)" ]; then
  if [ "${provider}" = "bedrock" ]; then
    go "Model answers through the gateway" "${model_fast} answered in ${model_seconds}s, from Amazon Bedrock"
  else
    go "Model answers through the gateway" "${model_fast} answered in ${model_seconds}s"
  fi
elif [ "${provider}" = "bedrock" ]; then
  # Bedrock's refusal is JSON with the reason at its end.
  reason="$(jq -r '.error.message // .message // empty' "${model_out}" 2>/dev/null | head -c 160)"
  no_go "Model answers through the gateway" "HTTP ${model_code:-none} with Amazon Bedrock as the provider: ${reason:-$(head -c 120 "${model_out}" | tr '\n' ' ')}" \
    "temporary AWS credentials expire: export new ones in this shell, then: task model -- bedrock" \
    "task model   (the region, the endpoint and the model IDs the gateway uses)" \
    "back to the model endpoint on this machine: task model -- local"
elif [ "$(http_code "${model_host_url}/v1/models" 5)" = "000" ]; then
  no_go "Model answers through the gateway" "HTTP ${model_code:-none}; nothing listens at ${model_host_url} on this machine" \
    "start the model endpoint on this machine, then run this again" \
    "to show the incident without a model: task demo:drive -- --alert manual --expect-model down"
else
  no_go "Model answers through the gateway" "HTTP ${model_code:-none}: $(head -c 120 "${model_out}" | tr '\n' ' ')" \
    "task smoke   (says which part of the model route fails)" \
    "after a change to platform/30-model-route/model-provider.yaml: task deploy -- -l name=model-route"
fi

# --- the Sample App, the incident, the alert ---------------------------------
selected="$(selected_version 2>/dev/null || true)"
search_answer="$(curl --silent --max-time 5 "${search_url}" 2>/dev/null | jq -r '.count // empty' 2>/dev/null || true)"
if [ "${selected}" = "2.0.0" ] && [ "$(search_status)" = "200" ] && [ -n "${search_answer}" ]; then
  go "Sample App healthy on 2.0.0" "search answers 200 with ${search_answer} results"
else
  no_go "Sample App healthy on 2.0.0" "search-service ${selected:-unknown}, search answers HTTP $(search_status)" \
    "task demo:reset"
fi

listed="$(mcp_call "${developer_token}" list_incidents '{}')"
incidents="$(printf '%s' "${listed}" | jq -r '[.incidents[]? | "\(.incident_id) (\(.status))"] | join(", ")' 2>/dev/null || true)"
if [ -z "${listed}" ]; then
  no_go "No incident on the card" "delivery-mcp did not answer through ${gateway_url}/mcp/delivery" \
    "task install   (applies delivery-mcp and its route), then task demo:reset"
elif [ -z "${incidents}" ]; then
  go "No incident on the card" "delivery-mcp lists none"
else
  no_go "No incident on the card" "${incidents}; a resolved incident also stays on the card" \
    "task demo:reset"
fi

firing="$(firing_search_alerts)"
rule_state="$(k get --raw '/api/v1/namespaces/telemetry/services/kube-prometheus-stack-prometheus:9090/proxy/api/v1/rules?type=alert' 2>/dev/null |
  jq -r '[.data.groups[]?.rules[]? | select(.name == "SearchErrorRatioHigh") | .state] | first // empty' 2>/dev/null || true)"
hook="$(k --namespace telemetry get alertmanagerconfig alert-automation --output 'jsonpath={.spec.receivers[0].webhookConfigs[0].url}' 2>/dev/null || true)"
if [ -z "${rule_state}" ] || [ -z "${hook}" ]; then
  no_go "Alert armed and quiet" "the alert rule or its route to the hook is missing" \
    "task observability:install"
elif [ "${firing:-0}" = "0" ] && [ "${rule_state}" = "inactive" ]; then
  go "Alert armed and quiet" "SearchErrorRatioHigh is inactive; it calls ${hook}"
else
  no_go "Alert armed and quiet" "SearchErrorRatioHigh is ${rule_state}, ${firing:-0} firing in Alertmanager" \
    "task demo:reset   (returns to 2.0.0 and waits until the alert has cleared, up to 40 seconds)"
fi

agent="$(k --namespace kagent get agents.api.kagent.dev diagnosis-agent --output json 2>/dev/null || echo '{}')"
agent_ready="$(printf '%s' "${agent}" | jq -r '.status.conditions // [] | map(select(.type == "Ready")) | .[0].status // "missing"')"
if [ "${agent_ready}" = "True" ] && [ "$(printf '%s' "${agent}" | jq -r '.status.desiredRevision // "a"')" = "$(printf '%s' "${agent}" | jq -r '.status.latestSuccessfulRevision // "b"')" ]; then
  go "diagnosis-agent ready" "kagent reports it ready on its current revision"
else
  no_go "diagnosis-agent ready" "Ready is ${agent_ready}" \
    "task diagnosis-agent:deploy   (waits until it is ready)" \
    "if it stays down: task demo:alert after the break records a diagnosis by hand"
fi

# --- what the presenter opens --------------------------------------------------
chat_code="$(http_code "${chat_url}/config.json")"
web_code="$(http_code "${web_url}/search")"
if [ "${chat_code}" = "200" ] && [ "${web_code}" = "200" ]; then
  go "Chat UI and Sample App pages" "${chat_url} and ${web_url}/search answer"
else
  no_go "Chat UI and Sample App pages" "Chat UI HTTP ${chat_code}, Sample App HTTP ${web_code}" \
    "task install"
fi

grafana_password="$(secret telemetry kube-prometheus-stack-grafana admin-password)"
grafana_missing=""
for uid in sample-app platform-overview agentgateway; do
  code="$(printf 'user = "admin:%s"\n' "${grafana_password}" | curl --config - --silent --output /dev/null --max-time 5 --write-out '%{http_code}' "${grafana_url}/api/dashboards/uid/${uid}" 2>/dev/null || true)"
  [ "${code}" = "200" ] || grafana_missing="${grafana_missing}${grafana_missing:+, }${uid} (HTTP ${code})"
done
if [ -z "${grafana_missing}" ]; then
  go "Grafana and its three dashboards" "${grafana_url}   login: task observability:login"
else
  no_go "Grafana and its three dashboards" "missing: ${grafana_missing}" \
    "task observability:install"
fi

public_key="$(secret langfuse langfuse-init LANGFUSE_INIT_PROJECT_PUBLIC_KEY)"
secret_key="$(secret langfuse langfuse-init LANGFUSE_INIT_PROJECT_SECRET_KEY)"
langfuse() { printf 'user = "%s:%s"\n' "${public_key}" "${secret_key}" | curl --config - --silent --max-time 15 "$@" 2>/dev/null; }
langfuse_health="$(http_code "${langfuse_url}/api/public/health")"
if [ "${langfuse_health}" = "200" ]; then
  go "Langfuse reachable" "${langfuse_url}   login: task langfuse:login"
else
  no_go "Langfuse reachable" "HTTP ${langfuse_health} from ${langfuse_url}/api/public/health" \
    "task langfuse:install"
fi
query_code="$(langfuse --output "${model_out}" --write-out '%{http_code}' "${langfuse_url}/api/public/v2/observations?limit=1" || true)"
if [ "${query_code}" = "200" ] && jq -e '.data | type == "array"' "${model_out}" >/dev/null 2>&1; then
  go "Langfuse can read traces" "a query through its API answers"
else
  no_go "Langfuse can read traces" "HTTP ${query_code:-none}: $(head -c 100 "${model_out}" | tr '\n' ' ')" \
    "its ClickHouse refuses queries when it is over its memory limit: task langfuse:restart-clickhouse" \
    "then run this again; traces sent in the meantime are kept"
fi
priced="$(langfuse "${langfuse_url}/api/public/models?limit=100" | jq -r '[.data[]? | select(.isLangfuseManaged == false) | .modelName] | sort | join(", ")' 2>/dev/null || true)"
case "${priced}" in
  *claude-haiku-4-5-20251001*claude-sonnet-5-5*) go "Langfuse knows the model prices" "${priced}" ;;
  *) no_go "Langfuse knows the model prices" "registered: ${priced:-none}; without them a call shows tokens and no cost" "task langfuse:prices" ;;
esac
if k --namespace telemetry get deployment otel-collector --output json 2>/dev/null | jq -e '[.spec.template.spec.containers[0].env[]?.name] | index("LANGFUSE_AUTHORIZATION")' >/dev/null 2>&1; then
  go "Traces flow to Langfuse" "the collector's Langfuse pipeline is on"
else
  no_go "Traces flow to Langfuse" "the collector has no Langfuse pipeline" \
    "task observability:install   (run after task langfuse:install; it switches the pipeline on)"
fi

agents="$(curl --silent --max-time 5 "${registry_url}/v0/agents" 2>/dev/null | jq -r '[.items[]?.metadata.name] | length' 2>/dev/null || true)"
servers="$(curl --silent --max-time 5 "${registry_url}/v0/mcpservers" 2>/dev/null | jq -r '[.items[]?.metadata.name] | length' 2>/dev/null || true)"
if [ "${agents:-0}" = "4" ] && [ "${servers:-0}" = "2" ]; then
  go "Registry lists agents and tools" "4 agents and 2 tool servers at ${registry_url}"
elif [ -z "${agents}" ]; then
  no_go "Registry lists agents and tools" "${registry_url} does not answer" "task registry:install && task registry:publish"
else
  no_go "Registry lists agents and tools" "${agents:-0} agents and ${servers:-0} tool servers; 4 and 2 expected" "task registry:publish"
fi

# --- notes: nothing to fix, something to know ------------------------------------
echo
# When the search alert last fired, if within the hour: the time of the newest
# sample of ALERTS{alertstate="firing"} in the last 60 minutes.
last_fired="$(k get --raw '/api/v1/namespaces/telemetry/services/kube-prometheus-stack-prometheus:9090/proxy/api/v1/query?query=max_over_time(timestamp(ALERTS%7Balertname%3D%22SearchErrorRatioHigh%22%2Calertstate%3D%22firing%22%7D)%5B60m%3A15s%5D)' 2>/dev/null |
  jq -r '[.data.result[]?.value[1] | tonumber] | max // empty' 2>/dev/null || true)"
if [ -n "${last_fired}" ]; then
  clear_at="$(date -d "@$(printf '%.0f' "${last_fired}")" '+%H:%M' 2>/dev/null || true)"
  clear_plus="$(date -d "@$(($(printf '%.0f' "${last_fired}") + 3600))" '+%H:%M' 2>/dev/null || true)"
  note "Grafana, Sample App dashboard" "search was broken at ${clear_at:-some point} in the last hour: the tile \"Error budget left, last hour\"" \
    "is red and the graphs show that break until about ${clear_plus:-an hour later}. Say so, or wait."
else
  note "Grafana, Sample App dashboard" "no break in the last hour: every tile starts green"
fi
note "Chat UI sign-ins" "last 30 minutes. With three tabs in one browser only the tab that signed in last" \
  "renews itself: sign in no earlier than 15 minutes before the show, or give" \
  "each role its own browser profile. After task demo:reset, reload each Chat UI tab."
note "Node memory" "$(docker stats --no-stream --format '{{.MemUsage}} ({{.MemPerc}})' agentgateway-demo-control-plane 2>/dev/null || echo unknown)"

echo
if [ "${failed}" -eq 0 ]; then
  echo "Result: GO. ${checks} of ${checks} checks passed."
else
  echo "Result: NO-GO. ${failed} of ${checks} checks failed; each says what to do. Then: task demo:preflight"
fi
exit "${failed}"

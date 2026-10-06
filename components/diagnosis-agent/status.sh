#!/bin/sh
# Read-only summary for `task diagnosis-agent:status`. Never fails the task.
set -o nounset
. "$(dirname "$0")/lib.sh"

echo "== Agent ${agent_namespace}/${agent}"
status="$(k -n "${agent_namespace}" get agents.api.kagent.dev "${agent}" -o json 2>/dev/null || echo '{}')"
printf '%s' "${status}" | jq -r '.status.conditions // [] | .[] | "  \(.type)=\(.status)  \(.reason): \(.message)"'
desired="$(printf '%s' "${status}" | jq -r '.status.desiredRevision // "" | .[0:12]')"
current="$(printf '%s' "${status}" | jq -r '.status.latestSuccessfulRevision // "" | .[0:12]')"
echo "  revision in use ${current:-none}$([ "${desired}" = "${current}" ] || echo ", revision ${desired} is being prepared or failed")"
echo "  model $(k -n "${agent_namespace}" get modelconfig "${agent}" -o jsonpath='{.spec.model} at {.spec.openAI.baseUrl}' 2>/dev/null)"

echo "== Tool servers (ACCEPTED: kagent could list their tools)"
k -n "${agent_namespace}" get remotemcpservers.api.kagent.dev --no-headers 2>/dev/null | awk -v a="${agent}-" 'index($1, a) == 1 { printf "  %-32s %s  accepted=%s\n", $1, $3, $4 }'
echo "  offered to the model: $(k -n "${agent_namespace}" get agenttemplates.api.kagent.dev "${agent}" -o json 2>/dev/null | jq -r '[.spec.tools[]?.mcp.tools[]?] | join(", ")')"

echo "== Routes"
echo "  callers   ${agent_url}   (A2A 1.0 over JSON-RPC, Keycloak token)"
echo "  model     ${gateway_url}/workloads/${agent}/v1   (the agent's own key)"
k get httproute -A --no-headers 2>/dev/null | awk -v a="${agent}" '$2 == a || $2 == "model-" a { printf "  HTTPRoute %s/%s\n", $1, $2 }'

if [ -x "${ate_bin}" ]; then
  echo "== Conversations (one Actor each; SUSPENDED between turns)"
  ate get actors --atespace "${agent_namespace}" 2>/dev/null | awk -v a="${agent_namespace}/${agent}-" 'NR == 1 || index($3, a) == 1' | sed 's/^/  /' | tail -8
  actor="$(ate get actors --atespace "${agent_namespace}" 2>/dev/null | awk -v t="${agent_namespace}/${agent}-${current}" '$3 == t { print $2; exit }')"
  if [ -n "${actor}" ]; then
    echo "== What an Actor of revision ${current} may reach"
    ate get egress-policy "${actor}" --atespace "${agent_namespace}" -o json 2>/dev/null \
      | jq -r '.rules[] | (.http // .https // .tcp // {}) as $r | "  \($r.hostnames // $r.cidrs // ["?"] | join(",")):\($r.ports.numbers // [] | map(tostring) | join(","))\(if ($r.effects.replaceHeaders // []) | length > 0 then "   (credential added by the egress gateway)" else "" end)"'
  fi
fi

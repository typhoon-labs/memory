#!/bin/sh
# Read-only summary for `task kagent:status`. Never fails the task.
set -o nounset

. "$(dirname "$0")/lib.sh"

echo "== Node memory in use: $(node_memory) (the whole node, every workstream)"

# What this install itself holds: the working set of its pods, from the
# kubelet. The node figure above cannot show it while anything else is being
# installed on the same node.
echo "== Memory held by this install (pod working set)"
k get --raw /api/v1/nodes/agentgateway-demo-control-plane/proxy/stats/summary 2>/dev/null | jq -r '
  [.pods[]
   | select(.podRef.namespace == "ate-system" or .podRef.namespace == "kagent"
            or .podRef.namespace == "podcertificate-controller-system")
   | {ns: .podRef.namespace, mem: (.memory.workingSetBytes // 0)}]
  | (group_by(.ns) | map({ns: .[0].ns, mib: (map(.mem) | add / 1048576 | floor), pods: length})) as $g
  | ($g[] | "  \(.ns)  \(.mib) MiB in \(.pods) pods"),
    "  total  \($g | map(.mib) | add) MiB"'

echo "== Helm releases"
helm --kubeconfig "${kubeconfig}" --kube-context "${context}" list -A --no-headers 2>/dev/null |
  awk '$2 == "ate-system" || $2 == "kagent" { printf "  %-12s %-16s %-10s %s\n", $2, $1, $8, $9 }'

for namespace in ate-system podcertificate-controller-system kagent; do
  echo "== Pods in ${namespace}"
  k get pods -n "${namespace}" --no-headers 2>/dev/null |
    awk '{ printf "  %-52s %-6s %-18s restarts %s\n", $1, $2, $3, $4 }'
done

echo "== WorkerPools (desired, replicas, ready)"
k get workerpools -A --no-headers 2>/dev/null | awk '{ printf "  %-10s %-18s %s %s %s\n", $1, $2, $3, $4, $5 }'

echo "== Agents (the Agent owns readiness; a Harness and an AgentTemplate report none)"
k get agents.api.kagent.dev -A \
  -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,READY:.status.conditions[?(@.type=="Ready")].status,REASON:.status.conditions[?(@.type=="Ready")].reason' \
  --no-headers 2>/dev/null | sed 's/^/  /'

echo "== MCP servers known to kagent"
k get remotemcpservers.api.kagent.dev -A --no-headers 2>/dev/null | sed 's/^/  /'

if [ -x "${ate_bin}" ]; then
  echo "== Actors (one per conversation; SUSPENDED between turns)"
  # The plugin port-forwards to the Substrate API by itself.
  ate get actors --atespace kagent 2>/dev/null | sed 's/^/  /'
fi

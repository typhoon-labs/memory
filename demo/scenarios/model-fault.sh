#!/bin/sh
# Fault drill: what the agents and the chat assistant do when the model is not there.
#
#   model-fault.sh down   the model refuses connections: MODEL_BASE_URL becomes
#                         a port in the pod where nothing listens
#   model-fault.sh slow   the model never answers: MODEL_BASE_URL becomes an
#                         address that swallows packets, so the agent waits
#                         until its own deadline (MODEL_TIMEOUT_SECONDS)
#
# It changes one variable on the running Deployments remediation-agent,
# comms-agent and chat-assistant, without touching a tracked file or the
# gateway's model route, so nothing else that uses the model is affected.
# `task demo:model-restore` applies the three releases again, which puts back
# what their selection files say. Then run
# `task demo:drive -- --expect-model down`, or ask the Chat UI a question.
set -o errexit
set -o nounset
. "$(dirname "$0")/lib.sh"

case "${1:-}" in
  down) url="http://127.0.0.1:9" ;;
  # TEST-NET-1 (RFC 5737): reserved for documentation, routed nowhere.
  slow) url="http://192.0.2.1" ;;
  *)
    echo "usage: $0 down|slow    (undo: task demo:model-restore)" >&2
    exit 2
    ;;
esac

agents="remediation-agent comms-agent chat-assistant"
for agent in ${agents}; do
  k --namespace agents set env "deployment/${agent}" "MODEL_BASE_URL=${url}" >/dev/null
done
for agent in ${agents}; do
  k --namespace agents rollout status "deployment/${agent}" --timeout=120s >/dev/null
done
echo "${agents} now call the model at ${url} ($1). Undo: task demo:model-restore"

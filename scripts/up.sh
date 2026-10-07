#!/bin/sh
# `task up`: from no cluster to a demo that is ready to show, one step
# after another, in the one order that works on an empty machine.
#
#   up.sh              every step
#   up.sh --from 6     start at step 6 (after a step failed and was fixed)
#   up.sh --list       print the steps and stop
#
# Each step is a task that already exists and is safe to re-run, so the whole
# of this is safe to re-run on a cluster that is partly or fully there. It
# stops at the first step that fails and says how to carry on.
#
# The model provider is the one in
# agent-deployments/clusters/dev/platform/30-model-route/model-provider.yaml,
# the model endpoint on this machine, unless MODEL_PROVIDER says otherwise:
#
#   MODEL_PROVIDER=bedrock up.sh    step 1 ends by switching the model route to
#                                   Amazon Bedrock, with the AWS credentials
#                                   exported in this shell (`task model`)
#
# A cluster that was switched before keeps its provider when this runs again.
#
# Why this order:
#   - The platform first, in the order of its directories
#     (agent-deployments/clusters/dev/platform/<nn>-<name>), which is also the
#     order a bare `task deploy` applies them in.
#   - Observability comes before everything that sends telemetry, and it
#     brings the kinds (ServiceMonitor, PrometheusRule) later releases use.
#   - Langfuse creates the Secret the collector's Langfuse pipeline reads, so
#     observability is applied a second time after it: that run switches the
#     pipeline on, and with it the gateway's recording of prompts.
#   - The controls before any workload, so that no agent or tool server runs
#     outside its network boundary and no route is admitted before the rules
#     exist. Kyverno's admission rules exempt the platform's own releases, so
#     every later step passes them, the first time and when it is run again.
#   - kagent before diagnosis-agent, which is declared in it.
#   - Images and the Sample App chart are pushed before any release that
#     pulls them.
#   - Workloads before their routes (a route lives in its backend's
#     namespace), and a route's policy before the route: `task install` does both.
#   - The registry's catalog and Langfuse's prices are data, loaded at the end.
#
# Measured on 2026-10-07 on Docker Desktop with 8 CPUs: 14 to 15 minutes
# from `task down`, and under 2 minutes when run again on a finished cluster.
set -o nounset

repo="$(cd "$(dirname "$0")/.." && pwd)"
node="agentgateway-demo-control-plane"

# number | task and its arguments | what it does
steps='
1|up:trunk|Cluster trunk: kind, local registry, Gateway API, Agentgateway, Keycloak, model route
2|observability:install|Observability, first pass: Prometheus, Alertmanager, Grafana, Loki, Tempo, the collector
3|langfuse:install|Langfuse (about 1.3 GB of images on a cold machine)
4|observability:install|Observability, second pass: switches on traces to Langfuse and prompt recording
5|kagent:install|kagent and Agent Substrate
6|registry:install|Agentregistry
7|policies|Controls: network boundaries, Kyverno, the admission rules for gateway resources
8|publish|Build and push every image and the Sample App chart
9|install|Sample App, traffic, delivery-mcp, the agents, the chat assistant, their gateway routes
10|diagnosis-agent:deploy|diagnosis-agent, with its own gateway key
11|registry:publish|Publish the catalog: 4 agents and 2 tool servers
12|langfuse:prices|Model prices in Langfuse, so that a call shows its cost
13|demo:reset|Clean start: search-service 2.0.0, no incident, the alert quiet
14|demo:preflight|Pre-flight: the go or no-go list
'
last=14

from=1
case "${1:-}" in
  --from) from="${2:?usage: up.sh --from <step number>}" ;;
  --list) printf '%s\n' "${steps}" | awk -F '|' 'NF == 3 { printf "  %2d  %-52s %s\n", $1, "task " $2, $3 }'; exit 0 ;;
  "") ;;
  *) echo "usage: up.sh [--from <step number> | --list]" >&2; exit 2 ;;
esac
case "${from}" in ''|*[!0-9]*) echo "--from takes a step number, 1 to ${last}; see: task up -- --list" >&2; exit 2 ;; esac

# --- before anything is created ------------------------------------------------
# The tools, Docker, and how much memory Docker has: the list `task doctor`
# prints. A NOTE in it (too little memory for Docker) does not stop the run.
if ! "${repo}/scripts/doctor.sh"; then
  echo "Nothing was created. When that list says GO: task up" >&2
  exit 1
fi
# Asked for Bedrock without credentials: say so now, not after step 1 has
# built the cluster.
case "${MODEL_PROVIDER:-}" in
  ""|local) ;;
  bedrock)
    if [ "${from}" -gt 1 ]; then
      echo "MODEL_PROVIDER is read by step 1 only. To switch a cluster that is there: task model -- bedrock"
    elif ! "${repo}/agent-deployments/clusters/dev/platform/30-model-route/scripts/provider.sh" bedrock --check-env; then
      echo "Nothing was created. Without MODEL_PROVIDER the cluster starts on the model endpoint on this machine." >&2
      exit 1
    fi ;;
  *) echo "MODEL_PROVIDER is \"${MODEL_PROVIDER}\"; it is local or bedrock." >&2; exit 2 ;;
esac
# The provider the run ends with: the one asked for, or else the one a cluster
# that is there was switched to. `model_provider` comes from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"
provider="${MODEL_PROVIDER:-$(model_provider)}"
if [ "${provider:-local}" = "local" ] && [ "$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' http://localhost:7070/v1/models 2>/dev/null || true)" = "000" ]; then
  echo
  echo "Nothing answers at http://localhost:7070, the model endpoint on this machine."
  echo "The install does not need it, the show does: the last step, the pre-flight, will say NO-GO until it is started."
fi

cd "${repo}" || exit 1
started="$(date +%s)"
summary="$(mktemp)"
trap 'rm -f "${summary}"' EXIT

printf '%s\n' "${steps}" | while IFS='|' read -r number what title; do
  [ -n "${number}" ] || continue
  [ "${number}" -ge "${from}" ] || continue
  echo
  echo "=== up step ${number} of ${last}: ${title}"
  echo "=== task ${what}"
  step_started="$(date +%s)"
  # Word splitting is wanted: a step is a task name and its arguments.
  # shellcheck disable=SC2086
  # Not this loop's standard input: a task that read it would swallow the steps that follow.
  if task ${what} </dev/null; then
    printf '  %2d  %4ss  %s\n' "${number}" "$(($(date +%s) - step_started))" "${title}" >> "${summary}"
  else
    status=$?
    echo
    echo "=== up stopped at step ${number} of ${last}: task ${what} failed (exit ${status}) after $(($(date +%s) - step_started))s."
    if [ "${number}" = "${last}" ]; then
      echo "=== Everything is installed. The pre-flight above says what is not ready and what to do; then: task demo:preflight"
    else
      echo "=== Every step is safe to re-run. When the cause is fixed: task up -- --from ${number}"
    fi
    echo "=== Steps that finished:"
    cat "${summary}"
    exit "${status}"
  fi
done || exit $?

echo
echo "=== up finished in $(( ($(date +%s) - started) / 60 )) min $(( ($(date +%s) - started) % 60 )) s"
cat "${summary}"
echo "  node memory: $(docker stats --no-stream --format '{{.MemUsage}} ({{.MemPerc}})' "${node}" 2>/dev/null || echo unknown)"
echo
echo "Next: demo/run-of-show.md. Before each showing: task demo:reset && task demo:preflight"

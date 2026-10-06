#!/bin/sh
# `task demo:up`: from no cluster to a demo that is ready to show, one step
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
# Why this order:
#   - Observability comes before everything that sends telemetry, and it
#     brings the kinds (ServiceMonitor, PrometheusRule) later releases use.
#   - Langfuse creates the Secret the collector's Langfuse pipeline reads, so
#     observability is applied a second time after it: that run switches the
#     pipeline on, and with it the gateway's recording of prompts.
#   - kagent before diagnosis-agent, which is declared in it.
#   - Images and the Sample App chart are pushed before any release that
#     pulls them.
#   - Workloads before their routes (a route lives in its backend's
#     namespace), and a route's policy before the route: demo:install does both.
#   - diagnosis-agent before observability-mcp's route for workloads, which
#     needs the key the gateway issued to it; that route is applied again.
#   - The admission rules last of the releases, so that they judge a cluster
#     that is complete; everything above passes them when applied again.
#   - The registry's catalog and Langfuse's prices are data, loaded at the end.
set -o nounset

repo="$(cd "$(dirname "$0")/../.." && pwd)"
node="agentgateway-demo-control-plane"

# number | task and its arguments | what it does
steps='
1|up|Cluster trunk: kind, local registry, Gateway API, Agentgateway, Keycloak, model route
2|observability:install|Observability, first pass: Prometheus, Alertmanager, Grafana, Loki, Tempo, the collector
3|langfuse:install|Langfuse (the slowest step on a cold machine: about 1.3 GB of images)
4|observability:install|Observability, second pass: switches on traces to Langfuse and prompt recording
5|kagent:install|kagent and Agent Substrate
6|demo:publish|Build and push every image and the Sample App chart
7|demo:install|Sample App, traffic, delivery-mcp, the agents, the chat assistant, their gateway routes
8|diagnosis-agent:deploy|diagnosis-agent, with its own gateway key
9|deploy -- -l name=observability-mcp-workload-access|The route by which diagnosis-agent reads metrics, logs and traces
10|demo:policies|Controls: network boundaries, Kyverno, the admission rules for gateway resources
11|registry:install|Agentregistry
12|registry:publish|Publish the catalog: 4 agents and 2 tool servers
13|langfuse:prices|Model prices in Langfuse, so that a call shows its cost
14|demo:reset|Clean start: search-service 2.0.0, no incident, the alert quiet
15|demo:preflight|Pre-flight: the go or no-go list
'
last=15

from=1
case "${1:-}" in
  --from) from="${2:?usage: up.sh --from <step number>}" ;;
  --list) printf '%s\n' "${steps}" | awk -F '|' 'NF == 3 { printf "  %2d  %-52s %s\n", $1, "task " $2, $3 }'; exit 0 ;;
  "") ;;
  *) echo "usage: up.sh [--from <step number> | --list]" >&2; exit 2 ;;
esac
case "${from}" in ''|*[!0-9]*) echo "--from takes a step number, 1 to ${last}; see: task demo:up -- --list" >&2; exit 2 ;; esac

# --- before anything is created ------------------------------------------------
missing=""
for tool in task docker kind kubectl helm helmfile jq curl openssl python3; do
  command -v "${tool}" >/dev/null 2>&1 || missing="${missing} ${tool}"
done
if [ -n "${missing}" ]; then
  echo "Missing on the PATH:${missing}" >&2
  echo "Run \`mise trust && mise install\` in ${repo} and use a shell with mise active, or: mise exec -- task demo:up" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start it, then: task demo:up" >&2
  exit 1
fi
docker_bytes="$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)"
if [ "${docker_bytes:-0}" -lt 15000000000 ]; then
  echo "Docker has $((docker_bytes / 1073741824)) GiB of memory. The demo holds about 12 GiB when it is up and more while it installs:"
  echo "give Docker 16 GiB or more. Carrying on."
fi
if [ "$(curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' http://localhost:7070/v1/models 2>/dev/null || true)" = "000" ]; then
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
  echo "=== demo:up step ${number} of ${last}: ${title}"
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
    echo "=== demo:up stopped at step ${number} of ${last}: task ${what} failed (exit ${status}) after $(($(date +%s) - step_started))s."
    if [ "${number}" = "${last}" ]; then
      echo "=== Everything is installed. The pre-flight above says what is not ready and what to do; then: task demo:preflight"
    else
      echo "=== Every step is safe to re-run. When the cause is fixed: task demo:up -- --from ${number}"
    fi
    echo "=== Steps that finished:"
    cat "${summary}"
    exit "${status}"
  fi
done || exit $?

echo
echo "=== demo:up finished in $(( ($(date +%s) - started) / 60 )) min $(( ($(date +%s) - started) % 60 )) s"
cat "${summary}"
echo "  node memory: $(docker stats --no-stream --format '{{.MemUsage}} ({{.MemPerc}})' "${node}" 2>/dev/null || echo unknown)"
echo
echo "Next: demo/run-of-show.md. Before each showing: task demo:reset && task demo:preflight"

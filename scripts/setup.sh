#!/bin/sh
# `task setup`: fetch now what the tasks would otherwise fetch the first time
# they need it, so that nothing is downloaded in the middle of a run.
#
#   setup.sh         the command line tools no package manager has, into
#                    .tools/bin (git-ignored): kubectl-ate and arctl
#   setup.sh --dev   also every component's locked packages, for its own tasks
#                    (test, run-local): npm ci for the chat assistant and the
#                    Sample App's pages, uv sync for delivery-mcp,
#                    remediation-agent and comms-agent
#
# The pinned tools are not installed here. `mise trust && mise install` does
# that, and it comes first because `task` is one of them. Images and charts
# are not fetched here either: `task up` pulls them.
#
# Each step is a task that already exists and is safe to re-run. It ends with
# `task doctor`, the list of what this machine has. If a step fails it stops
# and prints that list, where a missing tool says NO-GO with what to do.
set -o nounset

repo="$(cd "$(dirname "$0")/.." && pwd)"

steps="kagent:tools registry:arctl"
doctor_args=""
case "${1:-}" in
  --dev)
    steps="${steps} chat-assistant:install sample-app:ui delivery-mcp:sync remediation-agent:sync comms-agent:sync"
    doctor_args="--dev"
    ;;
  "") ;;
  *) echo "usage: setup.sh [--dev]" >&2; exit 2 ;;
esac

cd "${repo}" || exit 1
for step in ${steps}; do
  echo
  echo "=== setup: task ${step}"
  if ! task "${step}" </dev/null; then
    echo
    echo "=== setup stopped: task ${step} failed. Every step is safe to re-run. What this machine has:"
    echo
    # shellcheck disable=SC2086
    "${repo}/scripts/doctor.sh" ${doctor_args}
    exit 1
  fi
done

echo
# shellcheck disable=SC2086
"${repo}/scripts/doctor.sh" ${doctor_args}

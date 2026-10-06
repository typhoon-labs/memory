#!/bin/sh
# Waits until kagent has compiled the agent as it is declared now and built
# the golden snapshot new conversations start from. Changes nothing.
#
# Ready alone is not enough after an edit: the Agent stays Ready on its last
# good revision while a new one is prepared, or after a new one failed. And the
# two revisions agreeing once is not enough either: for a moment after an edit
# to the prompt, the runbook or the model, kagent has not noticed it yet, and a
# conversation started in that moment runs the old definition. Nothing on the
# Agent says "I have seen the edit" (a ConfigMap has no generation), so this
# waits until the answer has been the same for a few seconds.
set -o errexit
set -o nounset
. "$(dirname "$0")/lib.sh"

tries="${WAIT_TRIES:-90}"
i=0
stable=0
seen=""
while :; do
  status="$(k -n "${agent_namespace}" get agents.api.kagent.dev "${agent}" -o json 2>/dev/null || echo '{}')"
  ready="$(printf '%s' "${status}" | jq -r '.status.conditions // [] | map(select(.type == "Ready")) | .[0].status // "Unknown"')"
  desired="$(printf '%s' "${status}" | jq -r '.status.desiredRevision // ""')"
  current="$(printf '%s' "${status}" | jq -r '.status.latestSuccessfulRevision // ""')"
  if [ "${ready}" = "True" ] && [ -n "${desired}" ] && [ "${desired}" = "${current}" ]; then
    if [ "${current}" = "${seen}" ]; then stable=$((stable + 1)); else stable=1; seen="${current}"; fi
    if [ "${stable}" -ge 4 ]; then
      echo "${agent}: ready, revision $(printf '%s' "${current}" | cut -c1-12)"
      exit 0
    fi
  else
    stable=0
  fi
  i=$((i + 1))
  if [ "${i}" -ge "${tries}" ]; then
    echo "${agent}: not ready after $((tries * 2))s. The first condition that is False and not Blocked says why:" >&2
    printf '%s' "${status}" | jq -r '.status.conditions // [] | .[] | "  \(.type)=\(.status)  \(.reason): \(.message)"' >&2
    exit 1
  fi
  sleep 2
done

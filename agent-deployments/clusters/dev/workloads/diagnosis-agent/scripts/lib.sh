#!/bin/sh
# Shared by the scripts in this directory. Sourced, not run.
#
# The kubeconfig, the context, `k`, `ate` and `token` come from
# scripts/lib/cluster.sh.
scripts_dir="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${scripts_dir}/../../../../../.." && pwd)"
. "${repo}/scripts/lib/cluster.sh"
# What the agent is (prompt, runbook, tool list) belongs to its component.
component_dir="${repo}/components/diagnosis-agent"
agent="diagnosis-agent"
agent_namespace="kagent"
gateway_url="${GATEWAY_URL:-http://localhost:18080}"
agent_url="${DIAGNOSIS_AGENT_URL:-${gateway_url}/a2a/${agent}}"

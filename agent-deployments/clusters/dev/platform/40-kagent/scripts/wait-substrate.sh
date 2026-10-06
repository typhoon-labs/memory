#!/bin/sh
# Waits until Agent Substrate is ready. Changes nothing.
#
# Runs after the identity bootstrap, and again as the presync hook of release
# `kagent`: the kagent controller connects to Substrate at startup and
# restarts in a loop while it cannot.
set -o errexit
set -o nounset

. "$(dirname "$0")/lib.sh"

timeout="${SUBSTRATE_TIMEOUT:-600s}"

k -n podcertificate-controller-system rollout status deployment --timeout="${timeout}" | sed 's/^/substrate: /'
k -n ate-system rollout status statefulset/postgres --timeout="${timeout}" | sed 's/^/substrate: /'
k -n ate-system rollout status deployment --timeout="${timeout}" | sed 's/^/substrate: /'
# The node agent: it fetches the gVisor runtime from the public URL named in
# SandboxConfig `gvisor-default`, so a node without a route to it stays here.
k -n ate-system rollout status daemonset/atelet --timeout="${timeout}" | sed 's/^/substrate: /'

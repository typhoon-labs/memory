#!/bin/sh
# Waits until kagent can run an agent: the controller is up and every Worker
# of the WorkerPool is ready. Changes nothing.
#
# Helm's own wait does not cover the second part: a WorkerPool is a custom
# resource, and no Harness compiles and no turn runs until it has a ready
# Worker. A turn that finds none fails with a plain timeout that names
# neither capacity nor the pool.
set -o errexit
set -o nounset

. "$(dirname "$0")/lib.sh"

pool="${KAGENT_WORKER_POOL:-kagent-default}"
tries="${KAGENT_WAIT_TRIES:-90}"

k -n kagent rollout status deployment --timeout=300s | sed 's/^/kagent: /'

want="$(k -n kagent get workerpool "${pool}" -o jsonpath='{.spec.replicas}')"
i=0
while :; do
  ready="$(k -n kagent get workerpool "${pool}" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || true)"
  if [ "${ready:-0}" = "${want}" ]; then
    echo "kagent: WorkerPool ${pool} has ${ready} of ${want} Workers ready"
    break
  fi
  i=$((i + 1))
  if [ "${i}" -ge "${tries}" ]; then
    echo "kagent: WorkerPool ${pool} has ${ready:-0} of ${want} Workers ready after $((tries * 5))s" >&2
    k -n kagent get pods -l "ate.dev/worker-pool=${pool}" >&2 || true
    exit 1
  fi
  sleep 5
done

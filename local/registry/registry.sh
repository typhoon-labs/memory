#!/bin/sh
# Local image registry for the kind cluster (stands in for ECR).
#
# Follows https://kind.sigs.k8s.io/docs/user/local-registry/ with this
# project's own container name, `agentgateway-demo-registry`, and host port
# 5002, both from docs/cluster.md. The kind guide's default
# name and port are not used, so this registry is unmistakably ours.
#
#   registry.sh up      create the registry container if it is missing
#   registry.sh wire    point the kind nodes at it and join it to the kind network
#   registry.sh down    remove the registry container, only if this script made it
#
# Images are named localhost:5002/<component>:<version> on the host and in
# pod specs. Code running inside a pod that must talk to the registry directly
# uses http://agentgateway-demo-registry:5000 instead.
set -o errexit
set -o nounset

# Fixed by docs/cluster.md. Deliberately not read from the
# environment: `down` must never be pointed at another container or cluster.
REGISTRY_NAME="agentgateway-demo-registry"
REGISTRY_PORT="5002"
REGISTRY_IMAGE="registry:3"
CLUSTER_NAME="agentgateway-demo"
# Marks the container as ours, so `down` never removes someone else's.
OWNER_LABEL="dev.agentgateway-demo.owner=task-up"

running() {
  [ "$(docker inspect -f '{{.State.Running}}' "${REGISTRY_NAME}" 2>/dev/null || true)" = 'true' ]
}

exists() {
  docker inspect "${REGISTRY_NAME}" >/dev/null 2>&1
}

owned() {
  [ "$(docker inspect -f '{{index .Config.Labels "dev.agentgateway-demo.owner"}}' "${REGISTRY_NAME}" 2>/dev/null || true)" = 'task-up' ]
}

case "${1:-}" in
  up)
    if running; then
      echo "registry ${REGISTRY_NAME} already running"
    elif exists; then
      docker start "${REGISTRY_NAME}" >/dev/null
      echo "registry ${REGISTRY_NAME} started"
    else
      docker run -d --restart=always \
        -p "127.0.0.1:${REGISTRY_PORT}:5000" \
        --network bridge \
        --label "${OWNER_LABEL}" \
        --name "${REGISTRY_NAME}" \
        "${REGISTRY_IMAGE}" >/dev/null
      echo "registry ${REGISTRY_NAME} created on 127.0.0.1:${REGISTRY_PORT}"
    fi
    ;;

  wire)
    # localhost inside a node is the node, not the host. Tell containerd on
    # each node that localhost:<port> is the registry container.
    registry_dir="/etc/containerd/certs.d/localhost:${REGISTRY_PORT}"
    for node in $(kind get nodes --name "${CLUSTER_NAME}"); do
      docker exec "${node}" mkdir -p "${registry_dir}"
      printf '[host."http://%s:5000"]\n' "${REGISTRY_NAME}" |
        docker exec -i "${node}" cp /dev/stdin "${registry_dir}/hosts.toml"
    done
    # Join the registry to the network kind created for its nodes.
    if [ "$(docker inspect -f '{{json .NetworkSettings.Networks.kind}}' "${REGISTRY_NAME}")" = 'null' ]; then
      docker network connect kind "${REGISTRY_NAME}"
    fi
    echo "registry ${REGISTRY_NAME} wired to cluster ${CLUSTER_NAME}"
    ;;

  down)
    if ! exists; then
      echo "registry ${REGISTRY_NAME} not present"
    elif owned; then
      # -v also removes the anonymous volume that held the pushed images.
      docker rm -f -v "${REGISTRY_NAME}" >/dev/null
      echo "registry ${REGISTRY_NAME} removed"
    else
      echo "registry ${REGISTRY_NAME} was not created by task up:trunk; leaving it" >&2
    fi
    ;;

  *)
    echo "usage: $0 up|wire|down" >&2
    exit 2
    ;;
esac

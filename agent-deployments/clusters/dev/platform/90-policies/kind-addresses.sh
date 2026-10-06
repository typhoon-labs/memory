#!/bin/sh
# Prints, as JSON, the two addresses of this kind cluster that a NetworkPolicy
# has to name because they are not pods:
#
#   nodeNetwork   the Docker network the kind node is on, as a CIDR. The
#                 Kubernetes API server and the local registry
#                 (agentgateway-demo-registry) are on it.
#   host          that network's gateway: the address from which a connection
#                 arrives when it enters through a published port, such as the
#                 Chat UI's http://localhost:18083.
#
# Read by the *.yaml.gotmpl files next to it when a release is applied. It
# exists only because this is kind; on EKS these would be the cluster's API
# endpoint, the registry's endpoint and the load balancer's subnets.
#
# Why the whole network and not the node's and the registry's own addresses:
# Docker gives a container a new address when it restarts, and a rule naming
# the old one would silently stop delivery-mcp from applying a change. The
# network's range does not change while the cluster exists.
#
# Read-only. It looks only at this project's node container and at the
# network that container is attached to.
set -o errexit
set -o nounset

node="agentgateway-demo-control-plane"

network="$(docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "${node}" | head -n 1)"
if [ -z "${network}" ]; then
  echo "container ${node} is not attached to a Docker network. Run: task up" >&2
  exit 1
fi

# One line per address family: "<subnet> <gateway>". IPv4 only, as the cluster is.
line="$(docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}} {{.Gateway}}{{"\n"}}{{end}}' "${network}" | grep -v ':' | head -n 1)"
subnet="${line%% *}"
gateway="${line##* }"
if [ -z "${subnet}" ] || [ -z "${gateway}" ] || [ "${subnet}" = "${gateway}" ]; then
  echo "could not read an IPv4 subnet and gateway from Docker network ${network}: '${line}'" >&2
  exit 1
fi

printf '{"nodeNetwork":"%s","host":"%s"}\n' "${subnet}" "${gateway}"

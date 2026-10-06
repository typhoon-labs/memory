#!/bin/sh
# Creates the identity material Agent Substrate needs and no Helm chart
# creates, then waits until Substrate is ready.
#
# Runs as the postsync hook of release `substrate` (../helmfile.yaml), after
# the chart has created the namespaces. Until this has run, the pods in
# ate-system stay in ContainerCreating: they mount Secrets that do not exist.
#
# The steps and names are the ones in
# https://kagent.dev/docs/kagent/1.x/setup/installation/#install-agent-substrate
#
# Safe to re-run. A pool is a signing key: an existing one is never replaced,
# because every certificate and token already issued from it would stop
# verifying. To start over, remove them as ../Taskfile.yml `uninstall` does.
set -o errexit
set -o nounset

. "$(dirname "$0")/lib.sh"

"${scripts_dir}/tools.sh"

have_secret() { k get secret "$2" -n "$1" >/dev/null 2>&1; }

# pool <make-ca-pool|make-jwt-pool> <namespace> <name> [flags]
pool() {
  kind="$1"; namespace="$2"; name="$3"; shift 3
  if have_secret "${namespace}" "${name}"; then
    echo "identity: ${namespace}/${name} exists"
    return 0
  fi
  ate admin "${kind}" --name="${name}" --secret-namespace="${namespace}" "$@"
  echo "identity: ${namespace}/${name} created"
}

# The chart creates this namespace; the two pools that sign service and pod
# certificates live in it.
k wait --for=jsonpath='{.status.phase}'=Active namespace/podcertificate-controller-system --timeout=60s >/dev/null

pool make-ca-pool  podcertificate-controller-system service-dns-ca-pool  --ca-id=1
pool make-ca-pool  podcertificate-controller-system pod-identity-ca-pool --ca-id=1
# Actor credentials: issued as tokens, verified against the CA.
pool make-jwt-pool ate-system actor-id-jwt-pool --key-id=1
pool make-ca-pool  ate-system actor-id-ca-pool  --ca-id=1
# The egress gateway terminates an agent's HTTPS to apply hostname rules and
# to add credentials, and signs a certificate per destination from this pool.
# ECDSA P-256, because clients inside a sandbox may not accept Ed25519.
pool make-ca-pool  ate-system egress-mitm-ca-pool --ca-id=1 --key-type=ECDSAP256

# The actor identity root certificate, as PEM, where the Substrate API server
# and the egress gateway read it.
if have_secret ate-system actor-id-ca-certs; then
  echo "identity: ate-system/actor-id-ca-certs exists"
else
  root_pem="$(k get secret actor-id-ca-pool -n ate-system -o jsonpath='{.data.pool}' | base64 --decode \
    | jq -r '.CAs[0].RootCertificateDER' | base64 --decode \
    | openssl x509 -inform der -outform pem)"
  k create secret generic actor-id-ca-certs -n ate-system --from-literal=ca.crt="${root_pem}" >/dev/null
  echo "identity: ate-system/actor-id-ca-certs created"
fi

# Who may call the Substrate API: Kubernetes ServiceAccount tokens issued for
# its audience. The issuer is read from the cluster, not written down: a wrong
# one is accepted here and fails later, on every call, as "token issuer not
# trusted". An in-cluster issuer publishes no discovery document a client can
# fetch without credentials, so the API server is pointed at its own
# ServiceAccount CA and token. (On a cluster with an external issuer, such as
# GKE, leave those two lines out.)
issuer="$(k get --raw /.well-known/openid-configuration | jq -r .issuer)"
k create configmap ate-api-authentication -n ate-system --dry-run=client -o yaml \
  --from-literal=authentication.yaml="actorIdentityJWTProvider: kubernetes
jwtProviders:
- name: kubernetes
  issuer: ${issuer}
  audiences: [api.ate-system.svc]
  certificateAuthorityFile: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  discoveryTokenFile: /var/run/secrets/kubernetes.io/serviceaccount/token
" | k apply -f - | sed 's/^/identity: /'

"${scripts_dir}/wait-substrate.sh"

#!/bin/sh
# Creates Secret `keycloak-realm-keys` in namespace `keycloak` once: one RSA
# signing key and its self-signed certificate per realm. An existing Secret is
# left as it is, so the keys outlive every restart of the Keycloak pod.
#
# Why: Keycloak keeps nothing (development mode, in-memory database), so a
# realm without a key of its own is given a new one at every start. Every
# verifier that cached the old keys then refuses new tokens until it fetches
# again: the gateway for up to 5 minutes (docs/cluster.md). The realm files
# name these keys instead (component `stable-rs256`, through the placeholders
# ${KC_REALM_<REALM>_SIGNING_KEY} and ${KC_REALM_<REALM>_SIGNING_CERT}, which
# the pod's environment fills in from this Secret).
#
# The keys are generated in this cluster and written to no file; `task down`
# removes them with the cluster.
#
#   realm-keys.sh            create what is missing (run before each sync of
#                            the release `keycloak`)
#   realm-keys.sh --rotate   replace every key; Keycloak must restart, and
#                            verifiers refuse tokens until they fetch again
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

namespace="keycloak"
name="keycloak-realm-keys"
# One key per realm file, files/<realm>-realm.json, the same list the chart
# gives the pod (templates/deployment.yaml).
realms="$(cd "${here}/../files" && ls ./*-realm.json | sed -e 's|^\./||' -e 's|-realm\.json$||' | tr '\n' ' ')"

k get namespace "${namespace}" >/dev/null 2>&1 || k create namespace "${namespace}"

if [ "${1:-}" != "--rotate" ] && k -n "${namespace}" get secret "${name}" >/dev/null 2>&1; then
  missing=""
  for realm in ${realms}; do
    k -n "${namespace}" get secret "${name}" --output "jsonpath={.data.${realm}-signing-key}" | grep -q . || missing="${missing} ${realm}"
  done
  if [ -z "${missing}" ]; then
    echo "realm-keys: Secret ${namespace}/${name} has a key for every realm (${realms})"
    exit 0
  fi
  echo "realm-keys: adding keys for${missing}"
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

# Keep the keys the Secret already has, unless rotating.
args=""
for realm in ${realms}; do
  key="${work}/${realm}-signing-key"
  cert="${work}/${realm}-signing-cert"
  existing="$(k -n "${namespace}" get secret "${name}" --output "jsonpath={.data.${realm}-signing-key}" 2>/dev/null || true)"
  if [ "${1:-}" != "--rotate" ] && [ -n "${existing}" ]; then
    printf '%s' "${existing}" | base64 -d > "${key}"
    k -n "${namespace}" get secret "${name}" --output "jsonpath={.data.${realm}-signing-cert}" | base64 -d > "${cert}"
  else
    openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=${realm}" \
      -keyout "${work}/key.pem" -out "${work}/cert.pem" 2>/dev/null
    # One line of base64 without the PEM armor: the form Keycloak's rsa key
    # provider reads from a realm file.
    grep -v '^-----' "${work}/key.pem" | tr -d '\n' > "${key}"
    grep -v '^-----' "${work}/cert.pem" | tr -d '\n' > "${cert}"
  fi
  args="${args} --from-file=${realm}-signing-key=${key} --from-file=${realm}-signing-cert=${cert}"
done

# shellcheck disable=SC2086
k -n "${namespace}" create secret generic "${name}" ${args} --dry-run=client --output yaml |
  k apply --filename -
echo "realm-keys: Secret ${namespace}/${name} written for ${realms}"

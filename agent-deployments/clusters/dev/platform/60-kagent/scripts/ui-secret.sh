#!/bin/sh
# Creates or updates Secret `kagent-ui-oidc` in namespace `kagent`: what the
# sign-in proxy of the kagent UI (oauth2-proxy) needs to sign users in with
# Keycloak.
#
#   client-id       kagent-ui
#   client-secret   a demo-only value. It is read from the Keycloak realm
#                   file, which is the only place it is written down, and goes
#                   to the cluster without passing through a tracked file or a
#                   command line.
#   cookie-secret   the key the proxy encrypts its session cookie with.
#                   Generated here the first time and kept after that, so
#                   running this again signs nobody out.
#
# Run by the release `kagent` before each sync (helmfile.yaml), and by
# `task kagent:ui-secret`.
set -o errexit
set -o nounset

. "$(dirname "$0")/lib.sh"

realm_file="${repo}/local/identity/keycloak/files/demo-realm.json"
client="kagent-ui"
namespace="kagent"
name="kagent-ui-oidc"

jq -er --arg c "${client}" '.clients[] | select(.clientId == $c) | .secret' "${realm_file}" >/dev/null || {
  echo "ui-secret: client ${client} has no secret in ${realm_file}" >&2
  exit 1
}

# Whoever comes first creates the namespace; it may exist already.
k get namespace "${namespace}" >/dev/null 2>&1 || k create namespace "${namespace}"

umask 077
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

jq -jr --arg c "${client}" '.clients[] | select(.clientId == $c) | .secret' "${realm_file}" >"${work}/client-secret"

k -n "${namespace}" get secret "${name}" --output 'jsonpath={.data.cookie-secret}' 2>/dev/null | base64 -d >"${work}/cookie-secret" 2>/dev/null || true
if [ ! -s "${work}/cookie-secret" ]; then
  # 32 random bytes in URL-safe base64, the form oauth2-proxy documents.
  openssl rand -base64 32 | tr -- '+/' '-_' | tr -d '\n' >"${work}/cookie-secret"
fi

k -n "${namespace}" create secret generic "${name}" \
  --from-literal=client-id="${client}" \
  --from-file=client-secret="${work}/client-secret" \
  --from-file=cookie-secret="${work}/cookie-secret" \
  --dry-run=client --output yaml |
  k apply --filename -

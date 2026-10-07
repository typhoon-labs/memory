#!/bin/sh
# Print an access token from the demo Keycloak realm, and nothing else.
#
#   token.sh developer            a user (password grant through client demo-cli)
#   token.sh alert-automation     the machine client (client credentials)
#   token.sh developer --claims   the decoded claims instead of the token
#   token.sh developer --other-audience
#                                 a real token for the same user and issuer that
#                                 does not carry the audience `agentgateway`
#                                 (Keycloak's built-in admin-cli client); for
#                                 checks that the gateway refuses it
#
# Users: developer, developer-other-team, incident-manager, platform-engineer.
# The passwords and the client secret are demo-only values; they are read from
# the realm file, which is the only place they are written down.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
realm_file="${here}/keycloak/files/demo-realm.json"
keycloak_url="${KEYCLOAK_URL:-http://localhost:18081}"
token_url="${keycloak_url}/realms/demo/protocol/openid-connect/token"

who="${1:-developer}"
mode="${2:-}"

if [ "${who}" = "alert-automation" ]; then
  secret="$(jq -r '.clients[] | select(.clientId == "alert-automation") | .secret' "${realm_file}")"
  response="$(curl --silent --show-error --max-time 15 \
    -d grant_type=client_credentials \
    -d client_id=alert-automation \
    --data-urlencode "client_secret=${secret}" \
    "${token_url}")"
else
  client="demo-cli"
  if [ "${mode}" = "--other-audience" ]; then client="admin-cli"; fi
  password="$(jq -r --arg u "${who}" '.users[] | select(.username == $u) | .credentials[0].value // empty' "${realm_file}")"
  if [ -z "${password}" ]; then
    echo "unknown user '${who}'. Users: $(jq -r '[.users[] | select(.credentials) | .username] | join(", ")' "${realm_file}"); machine client: alert-automation" >&2
    exit 2
  fi
  response="$(curl --silent --show-error --max-time 15 \
    -d grant_type=password \
    -d "client_id=${client}" \
    -d "username=${who}" \
    --data-urlencode "password=${password}" \
    "${token_url}")"
fi

token="$(printf '%s' "${response}" | jq -r '.access_token // empty' 2>/dev/null || true)"
if [ -z "${token}" ]; then
  echo "no token from ${token_url}: ${response}" >&2
  exit 1
fi

if [ "${mode}" = "--claims" ]; then
  # The payload is base64url without padding.
  printf '%s' "${token}" | cut -d. -f2 | tr '_-' '/+' | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d | jq .
else
  printf '%s\n' "${token}"
fi

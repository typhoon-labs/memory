#!/bin/sh
# Can a real MCP client (Claude Code, VS Code, MCP Inspector) sign in to the
# gateway by itself? Walks the steps such a client takes, in order, and says
# for each whether this cluster answers it. Reads only; the sign-in is a real
# one as `developer`, with Keycloak's public client `mcp-client`.
#
# AS FOUND ON 2026-10-06 (Agentgateway 1.6.0, Keycloak 26.7.5): it cannot.
#
#   1. Discovery fails at the first step. Without a token the gateway answers
#      401 with no `WWW-Authenticate: Bearer resource_metadata=...` header, and
#      serves no /.well-known/oauth-protected-resource/mcp/delivery, so a
#      client has nowhere to learn the authorization server from.
#   2. Keycloak's side is ready. Signing in as client `mcp-client`
#      (authorization code, PKCE S256) works with a loopback redirect URI on
#      any port and path, `http://localhost:*` and `http://127.0.0.1:*`; the
#      token carries `aud: agentgateway`, `roles` and `team`, and the gateway
#      accepts it. A redirect URI that is not loopback (a hosted client) is
#      refused, and anonymous client registration at Keycloak is refused
#      ("Trusted Hosts"), which is as it should be.
#
# WHAT IS MISSING, each checked on a scratch copy of the route:
#
#   a. In the route's policy (chart agent-platform/policies/agentgateway/route-auth
#      has no option for it), under `traffic.jwtAuthentication`:
#
#        mcp:
#          provider: Keycloak
#          clientId: mcp-client          # the gateway answers a client's
#                                        # registration request with this id
#          resourceMetadata:
#            resource: http://localhost:18080/mcp/delivery
#            bearerMethodsSupported: [header]
#
#      With it the 401 carries the header, and the gateway serves the
#      protected-resource metadata itself.
#   b. On the HTTPRoute (chart platform/80-routes/mcp-route has one match), two
#      more path matches: /.well-known/oauth-protected-resource/mcp/delivery
#      and /.well-known/oauth-authorization-server/mcp/delivery.
#   c. An issuer address that the gateway's pod can reach. The gateway builds
#      the authorization-server metadata by fetching Keycloak's from the
#      issuer URL, and the issuer is http://localhost:18081/realms/demo, which
#      inside the proxy pod is the pod itself: with (a) and (b) in place the
#      metadata request answers HTTP 500, "authorization_server_metadata
#      error: ... Connection refused" in the proxy's log. Keycloak needs a
#      host name that a browser on this machine and a pod both resolve to it.
#
#   Not verified, because (c) stops the flow: what the gateway returns for the
#   registration request, and a client's run from there to the token.
#
# Until then the backup act uses mcp-client.sh, with a token from
# `task token -- developer`.
set -o nounset
. "$(dirname "$0")/lib.sh"

path="/mcp/delivery"
url="${gateway_url}${path}"
keycloak_url="${KEYCLOAK_URL:-http://localhost:18081}"
issuer="${keycloak_url}/realms/demo"
redirect_uri="http://127.0.0.1:33418/callback"   # nobody listens there: the redirect is read, not followed
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
missing=0
step() { printf '  %-9s %s\n            %s\n' "$1" "$2" "$3"; }
absent() { missing=$((missing + 1)); step missing "$1" "$2"; }

showing "the steps a real MCP client takes to sign in at ${url} by itself, and which of them this cluster answers."

# 1. The 401 must name the resource metadata.
headers="$(curl --silent --max-time 10 --dump-header - --output /dev/null -X POST "${url}" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"oauth-check","version":"1"}}}')"
challenge_header="$(printf '%s' "${headers}" | tr -d '\r' | grep -i '^www-authenticate:.*resource_metadata=' || true)"
if [ -n "${challenge_header}" ]; then
  step ok "1. request without a token" "401 with ${challenge_header}"
else
  absent "1. request without a token" "$(printf '%s' "${headers}" | head -n 1 | tr -d '\r'), but no WWW-Authenticate header naming resource_metadata"
fi

# 2. and 3. The two metadata documents.
number=1
for document in oauth-protected-resource oauth-authorization-server; do
  number=$((number + 1))
  status="$(curl --silent --max-time 10 --output "${work}/${document}.json" --write-out '%{http_code}' "${gateway_url}/.well-known/${document}${path}")"
  if [ "${status}" = "200" ] && jq -e . "${work}/${document}.json" >/dev/null 2>&1; then
    step ok "${number}. GET /.well-known/${document}${path}" "$(jq -c 'with_entries(select(.key | test("^(resource|authorization_servers|issuer|authorization_endpoint|token_endpoint|registration_endpoint)$")))' "${work}/${document}.json")"
  else
    absent "${number}. GET /.well-known/${document}${path}" "HTTP ${status}"
  fi
done

# 4. The sign-in itself, as the client would do it once it knew where: the
#    authorization code grant with PKCE, through Keycloak's login form.
pkce="$(python3 -c 'import base64, hashlib, secrets; v = secrets.token_urlsafe(48); print(v, base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).rstrip(b"=").decode())')"
verifier="${pkce%% *}"; code_challenge="${pkce##* }"
status="$(curl --silent --max-time 20 --cookie-jar "${work}/cookies" --output "${work}/login.html" --write-out '%{http_code}' --get \
  "${issuer}/protocol/openid-connect/auth" \
  --data-urlencode response_type=code --data-urlencode client_id=mcp-client --data-urlencode "redirect_uri=${redirect_uri}" \
  --data-urlencode scope=openid --data-urlencode state=oauth-check --data-urlencode "code_challenge=${code_challenge}" \
  --data-urlencode code_challenge_method=S256 --data-urlencode "resource=${url}")"
action="$(grep -o '<form[^>]*action="[^"]*"' "${work}/login.html" 2>/dev/null | head -n 1 | sed 's/.*action="//; s/"$//; s/&amp;/\&/g')"
password="$(jq -r '.users[] | select(.username == "developer") | .credentials[0].value' "${repo}/local/identity/keycloak/files/demo-realm.json")"
location=""
if [ "${status}" = "200" ] && [ -n "${action}" ]; then
  location="$(curl --silent --max-time 20 --cookie "${work}/cookies" --cookie-jar "${work}/cookies" --output /dev/null --write-out '%{redirect_url}' \
    --data-urlencode username=developer --data-urlencode "password=${password}" "${action}")"
fi
code="$(printf '%s' "${location}" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')"
access_token=""
if [ -n "${code}" ]; then
  access_token="$(curl --silent --max-time 20 "${issuer}/protocol/openid-connect/token" -d grant_type=authorization_code \
    --data-urlencode "code=${code}" --data-urlencode "redirect_uri=${redirect_uri}" --data-urlencode client_id=mcp-client \
    --data-urlencode "code_verifier=${verifier}" | jq -r '.access_token // empty')"
fi
if [ -n "${access_token}" ]; then
  claims="$(printf '%s' "${access_token}" | cut -d. -f2 | tr '_-' '/+' | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d 2>/dev/null | jq -c '{aud, azp, preferred_username, roles, team}')"
  step ok "4. sign-in at Keycloak as client mcp-client (code + PKCE, redirect ${redirect_uri})" "token issued: ${claims}"
  tools="$(curl --silent --max-time 20 -X POST "${url}" -H "authorization: Bearer ${access_token}" -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | sed -n 's/^data: //p' | jq -r '[.result.tools[].name] | join(", ")' 2>/dev/null)"
  if [ -n "${tools}" ]; then
    step ok "5. tools/list at ${url} with that token" "${tools}"
  else
    absent "5. tools/list at ${url} with that token" "the gateway did not accept the token"
  fi
else
  absent "4. sign-in at Keycloak as client mcp-client (code + PKCE, redirect ${redirect_uri})" "no token (authorize answered HTTP ${status})"
fi

if [ "${missing}" -eq 0 ]; then
  echo "Result: every step is answered; a real MCP client should be able to sign in by itself. Try one."
else
  echo "Result: a real MCP client cannot sign in by itself yet: ${missing} step(s) are missing. What to add is at the top of demo/backup/mcp-oauth-check.sh. Until then: task demo:backup:mcp-client"
fi

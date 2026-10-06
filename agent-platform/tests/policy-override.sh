#!/bin/sh
# Denied path: a team weakens a platform gateway rule from its own namespace
# rights, without touching the platform's policy.
#
#   denied     three resources, applied with kubectl as anyone but a platform
#              release would: a policy on the platform's route that makes the
#              token optional, a second route to the tool server, and a
#              backend that names it. Kyverno refuses each at admission
#              (policies gateway-policy-targets, gateway-route-claims and
#              gateway-backend-destinations).
#   governed   the platform's own policy, as its release applies it, is
#              admitted; a team's policy on a route of its own is admitted;
#              and the route still refuses a caller without a token.
#
# The three attempts are real `kubectl apply` calls. If one is admitted, this
# script deletes what it created and says so. The governed half uses
# server-side dry runs, which pass through admission and change nothing.
set -o nounset
. "$(dirname "$0")/lib.sh"

namespace="tools"
route="delivery-mcp"
release="delivery-mcp-route-auth"

# attempt <what it is> <kind/name> <manifest>: apply; expect a refusal by admission.
# The first refusal is printed whole; of the others, the sentence that says why.
shown=0
attempt() {
  what="$1"; object="$2"; manifest="$3"
  output="$(printf '%s\n' "${manifest}" | k apply --filename - 2>&1)"
  message="$(printf '%s\n' "${output}" | sed -n 's/.*denied the request: Policy [a-z-]* failed: //p')"
  if [ -n "${message}" ]; then
    if [ "${shown}" -eq 0 ]; then
      shown=1
      line denied "${what}" "refused at admission, with this message:"
      printf '%s\n' "${message}" | fold -s -w 92 | sed 's/^/              /'
    else
      line denied "${what}" "refused at admission: $(printf '%s' "${message}" | sed 's/\. .*/./')"
    fi
  elif k --namespace "${namespace}" get "${object}" >/dev/null 2>&1; then
    k --namespace "${namespace}" delete "${object}" --wait=true >/dev/null 2>&1
    unexpected "${what} was admitted (and has been deleted again). Are releases kyverno and gateway-rules applied?"
  else
    unexpected "${what}: neither refused by admission nor created: ${output}"
  fi
}

showing "kubectl apply of a gateway policy that makes the token optional on the platform's route ${namespace}/${route}, and of two ways around that route."

attempt "a policy on route ${route}: token optional" "agentgatewaypolicy/token-optional" "
apiVersion: agentgateway.dev/v1alpha1
kind: AgentgatewayPolicy
metadata:
  name: token-optional
  namespace: ${namespace}
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: ${route}
  traffic:
    jwtAuthentication:
      mode: Optional
      providers:
        - issuer: http://localhost:18081/realms/demo
          audiences: [agentgateway]
          jwks:
            remote:
              url: http://keycloak.keycloak.svc.cluster.local:8080/realms/demo/protocol/openid-connect/certs
"

attempt "a second route to Service delivery-mcp" "httproute/side-door" "
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: side-door
  namespace: ${namespace}
spec:
  parentRefs:
    - name: agentgateway-proxy
      namespace: agentgateway-system
      sectionName: http
  rules:
    - matches:
        - path: {type: PathPrefix, value: /side-door}
      backendRefs:
        - name: delivery-mcp
          port: 8080
"

attempt "a backend that names delivery-mcp's address" "agentgatewaybackend/side-door" "
apiVersion: agentgateway.dev/v1alpha1
kind: AgentgatewayBackend
metadata:
  name: side-door
  namespace: ${namespace}
spec:
  static:
    host: delivery-mcp.tools.svc.cluster.local
    port: 8080
"

# The platform's own policy, exactly as its release holds it.
output="$(h get manifest "${release}" --namespace "${namespace}" 2>/dev/null | k apply --dry-run=server --filename - 2>&1)"
if printf '%s' "${output}" | grep -q '(server dry run)'; then
  line governed "the platform's policy, from release ${release}" "admitted"
else
  unexpected "the platform's own policy from release ${release} is not admitted: ${output}"
fi

# A team's policy on a route of its own, in a namespace of its own.
output="$(k apply --dry-run=server --filename - 2>&1 <<'MANIFEST'
apiVersion: agentgateway.dev/v1alpha1
kind: AgentgatewayPolicy
metadata:
  name: team-route-timeouts
  namespace: default
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: team-route
  traffic:
    timeouts:
      request: 30s
MANIFEST
)"
if printf '%s' "${output}" | grep -q '(server dry run)'; then
  line governed "a team's policy on its own route" "admitted"
else
  unexpected "a team's policy on its own route is not admitted, so the rule is wider than it should be: ${output}"
fi

status="$(curl --silent --output /dev/null --max-time 10 --write-out '%{http_code}' -X POST "${gateway_url}/mcp/delivery" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
if [ "${status}" = "401" ]; then
  line governed "${gateway_url}/mcp/delivery, no token" "HTTP 401: the platform's rule stands"
else
  unexpected "${gateway_url}/mcp/delivery without a token answered ${status}, not 401"
fi

result "all three attempts refused at admission; the platform's own policy and a team's own are admitted."

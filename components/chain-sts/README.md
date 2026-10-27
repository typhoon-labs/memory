# chain-sts

A token exchange service that records every agent a request passed through.
An agent gives it the user's token and its own Kubernetes service-account
token, and gets back a token for the same user that names that agent and every
agent before it. A tool reached through two agents can then tell, from the
token alone and with a signature it can check, who the user is and who acted
for them:

    platform-engineer → chat-assistant → remediation-agent → delivery-mcp

RFC 8693 delegation, and nothing else.

**Deployed in the dev cluster, where `chat-assistant`, `remediation-agent`
and `comms-agent` exchange their caller's token.** It runs at
`http://chain-sts.chain-sts.svc.cluster.local`, two replicas of 0.1.2, with
the TokenReview actor check and a ClusterRole that allows only that: release
`chain-sts` in
[`90-chain-sts`](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md),
chart [`agent-platform/charts/chain-sts`](../../agent-platform/charts/chain-sts/values.yaml).
Its signing key has been rotated there under load
([The rotation run in this cluster](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#the-rotation-run-in-this-cluster)).
The gateway trusts its tokens, and so do three of the services behind it,
which verify a caller's token themselves: `delivery-mcp`, `remediation-agent`
and `comms-agent`, since 0.1.2, with `DELEGATION_ISSUER` and
`DELEGATION_JWKS_URL` bound in their releases. Every pod of namespaces `agents` and `tools` can
reach it on its container's port (`delegation` in the boundaries in
[`80-policies`](../../agent-deployments/clusters/dev/platform/80-policies/helmfile.yaml)),
and its own NetworkPolicy lets in those two namespaces and
`agentgateway-system`.

**Who exchanges here.** `chat-assistant` since 0.1.10, and
`remediation-agent` and `comms-agent` since 0.1.3, with
`DELEGATION_METADATA_URL` (this service's metadata) and
`DELEGATION_ACTOR_TOKEN_FILE` set in their releases. Each pod mounts a token
of its own ServiceAccount for the audience `chain-sts`, valid 600 seconds, at
`/var/run/secrets/chain-sts/token`, through `projectedToken` in the shared
chart [`agent-platform/charts/agent`](../../agent-platform/charts/agent/values.yaml);
no RBAC is involved. None of them sends its caller's own token on: not to
`delivery-mcp`, not to the model route, not to another agent. A refused or
failed exchange stops the call, and nothing goes downstream. The chains the
dev cluster sees:

| Caller | Chain in the token sent on |
|---|---|
| A user, through the Chat UI or `/a2a/chat-assistant` | `[chat-assistant]` |
| Alertmanager at `/hooks/alert`, as `alert-automation` (`user` in the audit line: `service-account-alert-automation`) | `[chat-assistant]` |
| A user's Apply or Draft button on the card, which `chat-assistant` hands to `remediation-agent` or `comms-agent` | `[remediation-agent, chat-assistant]`, `[comms-agent, chat-assistant]` |
| A user who calls `/a2a/remediation-agent` or `/a2a/comms-agent` directly, as `demo/scenarios/drive.py` and `demo/backup/registry-down.sh` do | `[remediation-agent]`, `[comms-agent]` |
| `chat-assistant` asking `diagnosis-agent` | `[chat-assistant]`, at `/a2a/diagnosis-agent`. `diagnosis-agent` does not exchange: it calls its tools with credentials of its own, and the alert hook records its diagnosis with the hook's token (see Agent Substrate under [What is not done](#what-is-not-done)) |

See [What is not done](#what-is-not-done).

| | |
|---|---|
| Built with | Starlette and uvicorn, Python 3.13 |
| Serves | HTTP on container port 8080 |
| Speaks | RFC 8693 token exchange, as kagent's STS clients send it |
| Configuration | One YAML file, [`config.example.yaml`](config.example.yaml), kept in Git |

## Why

Before this service one Keycloak token was forwarded unchanged at every hop
(as [`docs/contracts.md`](../../docs/contracts.md) still says: "Each hop
forwards the caller's bearer token"). Every log named the user, and nothing
signed named an agent. Keycloak 26.8's delegation (a preview feature) records
one agent and no more: checked on a throwaway Keycloak 26.8.1 with the demo
realm, a token that already carries `act` cannot be exchanged again. This
service records the whole chain. Okta for AI Agents nests `act` in the same
way; basic Okta cannot issue tokens with our audience and claims at all. Cost
and capability against Okta for AI Agents, with dated sources and the
estimates marked as such:
[`docs/okta-comparison.md`](docs/okta-comparison.md).

## What it serves

| Path | |
|---|---|
| `GET /.well-known/oauth-authorization-server`, `GET /.well-known/openid-configuration` | Metadata: `issuer`, `token_endpoint`, `jwks_uri`, `grant_types_supported`, and `token_endpoint_auth_methods_supported: ["none"]` |
| `GET /jwks` | The public keys: the one that signs every token, and during a rotation the next or the previous one ([The signing keys](#the-signing-keys)) |
| `POST /token` | The exchange |
| `GET /healthz` | Liveness, and `keys`: the `kid` of the key that signs, and of the next or previous one |

`token_endpoint` (`<public_url>/token`) and `jwks_uri` (`<public_url>/jwks`)
come from the configuration, never from the request: kagent's Go client uses
`token_endpoint` as it is. Any other path answers 404 `{"error": "not_found"}`.

## The protocol

`POST /token` with a form (`application/x-www-form-urlencoded`), or a JSON
object, as kagent's own mock STS takes. No client authentication: the actor's
token is the credential.

| Parameter | |
|---|---|
| `grant_type` | `urn:ietf:params:oauth:grant-type:token-exchange` |
| `subject_token` | Required. A user's token from a trusted identity provider, or a token this service issued |
| `subject_token_type` | `urn:ietf:params:oauth:token-type:jwt`, which kagent sends, or `urn:ietf:params:oauth:token-type:access_token`. Both name a JWT here |
| `actor_token` | Required. The calling agent's Kubernetes service-account token |
| `actor_token_type` | As `subject_token_type` |
| `audience`, `resource` | Optional, may repeat. kagent sends `KAGENT_STS_AUDIENCE` and `KAGENT_STS_RESOURCE` as these. Each must be in `audiences`; a value given as both counts once. Without either, the first of `audiences` |
| `requested_token_type` | Optional. Only an access token is issued |

The answer is 200 with `access_token`, `issued_token_type`
(`urn:ietf:params:oauth:token-type:access_token`), `token_type: Bearer` and
`expires_in`. A refusal is `{"error", "error_description"}` (RFC 6749,
section 5.2), which both kagent clients parse. Both carry
`Cache-Control: no-store`.

## The rules

The actor's token is checked first, then the agent it names, then the
subject's token. A caller that is not a known agent learns nothing about a
user's token.

| Situation | `error` | HTTP |
|---|---|---|
| Not token exchange | `unsupported_grant_type` | 400 |
| A required parameter missing, a token type not accepted, or a single-valued parameter given twice; a body that is neither a form nor a JSON object, or over 64 KiB | `invalid_request` | 400 |
| No actor token (kagent sends none when the pod has no token file) | `invalid_request` | 400 |
| Actor token does not verify: signature, issuer, expiry, audience; with a TokenReview also a pod that is gone | `invalid_request` | 400 |
| Actor's service account not in `agents` | `unauthorized_client` | 400 |
| Subject from an issuer not trusted, or does not verify | `invalid_request` | 400 |
| A user's token for none of the audiences the agent may exchange (its `subject_audiences`, else the identity provider's `audience`) | `invalid_request` | 400 |
| A user's token, and the agent lacks `act_for_users` | `unauthorized_client` | 400 |
| A user's token with `may_act` that does not name the agent | `invalid_request` | 400 |
| A user's token without `may_act`, and `require_may_act` is on | `invalid_request` | 400 |
| An identity provider's token that already carries `act` | `invalid_request` | 400 |
| This service's token, whose newest agent is not in the agent's `after` | `unauthorized_client` | 400 |
| This service's token, whose newest agent is not in `agents` | `invalid_request` | 400 |
| The agent is already in the chain | `unauthorized_client` | 400 |
| The chain would exceed `max_chain` | `unauthorized_client` | 400 |
| Audience or resource not in `audiences` | `invalid_target` | 400 |
| A subject that expired less than 30 seconds ago (the clock skew allowed), so the new token would be born expired | `invalid_request` | 400 |
| The keys of the identity provider or the cluster cannot be fetched, or the API server cannot answer a TokenReview | `temporarily_unavailable` | 503 |
| Anything unexpected | `server_error` | 500 |

A 503 says the token could not be checked now, not that it is bad, so a client
may retry.

`may_act` matches when its `sub` is the agent's service account (kagent's
convention) or its `client_id` is the agent's name (Keycloak's). It is the
user's word about the first agent and is not carried on. Keycloak writes
`may_act` only through consent, which `task token` cannot give, so
`require_may_act` is off and `agents` decides the first agent.

## The token

| Claim | Value |
|---|---|
| `iss` | `issuer` from the configuration |
| `sub` | The user's `sub`, unchanged along the chain |
| `aud` | The requested audience, else the first of `audiences` (`agentgateway`) |
| `iat`, `nbf` | Now |
| `exp` | The earlier of the subject token's `exp` and now plus `token_ttl_seconds` (300) |
| `jti` | New for every token; in the audit line |
| `client_id` | The agent that asked |
| `act` | `{sub: <service account>, client_id: <agent>}`, with the previous `act` nested inside |
| `preferred_username`, `roles`, `team`, `email`, `name` | Copied from the subject token when present (`carry_claims`), so they travel the whole chain |

User → `chat-assistant` → `remediation-agent`, as `delivery-mcp` receives it:

```json
{
  "iss": "http://chain-sts.chain-sts.svc.cluster.local",
  "sub": "080c76ff-f0c1-434e-9fad-2da546fa9f05",
  "aud": "agentgateway",
  "exp": 1792478089,
  "jti": "5c0e…",
  "client_id": "remediation-agent",
  "preferred_username": "platform-engineer",
  "roles": ["platform-engineer"],
  "team": "platform",
  "act": {
    "sub": "system:serviceaccount:agents:remediation-agent",
    "client_id": "remediation-agent",
    "act": {
      "sub": "system:serviceaccount:agents:chat-assistant",
      "client_id": "chat-assistant"
    }
  }
}
```

The outermost `act` is the agent calling now. Per RFC 8693 only it and the
top-level claims should drive a decision; the inner ones are the record.
Verifiers that read the user from `preferred_username`, `roles` and `team`
keep working.

## Where the chain is checked and recorded

**At the gateway.** Every route that takes a user's token also has a rule on
the newest actor: a token without `act` (a person's or the alert's own) is
decided by the route's roles alone, and a token with `act` is let in only
when this service signed it and its `act.sub` is an agent the route expects.
The CEL is `!has(jwt.act) || (jwt.iss == "<this issuer>" && jwt.act.sub in
[...])`, written by `actors` in the chart
[`route-auth`](../../agent-platform/policies/agentgateway/route-auth/values.yaml)
and per tool by `toolActors` in
[`mcp-route`](../../agent-platform/profiles/gateway/mcp-route/values.yaml),
with agent names from `delegation.agents` in
[`identity.yaml`](../../agent-deployments/clusters/dev/identity.yaml). In
Agentgateway 1.6.0 `has(jwt.act)` is false when the claim is absent, and
`jwt.act.sub` on such a token is an error, which counts as false; both
branches were run. The dev cluster expects, from the agents' code and
delivery-mcp's audit lines:

| Route | Newest actor allowed |
|---|---|
| `/a2a/remediation-agent`, `/a2a/comms-agent`, `/a2a/diagnosis-agent` | `chat-assistant` |
| `/mcp/delivery`: `list_incidents`, `get_incident` | `chat-assistant`, `remediation-agent`, `comms-agent` |
| `/mcp/delivery`: `open_incident`, `record_diagnosis`, `propose_change`, `approve_change`, `reject_change`, `restart_workload`, `post_status_update` | `chat-assistant` (the alert hook and the card's buttons; `comms-agent` drafts and never posts) |
| `/mcp/delivery`: `apply_change` | `remediation-agent` |
| `/v1/messages`, `/v1/chat/completions`, `/v1/models` | `chat-assistant`, `remediation-agent`, `comms-agent` |
| `/a2a/chat-assistant`, `/hooks/alert`, `/mcp/observability` | none: a token with `act` is refused |

A refusal is the route's usual one: 403 on an agent's route, a tool missing
from `tools/list` and "Unknown tool" on `/mcp/delivery`. `chat-assistant`
itself refuses a token with `act` too (403, since 0.1.11).

**The Chat UI's sign-in** (Keycloak client `chat-ui`) carries the audience
`chat-assistant`, which only `/a2a/chat-assistant` accepts besides
`agentgateway`, and which only `chat-assistant` may exchange here
(`subject_audiences`). The user's token from the browser therefore works at
the assistant and nowhere else; what goes further is a token this service
issued. `task token` (client `demo-cli`) keeps `agentgateway`.

**In the logs and records.** The gateway's access log lines and spans carry
`user.id`, `actor.sub` (the newest actor) and `actor.chain` (every agent,
newest first, to a depth of 4), from
[`gateway-telemetry`](../../agent-platform/profiles/gateway/telemetry/values.yaml).
`delivery-mcp` (0.1.3) writes the chain next to the user in its audit lines
and in everything it records: `opened_via`, `applied_via`, a history entry's
`via` and so on.

**Checked, and drilled, in the dev cluster.** `task sts:check` runs three
checks in [`agent-platform/tests`](../../agent-platform/tests/README.md), each
refusal next to the allowed exchange or request beside it:
`chain-gateway.sh` (a chain token replayed where another agent or none is
expected, a Chat UI sign-in past `chat-assistant`, a forged token),
`chain-exchange.sh` (every actor, order, length and subject rule of
[The rules](#the-rules) that the dev policy can reach, `max_chain` on a test
instance, and a token bound to a deleted pod) and `chain-network.sh` (who
reaches this service). `task demo:chain` follows one Apply from a Chat UI
sign-in through `chat-assistant`, `remediation-agent` and `delivery-mcp` and
prints, side by side, this service's audit lines, the gateway's access log
lines for the request's trace, `delivery-mcp`'s audit lines and
`applied_via`, and a decoded token of the same chain.
`task demo:backup:sts-down` scales this service to zero, shows the agents
fail closed with nothing reaching `delivery-mcp`, and puts back the release's
two replicas.

## The policy

[`config.example.yaml`](config.example.yaml) describes every key. The dev
cluster's agents, and who may follow whom, are in
[`policy.yaml`](../../agent-deployments/clusters/dev/platform/90-chain-sts/policy.yaml):

```yaml
agents:
  chat-assistant:
    service_account: system:serviceaccount:agents:chat-assistant
    act_for_users: true            # may be the first agent, on a user's own token
    subject_audiences: [agentgateway, chat-assistant]   # a user's token for either
  remediation-agent:
    service_account: system:serviceaccount:agents:remediation-agent
    act_for_users: true            # a user who calls it directly through its route
    after: [chat-assistant]        # may exchange a token whose newest agent is one of these
  comms-agent:
    service_account: system:serviceaccount:agents:comms-agent
    act_for_users: true
    after: [chat-assistant]
max_chain: 4
require_may_act: false
```

`remediation-agent` and `comms-agent` act for a user in two ways. Handed a
button by `chat-assistant`, they exchange the token it got, and the chain is
`[<agent>, chat-assistant]`. Called directly by a user through their gateway
routes (the route lets in only `platform-engineer`, and only
`incident-manager`, respectively), they exchange the user's own token, and the
chain is `[<agent>]`. Without `act_for_users` that second call is refused
(`unauthorized_client`) and the agent's task fails. `config.example.yaml`,
which the tests start from, keeps the stricter rule: there the two may only
follow `chat-assistant`.

**Whose tokens an agent may exchange.** A user's own token must carry an
audience the agent may exchange: its `subject_audiences`, else the identity
provider's `audience` (`agentgateway`). Only `chat-assistant` names another:
`chat-assistant`, the audience of a Chat UI sign-in (Keycloak client
`chat-ui`), which no route but `/a2a/chat-assistant` accepts. Handed such a
token, `remediation-agent` and `comms-agent` are refused (`invalid_request`,
`InvalidAudienceError`), so a Chat UI token goes no further than
`chat-assistant`, not even through this service. This service's own tokens
keep its `audiences`, whichever agent exchanges them.

`alert-automation`'s token, a client-credentials token from the same Keycloak
with the audience `agentgateway`, is a user's token here: `chat-assistant`'s
`act_for_users` covers the alert hook, and no rule names the machine client.

A key the service does not know stops it from starting, so a misspelled rule
is never ignored. `carry_claims` cannot name a claim the service sets itself.
A relative path is relative to the file.

## The actor

The actor is proven by its Kubernetes service-account token. Agents hold no
secret for this service. `actor.verify_with` chooses how the token is checked:

- **`token_review`** (the default). The service asks the API server: `POST
  /apis/authentication.k8s.io/v1/tokenreviews` with `spec.audiences` set to
  `actor.audiences`. Its own bearer is the pod's token at
  `/var/run/secrets/kubernetes.io/serviceaccount/token`, read again for each
  review, and the API server's certificate is checked against the CA next to
  it. The API server's address comes from `KUBERNETES_SERVICE_HOST` and
  `KUBERNETES_SERVICE_PORT`. The actor is accepted when the review says
  authenticated, names a service account, and confirms an audience the
  service asked for. The API server also refuses a bound token whose pod is
  gone. One review per exchange; nothing is cached. The service's account
  needs `create` on `tokenreviews` (`authentication.k8s.io`) and nothing
  else: in the dev cluster the ClusterRole `chain-sts-token-review`, which
  the chart makes. The built-in `system:auth-delegator` would also do, but
  allows `subjectaccessreviews` too.
- **`jwks`**, for development. The token is checked here against the
  cluster's issuer and keys, from a file (`kubectl get --raw
  /openid/v1/jwks`, read once at start) or a URL. A token stays valid until it
  expires, even when its pod is gone. The API server serves its keys at
  `/openid/v1/jwks` over its own CA and only to an authenticated caller, so
  for that URL `actor.jwks.token_file` and `ca_file` name the pod's own token,
  sent as the bearer of each fetch and read again each time, and the
  cluster's CA. Every service account may read the keys (the default
  ClusterRoleBinding `system:service-account-issuer-discovery`), so this needs
  no RBAC of the service's own.

**The actor's audience.** `actor.audiences` is `[chain-sts]` by default: a
projected service-account token minted for this service alone, which an agent
mounts as a file of its own. The API server's audience
(`https://kubernetes.default.svc.cluster.local` on kind) is off by default. It
is the audience of the token mounted in every pod, which the agent also uses
for the API server and which anything that receives it can replay. Accepted
here, anyone who holds an agent's mounted token can act as that agent. Add it
only for agents that cannot choose the token file they send: stock kagent's
Go runtime always sends the default one. kagent's Python client
(`agentsts-core`) takes `service_account_token_path`, so it can send a
`chain-sts` token.

## The signing keys

An RSA key (PEM, unencrypted, at least 2048 bits) signs every token with
RS256. It is read from a file, mounted from a Secret, and every replica has
the same keys. A key's `kid` is its JWK thumbprint (RFC 7638), so the same key
always has the same `kid`. `/jwks` publishes every key the service holds, the
one that signs first. The start line (`signing with kid ...`, with `keys`) and
`/healthz` (`keys`: the kid of each role) say which key does what; no private
key is ever logged or served.

One key, as the dev cluster runs it between rotations:

```yaml
signing_key_file: /etc/chain-sts/signing-key/key.pem
```

Several, for a rotation: `signing_keys` instead, every key by name and the
role of each.

```yaml
signing_keys:
  files:
    chain-sts-signing-key: /etc/chain-sts/previous-key/key.pem
    chain-sts-signing-key-2: /etc/chain-sts/signing-key/key.pem
  sign: chain-sts-signing-key-2       # signs every token
  previous: chain-sts-signing-key     # published until its last token has expired
  # next: <name>                      # published before it signs
```

The service refuses to start when no key signs (`sign`), a role names a key
that `files` lacks, two roles name one key, a key in `files` has no role, or
two files hold the same key. A token this service issued is checked, as a
subject, against the key its `kid` names: during a rollout a replica that
still signs with the old key accepts a token from one that signs with the new
key, and the other way around.

A new key, and the `kid` of a key, from `python -m chain_sts.rotate` (in the
image too; nothing it does reaches a cluster):

```sh
PYTHONPATH=src .venv/bin/python -m chain_sts.rotate new-key > key.pem   # its kid on standard error; never to a terminal
PYTHONPATH=src .venv/bin/python -m chain_sts.rotate kid key.pem         # the kid /jwks shows for it
PYTHONPATH=src .venv/bin/python -m chain_sts.rotate steps               # the rotation below, with its waits
```

`openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048` makes the same
kind of key. `*.pem` is git-ignored.

**In the chart.** One Secret per key, each with the PEM in `key.pem`:
`signingKey.secretName` is the Secret of the key that signs, and
`signingKey.next` and `signingKey.previous` name the others, mounted at
`/etc/chain-sts/next-key` and `/etc/chain-sts/previous-key`. With both
empty the chart writes `signing_key_file`, as before; with either set, it
writes `signing_keys`, each key named after its Secret. One Secret per key,
and not several keys in one Secret, so that a rotation never writes to the
Secret of a key in use: the new key's Secret is created beside the old one
with `kubectl create`, which fails rather than replace anything, and the old
one is deleted at the end. A Secret or key that does not exist keeps a new pod
from starting, so the old pods go on serving.

### What the verifiers do

Who checks chain-sts's tokens against `/jwks`, how each learns a new key, and
how long each still accepts a token after its `exp`:

| Verifier | Learns a new `kid` | Leeway |
|---|---|---|
| Agentgateway 1.6.0, on every route that trusts `delegation` | Its controller fetches `/jwks` again `cacheDuration` after each successful fetch: `5m` in `route-auth` and in `observability-mcp`'s route, which is also the default and the least the field allows. It stores the keys in a ConfigMap in `agentgateway-system` (label `app.kubernetes.io/component=jwks-store`) and writes them inline into the proxy's configuration. A failed fetch is retried after 200 ms, doubling up to 15 s, and the keys it has stay in use. The proxy never fetches: a token whose `kid` it lacks is refused (401) | 60 s on `exp` and `nbf` |
| `remediation-agent`, `comms-agent`: PyJWT 2.15.1's `PyJWKClient` with `cache_keys=True`, `lifespan=3600` | On a `kid` it lacks it fetches again, but not within 30 s (`cooldown_duration`) of its last successful fetch; else it refuses the token | 30 s |
| `delivery-mcp`: FastMCP 3.4.8's `JWTVerifier` | On a `kid` it lacks it fetches again at once; else every hour | 30 s for `nbf`, none for `exp` |
| chain-sts itself, for its own tokens as a subject | Its configuration | 30 s |

So the gateway is the slowest to learn a key, and the most lenient with an
expired token. Sources: Agentgateway's API reference for `RemoteJWKS`
(<https://agentgateway.dev/docs/kubernetes/latest/reference/api/>: "How long a
fetched `jwks` document is used before it is re-fetched from the IdP.
Defaults to `5m`"), and its source at v1.6.0
(<https://github.com/agentgateway/agentgateway/tree/v1.6.0>):
`controller/api/v1alpha1/agentgateway/agentgateway_policy_types.go` (the
`cacheDuration` field and its minimum of 5m),
`controller/pkg/agentgateway/jwks/fetcher.go` (the schedule and the
retries), `jwks/persistence.go` and `jwks/lookup.go` (the ConfigMap, and the
keys written inline), and `crates/agentgateway/src/http/jwt.rs` (a `kid` is
required and looked up, no fetch; `Validation::new`, whose leeway in
jsonwebtoken 11.1.0 is 60 s,
<https://docs.rs/jsonwebtoken/11.1.0/jsonwebtoken/struct.Validation.html>).
PyJWT: `PyJWKClient`'s docstring in 2.15.1
(<https://github.com/jpadilla/pyjwt/blob/2.15.1/jwt/jwks_client.py>: "Unknown
key IDs can trigger one forced refresh after the cooldown period configured
by `cooldown_duration`", 30 s by default). FastMCP:
`fastmcp/server/auth/providers/jwt.py` in 3.4.8, `JWTVerifier._get_jwks_key`.
The leeways of the Python services are their `CLOCK_SKEW_SECONDS`.

### Rotating the key

**In the dev cluster** each step is a task, `task sts:rotate:new`,
`sts:rotate:promote` and `sts:rotate:drop`, with `task sts:rotate:check` for
the waits; which Secret signs is a label on the Secrets, not a value in Git,
and each task refuses to run early. The runbook, and the rotation run there
on 2026-10-21 with no failed request, are in
[the release's README](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#rotating-the-key).
Below, the steps as chart values, for any cluster.

Every step is a change to the release's values and a sync, and each rolls the
pods. A stopping pod serves on for `preStopSleepSeconds` (5) before it gets
SIGTERM, until the Service no longer sends it connections: without that, the
rollout to 0.1.2 refused one exchange. With the Deployment's defaults (25%,
rounded down for `maxUnavailable` and up for `maxSurge`) one or two replicas
get a new pod ready before an old one stops, so for a while old and new
replicas answer side by side; each step is safe with both. The waits count
from the end of the rollout (`kubectl rollout status`), and are what `python
-m chain_sts.rotate steps` prints for a token lifetime of 300 s:

1. **Publish the next key.** Create its Secret beside the old one, as the
   old one was made (in the dev cluster `task sts:rotate:new` does this
   step, labels included):

   ```sh
   PYTHONPATH=src .venv/bin/python -m chain_sts.rotate new-key |
     kubectl -n chain-sts create secret generic chain-sts-signing-key-2 --from-file=key.pem=/dev/stdin
   ```

   Then `signingKey.next: chain-sts-signing-key-2`. `/jwks` lists the new
   `kid` after the one that signs.
2. **Wait at least 6 minutes**, the gateway's 5-minute refresh and a minute
   for the controller to store and push the keys, a retried fetch, and a
   stopping pod. The Python services would have it after 30 s. Before going
   on, check that the gateway has it:
   `kubectl -n agentgateway-system get configmap -l
   app.kubernetes.io/component=jwks-store -o yaml | grep <new kid>`.
3. **Promote it:** `signingKey.secretName: chain-sts-signing-key-2`,
   `signingKey.previous: chain-sts-signing-key`, `signingKey.next: ""`.
   Every pod's `/healthz` then says `keys.signing` is the new `kid`.
4. **Wait at least 7 minutes**: a token the old key signed lives at most
   `token_ttl_seconds` (300; never longer than its subject), the gateway
   accepts it 60 s past `exp`, and a minute's margin.
5. **Drop the old key:** `signingKey.previous: ""`, and once that rollout is
   done, delete Secret `chain-sts-signing-key`.

Skipping step 1 is what fails: a replica that signs with a key nobody has
seen makes the gateway refuse its tokens until its next fetch, up to 5
minutes, and `PyJWKClient` refuse them for up to 30 s
(`tests/test_rotation.py` shows the second).

**A key that leaked** cannot wait for this. Make the new key sign at once,
with no `previous`: every token the old key signed fails from then on, and so
do the new key's tokens at the gateway until its next fetch, up to 5
minutes. Restart `remediation-agent` and `comms-agent` too: their
`PyJWKClient` keeps every key it has used (`cache_keys`) until the process
ends, whatever `/jwks` says. A token is a bearer token until its `exp`, so
the old key's tokens stay usable elsewhere for up to `token_ttl_seconds`.

### Several replicas

The replicas share the keys and keep no state, so each verifies every other's
tokens, and the chart runs `replicas` of them (1 by default; the dev cluster
runs two). With more than one it adds a PodDisruptionBudget,
`maxUnavailable: 1` (`podDisruptionBudget.maxUnavailable`), with
`unhealthyPodEvictionPolicy: AlwaysAllow`, as Kubernetes recommends
(<https://kubernetes.io/docs/concepts/workloads/pods/disruptions/>), so that
a pod that is not ready cannot block a node drain. A budget covers only
voluntary evictions: against a node that fails, the pods must be on different
nodes, which the scheduler's default spreading prefers but does not enforce;
in production a `topologySpreadConstraints` across zones would. Each rotation
step rolls every replica, and the procedure above is built for the overlap.

In the dev cluster, with exchanges every 3 s (two per round, then the
gateway and `delivery-mcp`): the scale to two, `kubectl delete pod` of one
pod, and an eviction of another cost no request (32 rounds); a second
eviction right after the first was refused by the budget (429) until the
replacement was ready; both pods sign with the same kid. A deleted pod
bypasses the budget; the preStop sleep is what keeps it from dropping
connections. Both pods run on kind's one node.

### Signing in a KMS

Signing is behind `Signer` in [`keys.py`](src/chain_sts/keys.py): `kid`,
`alg`, `public_jwk()` and `sign(message) -> signature`. The service builds the
token itself (the JWS header `alg`, `typ`, `kid`, and the claims, each
base64url-encoded) and asks the signer for the signature over
`<header>.<claims>`. At start, `KeySet` asks each key once for its public
JWK, checks that its `kid` is the thumbprint and its `alg` RS256, and
publishes it. The file key (`FileSigner`) is the only implementation; the
demo has no KMS. One for a KMS would:

- **Hold no private key.** At start it fetches the key version's public key
  once, computes the `kid` from it, and keeps the JWK: AWS KMS `GetPublicKey`
  (DER SubjectPublicKeyInfo), Cloud KMS `getPublicKey` (PEM), Vault Transit
  `GET /transit/keys/:name`.
- **Sign with the KMS's asymmetric sign call**, over the SHA-256 of the
  message: AWS KMS `Sign` with `SigningAlgorithm` `RSASSA_PKCS1_V1_5_SHA_256`
  and `MessageType` `DIGEST` (a key of spec `RSA_2048`, usage `SIGN_VERIFY`);
  Cloud KMS `asymmetricSign` on a version of algorithm
  `RSA_SIGN_PKCS1_2048_SHA256`, with `digest.sha256`; Vault Transit `POST
  /transit/sign/:name/sha2-256` with `signature_algorithm: pkcs1v15` (the
  default is PSS), `prehashed: true` and `key_version` set, then the
  signature without its `vault:v<n>:` prefix, from standard base64.
- **Stay RS256.** `delivery-mcp` and the agents accept RS256 only, and so does
  the service for its own tokens. ES256 would mean changing every verifier,
  and all three APIs return an ECDSA signature DER-encoded, which JWS needs
  as R‖S (RFC 7518, section 3.4).
- **Be named in the configuration** as a key version beside `files`; the
  roles `sign`, `next` and `previous` stay as they are.
- **Be called off the event loop.** `sign` is synchronous; a network call
  belongs in a worker thread (`asyncio.to_thread`), as the subject's key
  lookup does, and a KMS that does not answer is then `temporarily_unavailable`.
- **Run with the pod's own cloud identity** (EKS Pod Identity or IRSA, GKE
  Workload Identity, Vault's Kubernetes auth), allowed only to sign with and
  read the public key of these keys.

With a KMS a rotation is the same three steps, with key versions instead of
Secrets: the key never leaves the KMS, so there is no Secret to create or
delete. Cloud KMS: a new version of the same key; Vault Transit: `POST
/transit/keys/:name/rotate`; AWS KMS: no rotation of asymmetric keys at all,
so a new key, with an alias moved by hand. The service must sign with a
version named in its configuration, never "the latest": a rotation in the
KMS would otherwise make it sign with a key no verifier has. Sources:
<https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html>,
<https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html>,
<https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html>,
<https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/asymmetricSign>,
<https://docs.cloud.google.com/kms/docs/key-rotation>,
<https://developer.hashicorp.com/vault/api-docs/secret/transit>.

## Logs and audit

Every line is JSON on standard error: `time`, `level`, `logger`, `message`,
and `exception` when there is one. Uvicorn's lines go the same way.

Each decision writes one line to the logger `chain_sts.audit`:

| Field | Issued | Refused |
|---|---|---|
| `event` | `token_exchange` | `token_exchange` |
| `outcome` | `issued` | `refused` |
| `jti`, `aud`, `exp` | Of the new token | |
| `user` | `preferred_username`, else `sub` | When the subject verified |
| `chain` | Agent names, newest first | |
| `agent`, `service_account` | | When the actor verified |
| `error`, `reason` | | The error code and description |

```json
{"time": "2026-10-20T19:58:03.114Z", "level": "INFO", "logger": "chain_sts.audit", "message": "token exchange issued", "event": "token_exchange", "outcome": "issued", "jti": "5c0e…", "user": "platform-engineer", "chain": ["remediation-agent", "chat-assistant"], "aud": "agentgateway", "exp": 1792478089}
```

Tokens are never logged.

## How agents call it

**kagent agents.** kagent's clients read the metadata, then post the incoming
bearer as `subject_token` and the token file
`/var/run/secrets/kubernetes.io/serviceaccount/token` as `actor_token`, with
no `actor_token` when the file is missing. In kagent 1.0.0-alpha7 an agent
opts in through its environment: `KAGENT_STS_WELL_KNOWN_URI`
(`<public_url>/.well-known/oauth-authorization-server`),
`KAGENT_STS_AUDIENCE=agentgateway`, and `KAGENT_STS_RESOURCE`. In alpha16 one
setting in the controller's configuration, `runtimeDefaults.tokenPropagation`,
applies to every agent. kagent exchanges once per run, before the first tool
call, and caches the token per session until it expires.

**This repository's agents.** Before each call to the next agent or tool,
they exchange the incoming bearer, with the agent's projected `chain-sts`
token as the actor, and send the issued token instead: `chat-assistant` in
`packages/server/src/downstream/delegation.ts` (kept per caller token while it
stays valid), `remediation-agent` and `comms-agent` in `delegation.py`
(kagent's `STSClient` from `agentsts-core`, once per task). The request, by
hand:

```sh
curl -s http://chain-sts.chain-sts.svc.cluster.local/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
  -d subject_token="$INCOMING_BEARER" \
  -d subject_token_type=urn:ietf:params:oauth:token-type:jwt \
  -d actor_token="$(cat "$CHAIN_STS_TOKEN_FILE")" \
  -d actor_token_type=urn:ietf:params:oauth:token-type:jwt \
  -d audience=agentgateway
```

The pod mounts that token through a `projected` volume with a
`serviceAccountToken` source whose `audience` is `chain-sts`, which the shared
chart writes from `projectedToken` (`expirationSeconds` 600, the least
Kubernetes allows); the kubelet replaces it before it expires, so the agents
read the file for every exchange.

## Environment

| Variable | Default | |
|---|---|---|
| `CHAIN_STS_CONFIG` | required; the image sets `/etc/chain-sts/config.yaml` | The configuration file |
| `HOST`, `PORT` | `127.0.0.1`, `8080` | The image binds `0.0.0.0:8080` |
| `APP_VERSION` | `0.1.0` | `service.version`, and `/healthz` |
| `DEPLOYMENT_ENVIRONMENT` | `dev` | `deployment.environment` |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` or `CRITICAL` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | | Traces are exported only when set |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | `grpc` or `http/protobuf` |
| `OTEL_SERVICE_NAME` | `chain-sts` | `service.name` |
| `KUBERNETES_SERVICE_HOST`, `KUBERNETES_SERVICE_PORT` | set by Kubernetes | The API server, unless `actor.token_review.api_server` names it |

With a configuration it cannot use (a missing file, an unknown key, a key file
that is not an RSA key, two keys that are the same, a key role that names no
key, no token or CA for a TokenReview) the service logs why and exits with
status 2.

## Run and test

From this directory, or from the repository's root as `task chain-sts:test`
and so on. `task publish` builds and pushes the image with the others.

```sh
task test    # pytest; nothing outside this machine is called
task lint    # ruff check and format check
task build   # the image localhost:5002/chain-sts:<version>
task push    # push it to the local registry
```

The tests start the service on 127.0.0.1, port 0, as a real HTTP server. They
make every key and certificate when they start and stand in for the rest:

- Keycloak: a key, its JWKS over HTTP, and the contracts' users' tokens.
- The cluster: a service-account issuer, its JWKS as a file, and tokens for
  the agents' service accounts.
- The API server: TokenReviews and the cluster's keys over HTTPS with a CA
  made for the run, answered only to the service's own token, with the API
  server's audience rules and a pod that can be gone.

Every test of the running service runs three times: with a TokenReview, with
the cluster's keys from a file, and with the keys from the API server.
They cover the chain and every refusal in [The rules](#the-rules), the audit
lines, the configuration, the key and its `kid` (against the example in RFC
7638), the TokenReview requests the service sends, and `python -m chain_sts` as
a process. `tests/test_rotation.py` covers the keys' roles and every refusal,
a signer that holds its key elsewhere, and a rotation step by step over HTTP
with instances that share one issuer, against a `PyJWKClient` set up as the
agents set theirs; `tests/test_rotate.py` covers `python -m chain_sts.rotate`. `tests/test_agentsts.py` runs kagent's Python client,
`agentsts-core` 1.0.0a16: `STSClient` for both hops, `STSIntegrationBase` with
a token file as the ADK plugin calls it, and a refusal raised as its
`TokenExchangeError`.

To run it by hand, copy `config.example.yaml` to `config.local.yaml`
(git-ignored), point `signing_key_file`, `subject_issuers` and `actor` at what
runs here, and start `CHAIN_STS_CONFIG=config.local.yaml PORT=<port>
PYTHONPATH=src .venv/bin/python -m chain_sts`. The contracts give this
component no local port yet.

## What is not done

What has been done, and what each step leaves open:

- **The narrower TokenReview grant.** The chart makes ClusterRole
  `chain-sts-token-review`, `create` on `tokenreviews`
  (`authentication.k8s.io`) and nothing else, and the binding
  `chain-sts-auth-delegator` names it instead of `system:auth-delegator`,
  which also allowed `subjectaccessreviews`. `kubectl auth can-i` as the
  service account: `create tokenreviews` yes, `create subjectaccessreviews`
  no. A TokenReview is cluster-wide, so the service may still ask about any
  token in the cluster.
- **Rules on `act`, the Chat UI's audience, the access log** (step 4; see
  [Where the chain is checked and
  recorded](#where-the-chain-is-checked-and-recorded)).
- **Rotation, in the dev cluster.** The key was rotated there on 2026-10-21
  with `task sts:rotate:*`, two replicas serving, while a loop exchanged and
  used tokens every 3 s: 2,926 requests and no failure
  ([the run](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#the-rotation-run-in-this-cluster)).
  Nothing rotates on a schedule, and the tasks run from a workstation with
  the cluster's admin kubeconfig. A leaked key is replaced by hand, without
  the waits. The key is a Secret, readable by the pod and by whoever may read
  Secrets in namespace `chain-sts`.
- **Two replicas.** The dev cluster runs two with a PodDisruptionBudget, and a
  pod that is deleted or rolled costs no request ([Several
  replicas](#several-replicas)), but both run on kind's one node, and a
  connection open when a pod stops can still be cut. Every agent call
  depends on this service: scaled to zero, the agents fail closed
  (`task demo:backup:sts-down`: `chat-assistant` says on the card that
  chain-sts failed, the alert hook answers 502, `remediation-agent` and
  `comms-agent` end their tasks failed with `network_error`, and nothing
  reaches `delivery-mcp`). A chain token is a bearer token for its audience
  until `exp`: an agent that holds one from before the outage, such as
  `chat-assistant` for a Chat UI that is open, goes on using it for up to
  `token_ttl_seconds`. The `jti` would allow a deny list if one is ever
  needed.
- **Negative checks and drills** (step 5; see [Checked, and drilled, in the
  dev cluster](#where-the-chain-is-checked-and-recorded)). In the dev cluster
  both actor checks have run with real service-account tokens for the
  audience `chain-sts` and Keycloak's tokens; the API server refused a token
  bound to a pod 10 to 13 seconds after the pod was deleted ("service account
  token has been invalidated"), as it keeps accepting a token it has just
  accepted for a short while. `max_chain` cannot be reached with the dev
  policy, in which no agent may follow `remediation-agent` or `comms-agent`;
  it is checked on a test instance of the same image and policy with two more
  accounts in line.

What remains:

- **A KMS signer.** Described, not written ([Signing in a
  KMS](#signing-in-a-kms)); the key is a Secret.
- **`diagnosis-agent` is not in the chain.** It runs on Agent Substrate with
  no credential of its own that this service can verify; see Agent Substrate
  below.
- **Upstream kagent and Agent Substrate.** kagent's runtimes exchange only
  for tools, and its A2A calls carry the raw token, so a kagent agent can be
  the last in a chain but not one in the middle; Substrate gives an actor no
  credential an agent process can present. See kagent's limits and Agent
  Substrate below. This component has been run against kagent's Go client
  (`go/adk/pkg/sts` of v1.0.0-alpha7) with the stand-ins' tokens only, and
  has no `catalog.yaml`: Agentregistry's kinds are agents, MCP servers,
  skills, prompts and runtimes, and a token service is none of them.
- **A person's own token is not bound by the rules on actors.** A user's
  token without `act` still works on every route its roles allow, as
  `task token`, the drills and `demo/scenarios/drive.py` need: the rules on
  `act` bind an agent that holds a chain token, not a person who calls a
  route directly.
- **Only the newest actor is checked.** The gateway reads `act.sub`; the
  agents before it are the record, and `delivery-mcp` records the chain and
  decides nothing by it.
- **One audience for every issued token.** Every token this service issues
  is for `agentgateway`, and the gateway passes it on to the agent it calls,
  so an agent can reuse a token it received wherever its caller is accepted
  as the newest actor: `remediation-agent`, handed a platform engineer's
  `[chat-assistant]` token, could call `restart_workload` at `/mcp/delivery`
  or the model route with it, as `chat-assistant` would. Tokens for one
  target each, asked for with `resource` (RFC 8707) and checked per route,
  would close that.
- **`remediation-agent` and `comms-agent` do not check who called them.**
  They verify the token and its issuer; which agent may call them is the
  gateway's rule alone.
- **The documents.** Neither [`docs/contracts.md`](../../docs/contracts.md)
  nor [`docs/cluster.md`](../../docs/cluster.md) names this service yet, and
  the contracts still say that each hop forwards the caller's token and that
  everything behind the gateway takes the audience `agentgateway`; the
  coordinator updates them.

**kagent's limits.** Read from kagent's source (kagent-adk 1.0.0a7 and
1.0.0a16, the Go runtime in v1.0.0-alpha7 and alpha16), not all run:

- Only tools get the exchanged token. A call to another A2A agent carries the
  raw incoming token, and only with `KAGENT_PROPAGATE_TOKEN=true`. A kagent
  agent can therefore be the last agent in a chain but not one in the middle,
  without a change upstream.
- The Go runtime's plugin does not put the exchanged token on MCP calls
  either: the raw token goes instead (`sts/plugin.go`, kagent#2803, closed
  unmerged; on Agent Substrate the exchange is no longer to be done in the
  agent runtime). Its STS client itself works with this service.
- No CRD field. alpha7 reads the `KAGENT_STS_*` variables above; alpha16 has
  the controller-wide `runtimeDefaults.tokenPropagation`, and
  `RemoteMCPServer.spec.tokenPassthrough` (Go only), which sends the raw token
  to a tool and overrides the exchange.
- One audience per agent: kagent sends the same `audience` and `resource` for
  every tool.
- Without a token file kagent asks without an actor, and the service refuses.

**Agent Substrate.** `diagnosis-agent` runs as a Substrate actor in the shared
worker pool `kagent-default`, whose pods run as `kagent:default`, with no
token of its own. Until Substrate gives each actor a credential this service
can verify, a Substrate agent cannot be an actor here, and `diagnosis-agent`
stays outside the chain. Substrate 0.6 gives each actor an actor JWT that the
agent process cannot read; its egress gateway can put it in an outbound header
(`actor_jwt`), which kagent's CRDs do not expose yet (substrate #124, #1660,
#1661, #2335). If that lands, this service would read a Substrate agent's
identity from that header, checked against Substrate's issuer.

**Open questions.** Whether the demo needs `may_act` at all (consent rules out
`task token`); one audience for every route or one per route; whether a
Keycloak-delegated token (one `act`) may be the first link; whether `may_act`
should require `sub` and `client_id` to agree when both are present;
TokenReview or keys only; and where the service runs in production and who
owns its key.

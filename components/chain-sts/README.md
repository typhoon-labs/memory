# chain-sts

> **Owner:** chain-sts maintainers · **Type:** reference · **Checked:** 2026-11-03 against chain-sts 0.2.1

A token exchange service that records every agent a request passed through.
An agent gives it the user's token and its own Kubernetes service-account
token, and gets back a token for the same user that names that agent and every
agent before it. A tool reached through two agents can then tell, from the
token alone and with a signature it can check, who the user is and who acted
for them:

    platform-engineer → chat-assistant → remediation-agent → delivery-mcp

RFC 8693 delegation, and nothing else.

**In the dev cluster** it runs as release `chain-sts`, two replicas of
0.2.1, and `chat-assistant`, `remediation-agent` and `comms-agent` exchange
their caller's token there, once for each target they call. How it is run there, who exchanges, and the
chains the cluster sees:
[`90-chain-sts`](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md).
What each route and tool accepts:
[`docs/contracts.md`](../../docs/contracts.md#agents-acting-for-a-user-chain-sts).
How it fits the system, case by case:
[`docs/system-architecture.md`](../../docs/system-architecture.md), sections 5 to 7.

| | |
|---|---|
| Built with | Starlette and uvicorn, Python 3.13 |
| Serves | HTTP on container port 8080 |
| Speaks | RFC 8693 token exchange, as kagent's STS clients send it |
| Configuration | One YAML file, [`config.example.yaml`](config.example.yaml), kept in Git |
| In the dev cluster | 0.2.1, release `chain-sts`, values [`values.yaml`](../../agent-deployments/clusters/dev/platform/90-chain-sts/values.yaml), policy [`policy.yaml`](../../agent-deployments/clusters/dev/platform/90-chain-sts/policy.yaml) |

## Why

Before this service one Keycloak token was forwarded unchanged at every hop. Every log named the user, and nothing
signed named an agent. Keycloak 26.8's delegation (a preview feature) records
one agent and no more: checked on a throwaway Keycloak 26.8.1 with the demo
realm, a token that already carries `act` cannot be exchanged again. This
service records the whole chain. Okta for AI Agents nests `act` in the same
way; basic Okta cannot issue tokens with our audience and claims at all. Cost
and capability against Okta for AI Agents, with dated sources and the
estimates marked as such:
[`docs/okta-comparison.md`](docs/okta-comparison.md).

## Identity

### The actor

The actor is proven by its Kubernetes service-account token. Agents hold no
secret for this service. `actor.verify_with` chooses how the token is checked:

- **`token_review`** (the default; the chart's default is `jwks`, and the dev
  cluster sets `token_review`). The service asks the API server: `POST
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

### The subject

**Whose tokens an agent may exchange.** A user's own token must carry an
audience the agent may exchange: its `subject_audiences`, else the identity
provider's `audience` (`agentgateway`). Only `chat-assistant` names another:
`chat-assistant`, the audience of a Chat UI sign-in (Keycloak client
`chat-ui`), which no route but `/a2a/chat-assistant` accepts. Handed such a
token, `remediation-agent` and `comms-agent` are refused (`invalid_request`,
`InvalidAudienceError`), so a Chat UI token goes no further than
`chat-assistant`, not even through this service. A token this service issued
is taken as the subject for any of its `audiences`: an agent exchanges the
token it was called with, which is for the agent's own route, for one for the
target it calls next.

`alert-automation`'s token, a client-credentials token from the same Keycloak
with the audience `agentgateway`, is a user's token here: `chat-assistant`'s
`act_for_users` covers the alert hook, and no rule names the machine client.

## What it serves and returns

### Paths

| Path | |
|---|---|
| `GET /.well-known/oauth-authorization-server`, `GET /.well-known/openid-configuration` | Metadata: `issuer`, `token_endpoint`, `jwks_uri`, `grant_types_supported`, and `token_endpoint_auth_methods_supported: ["none"]` |
| `GET /jwks` | The public keys: the one that signs every token, and during a rotation the next or the previous one ([The signing keys](#the-signing-keys)) |
| `POST /token` | The exchange |
| `GET /healthz` | Liveness, and `keys`: the `kid` of the key that signs, and of the next or previous one |

`token_endpoint` (`<public_url>/token`) and `jwks_uri` (`<public_url>/jwks`)
come from the configuration, never from the request: kagent's Go client uses
`token_endpoint` as it is. Any other path answers 404 `{"error": "not_found"}`.

### The protocol

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
| `audience`, `resource` | The target (RFC 8707: `resource` is an absolute URI). kagent sends `KAGENT_STS_AUDIENCE` and `KAGENT_STS_RESOURCE` as these. Each must be in `audiences`; a value given as both counts once. When `audiences` lists one, both are optional and that one is the default. When it lists several, one target per token, as in the dev cluster: exactly one must be named, so that a token is for that target alone (since 0.2.1) |
| `requested_token_type` | Optional. Only an access token is issued |

The answer is 200 with `access_token`, `issued_token_type`
(`urn:ietf:params:oauth:token-type:access_token`), `token_type: Bearer` and
`expires_in`. A refusal is `{"error", "error_description"}` (RFC 6749,
section 5.2), which both kagent clients parse. Both carry
`Cache-Control: no-store`.

### How agents call it

**kagent agents.** kagent's clients read the metadata, then post the incoming
bearer as `subject_token` and the token file
`/var/run/secrets/kubernetes.io/serviceaccount/token` as `actor_token`, with
no `actor_token` when the file is missing. In kagent 1.0.0-alpha7 an agent
opts in through its environment: `KAGENT_STS_WELL_KNOWN_URI`
(`<public_url>/.well-known/oauth-authorization-server`),
`KAGENT_STS_AUDIENCE` and `KAGENT_STS_RESOURCE`, one target for the agent's
every tool. From alpha16 to
1.0.0-rc1 one setting in the controller's configuration,
`runtimeDefaults.tokenPropagation`, applies to every agent. kagent exchanges once per run, before the first tool
call, and caches the token per session until it expires.

**This repository's agents.** Before each call to the next agent or tool,
they exchange the incoming bearer, with the agent's projected `chain-sts`
token as the actor, for the target they are about to call, and send the
issued token instead: `chat-assistant` in
`packages/server/src/downstream/delegation.ts` (kept per caller token and
target while it stays valid), `remediation-agent` and `comms-agent` in
`delegation.py` (kagent's `STSClient` from `agentsts-core`, once per target
in a task). The target is `resource`, the address the agent calls it at
(`delegation.resources` in the dev cluster's `identity.yaml`). The request,
by hand:

```sh
curl -s http://chain-sts.chain-sts.svc.cluster.local/token \
  -d grant_type=urn:ietf:params:oauth:grant-type:token-exchange \
  -d subject_token="$INCOMING_BEARER" \
  -d subject_token_type=urn:ietf:params:oauth:token-type:jwt \
  -d actor_token="$(cat "$CHAIN_STS_TOKEN_FILE")" \
  -d actor_token_type=urn:ietf:params:oauth:token-type:jwt \
  -d resource=http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/delivery
```

The pod mounts that token through a `projected` volume with a
`serviceAccountToken` source whose `audience` is `chain-sts`, which the shared
chart writes from `projectedToken` (`expirationSeconds` 600, the least
Kubernetes allows); the kubelet replaces it before it expires, so the agents
read the file for every exchange.

### The rules

The request's parameters are checked first, then the actor's token, then the
agent it names, then the subject's token. A caller that is not a known agent
learns nothing about a user's token.

| Situation | `error` | HTTP |
|---|---|---|
| Not token exchange | `unsupported_grant_type` | 400 |
| A required parameter missing, a token type not accepted, or a single-valued parameter given twice; a body that is neither a form nor a JSON object, or over 64 KiB | `invalid_request` | 400 |
| No actor token (kagent sends none when the pod has no token file) | `invalid_request` | 400 |
| Audience or resource not in `audiences` | `invalid_target` | 400 |
| No target named, or two, while `audiences` lists several (since 0.2.1) | `invalid_target` | 400 |
| Actor token does not verify: signature, issuer, expiry, audience; with a TokenReview also a pod that is gone | `invalid_request` | 400 |
| Actor's service account not in `agents` | `unauthorized_client` | 400 |
| Subject from an issuer not trusted, or does not verify | `invalid_request` | 400 |
| A user's token for none of the audiences the agent may exchange (its `subject_audiences`, else the identity provider's `audience`) | `invalid_request` | 400 |
| An identity provider's token that already carries `act` | `invalid_request` | 400 |
| A user's token, and the agent lacks `act_for_users` | `unauthorized_client` | 400 |
| A user's token with `may_act` that does not name the agent | `invalid_request` | 400 |
| A user's token without `may_act`, and `require_may_act` is on | `invalid_request` | 400 |
| This service's token, whose newest agent is not in `agents` | `invalid_request` | 400 |
| This service's token, whose newest agent is not in the agent's `after` | `unauthorized_client` | 400 |
| The agent is already in the chain | `unauthorized_client` | 400 |
| The chain would exceed `max_chain` | `unauthorized_client` | 400 |
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

### The token

| Claim | Value |
|---|---|
| `iss` | `issuer` from the configuration |
| `sub` | The user's `sub`, unchanged along the chain |
| `aud` | The target asked for; when `audiences` lists one, that one if none was asked for |
| `iat`, `nbf` | Now |
| `exp` | The earlier of the subject token's `exp` and now plus `token_ttl_seconds` (300) |
| `jti` | New for every token; in the audit line |
| `client_id` | The agent that asked |
| `act` | `{sub: <service account>, client_id: <agent>}`, with the previous `act` nested inside |
| `preferred_username`, `roles`, `team`, `email`, `name` | Copied from the subject token when present (`carry_claims`), so they travel the whole chain. The dev cluster's policy also carries `sid` and `idp_sub` |

User → `chat-assistant` → `remediation-agent`, as `delivery-mcp` receives it:

```json
{
  "iss": "http://chain-sts.chain-sts.svc.cluster.local",
  "sub": "00000000-0000-4000-8000-000000000004",
  "aud": "http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/delivery",
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

### Where the chain is checked and recorded

**At the gateway.** A route takes this service's tokens only for its own
target: `resource` in
[`route-auth`](../../agent-platform/policies/agentgateway/route-auth/values.yaml)
names its entry in `delegation.resources`, and the provider for this issuer
lists that URI alone as its audience. A route that names none, such as
`/a2a/chat-assistant`, does not trust this service at all. Every route that
takes a user's token also has a rule on the newest actor: a token without
`act` (a person's or the alert's own) must come from the identity provider and is then decided by the route's roles
alone, and a token with `act` is let in only when this service signed it and
its `act.sub` is an agent the route expects.
The CEL is `(!has(jwt.act) && jwt.iss == "<identity provider>") || (jwt.iss
== "<this issuer>" && jwt.act.sub in [...])`, written by `actors` in the chart
[`route-auth`](../../agent-platform/policies/agentgateway/route-auth/values.yaml)
and per tool by `toolActors` in
[`mcp-route`](../../agent-platform/profiles/gateway/mcp-route/values.yaml),
with agent names from `delegation.agents` in
[`identity.yaml`](../../agent-deployments/clusters/dev/identity.yaml). In
Agentgateway 1.6.0 and 1.7.0 `has(jwt.act)` is false when the claim is absent,
and `jwt.act.sub` on such a token is an error, which counts as false; both
branches were run on each. Which agent each route and each tool takes in the dev cluster is in
[`docs/contracts.md`](../../docs/contracts.md): the delivery-mcp tools table
and [Routes](../../docs/contracts.md#routes).

A refusal for the wrong agent is the route's usual one: 403 on an agent's
route, a tool missing from `tools/list` and "unknown resource" on
`/mcp/delivery`. A token for another target, or at a route that takes none,
is refused with 401, `InvalidAudience` in the gateway's log for the first.
`chat-assistant` itself refuses a token with `act` too (403, since 0.1.11).

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
`delivery-mcp` (since 0.1.3) writes the chain next to the user in its audit lines
and in everything it records: `opened_via`, `applied_via`, a history entry's
`via` and so on.

### The policy

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

`audiences` are the targets the service issues for. The dev cluster's lists
each gateway route that takes these tokens, by the URL an agent calls it at,
such as
`http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/delivery`
and, for the model route,
`http://agentgateway-proxy.agentgateway-system.svc.cluster.local/v1`: the
same list as `delegation.resources` in
[`identity.yaml`](../../agent-deployments/clusters/dev/identity.yaml), and the
chart refuses to render while the two differ. Each token is for the one
target its request names. `config.example.yaml` lists one, `agentgateway`,
which is then the default.

A key the service does not know stops it from starting, so a misspelled rule
is never ignored. `carry_claims` cannot name a claim the service sets itself.
A relative path is relative to the file.

### The signing keys

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
PYTHONPATH=src .venv/bin/python -m chain_sts.rotate steps               # the rotation (docs/key-rotation.md), with its waits
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

#### What the verifiers do, and rotating the key

How each verifier learns a new key and how long it accepts an expired token,
and the rotation's steps and waits as chart values for any cluster, with a
key that leaked: [`docs/key-rotation.md`](docs/key-rotation.md). The dev
cluster's runbook is
[the release's README](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#rotating-the-key).

#### Several replicas

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
step rolls every replica, and the rotation in [`docs/key-rotation.md`](docs/key-rotation.md) is built for the overlap.

In the dev cluster a pod that was deleted, evicted or rolled cost no request,
and a second eviction waited for the budget
([measured](../../docs/measurements.md#chain-sts)).

#### Signing in a KMS

Signing is behind `Signer` in [`keys.py`](src/chain_sts/keys.py). The file
key is the only implementation. What a KMS signer would do, for AWS KMS,
Cloud KMS and Vault Transit: [`docs/kms-signer.md`](docs/kms-signer.md).

### Logs and audit

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
{"time": "2026-10-20T19:58:03.114Z", "level": "INFO", "logger": "chain_sts.audit", "message": "token exchange issued", "event": "token_exchange", "outcome": "issued", "jti": "5c0e…", "user": "platform-engineer", "chain": ["remediation-agent", "chat-assistant"], "aud": "http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/delivery", "exp": 1792478089}
```

**To the Collector, since 0.2.0.** When `OTEL_EXPORTER_OTLP_ENDPOINT` is set,
each audit line is also an OTLP log record, sent where the traces go and with
the same protocol, so that it outlives the pod: in the dev cluster the
Collector sends it on to Loki, which keeps the attributes as structured
metadata (with `_` for `.`: `token_jti`). The record's body is the line's
`message`, its scope is `chain_sts.audit`, and it carries the trace and span
of the request that made it. Only the audit logger is sent; every other line
stays on standard error. The attributes are named as the gateway's access log
names the same things, so that a token's exchange and its use join on
`token.jti`. One without a value is left out, never sent as null:

| Attribute | Issued | Refused |
|---|---|---|
| `audit.event` | `token_exchange` | `token_exchange` |
| `audit.outcome` | `issued` | `refused` |
| `audit.rule` | | The line's `reason` |
| `user.id` | `preferred_username` | When the subject verified |
| `user.sub`, `user.issuer` | `sub` and `iss` of the subject token: Keycloak's, or this service's on a later hop | When the subject verified |
| `token.jti` | Of the new token; the gateway's `token.jti` when the token is used | |
| `actor.chain` | The line's `chain`, comma-separated: `remediation-agent,chat-assistant` | |
| `token.aud` | Of the new token, comma-separated if several | |

Tokens are never logged.

## Environment

| Variable | Default | |
|---|---|---|
| `CHAIN_STS_CONFIG` | required; the image sets `/etc/chain-sts/config.yaml`, the chart `/etc/chain-sts/config/config.yaml` | The configuration file |
| `HOST`, `PORT` | `127.0.0.1`, `8080` | The image binds `0.0.0.0:8080` |
| `APP_VERSION` | `0.1.0` | `service.version`, and `/healthz` |
| `DEPLOYMENT_ENVIRONMENT` | `dev` | `deployment.environment` |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` or `CRITICAL` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | | Traces and the audit records are exported only when set |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | `grpc` or `http/protobuf` |
| `OTEL_SERVICE_NAME` | `chain-sts` | `service.name` |
| `KUBERNETES_SERVICE_HOST`, `KUBERNETES_SERVICE_PORT` | set by Kubernetes | The API server, unless `actor.token_review.api_server` names it |

With a configuration it cannot use (a missing file, an unknown key, a key file
that is not an RSA key, two keys that are the same, a key role that names no
key, no token or CA for a TokenReview) the service logs why and exits with
status 2.

## Run and test

From the repository's root, or as `task test` and so on from this directory.

```sh
task chain-sts:test    # pytest; nothing outside this machine is called
task chain-sts:lint    # ruff check and format check
task chain-sts:build   # the image localhost:5002/chain-sts:<version>
task chain-sts:push    # push it to the local registry
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
lines and their records for the Collector (`tests/test_telemetry.py`; and
`tests/test_main.py` over OTLP/HTTP to a stand-in receiver), the configuration, the key and its `kid` (against the example in RFC
7638), the TokenReview requests the service sends, and `python -m chain_sts` as
a process. `tests/test_rotation.py` covers the keys' roles and every refusal,
a signer that holds its key elsewhere, and a rotation step by step over HTTP
with instances that share one issuer, against a `PyJWKClient` set up as the
agents set theirs; `tests/test_rotate.py` covers `python -m chain_sts.rotate`.
`tests/test_targets.py` covers tokens per target, with the dev cluster's
policy during the rollout and after the drop: the token for the target
named and for no other, an agent exchanging the token for its own route, and
the refusal of no target, two, and the shared audience once it is dropped. `tests/test_agentsts.py` runs kagent's Python client,
`agentsts-core` 1.0.0rc1: `STSClient` for both hops, `STSIntegrationBase` with
a token file as the ADK plugin calls it, and a refusal raised as its
`TokenExchangeError`.

To run it by hand, copy `config.example.yaml` to `config.local.yaml`
(git-ignored), point `signing_key_file`, `subject_issuers` and `actor` at what
runs here, and start `CHAIN_STS_CONFIG=config.local.yaml PORT=<port>
PYTHONPATH=src .venv/bin/python -m chain_sts`. The contracts give this
component no local port yet.

**Checked, and drilled, in the dev cluster.** `task sts:check`,
`task demo:chain` and `task demo:backup:sts-down`: what each covers is in
[`90-chain-sts`](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md)
and [`agent-platform/tests`](../../agent-platform/tests/README.md).

## Release

The image's version is set in this directory's [`Taskfile.yml`](Taskfile.yml):
`CHAIN_STS_VERSION`, 0.2.1. `task chain-sts:build` tags the image
`localhost:5002/chain-sts:<version>` with it and passes it to `docker build`
as `VERSION`, which the image sets as `APP_VERSION`. `pyproject.toml` and
`uv.lock` carry the package's own version, also 0.2.1, which the service does
not report. In a cluster the chart sets `APP_VERSION` from the release's
`image.tag`. The dev cluster's tag is in
[`values.yaml`](../../agent-deployments/clusters/dev/platform/90-chain-sts/values.yaml),
whose comments say what each version from 0.1.1 on added. A policy key that a
version does not know stops it from starting ([The policy](#the-policy)), so
the policy and the version change together.

1. Raise `CHAIN_STS_VERSION`.
2. From the repository's root, `task chain-sts:build chain-sts:push`.
   `task publish` builds and pushes the image with the others.
3. Set `image.tag` in the release's `values.yaml`, and apply it with
   `task sts:install` (or `task deploy -- -l name=chain-sts`):
   [`90-chain-sts`](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md).

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
- **Rules on `act`, the Chat UI's audience, the access log** (see
  [Where the chain is checked and
  recorded](#where-the-chain-is-checked-and-recorded)).
- **Tokens per target** (0.2.1). Each token is for the one route its request
  names (`resource`), the route accepts it for itself alone, and so do
  `delivery-mcp`, `remediation-agent` and `comms-agent`, which verify it
  again (`DELEGATION_AUDIENCE`). An agent can no longer present a token it
  was called with anywhere else: `remediation-agent`, handed a platform
  engineer's `[chat-assistant]` token for its own route, is refused with 401
  at `restart_workload` on `/mcp/delivery` and at the model route. **To
  validate:** that refusal is in `chain-gateway.sh`, which has not run since
  ([the rollout](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#tokens-per-target)).
  The unit tests here (`tests/test_targets.py`) and in each verifier cover
  it.
- **Rotation, in the dev cluster.** The key was rotated there on 2026-10-21
  with `task sts:rotate:*`, two replicas serving, while a loop exchanged and
  used tokens every 3 s, with no failed request
  ([the run](../../docs/measurements.md#key-rotation-2026-10-21)).
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
- **Negative checks and drills** (see [Checked, and drilled, in the
  dev cluster](#run-and-test)). In the dev cluster
  both actor checks have run with real service-account tokens for the
  audience `chain-sts` and Keycloak's tokens; the API server refused a token
  bound to a pod some seconds after the pod was deleted ("service account
  token has been invalidated"), as it keeps accepting a token it has just
  accepted for a short while ([measured](../../docs/measurements.md#chain-sts)). `max_chain` cannot be reached with the dev
  policy, in which no agent may follow `remediation-agent` or `comms-agent`;
  it is checked on a test instance of the same image and policy with two more
  accounts in line.

What remains:

- **A KMS signer.** Described, not written
  ([`docs/kms-signer.md`](docs/kms-signer.md)); the key is a Secret.
- **`diagnosis-agent` is not in the chain.** It runs on Agent Substrate with
  no credential of its own that this service can verify; see
  [kagent and Agent Substrate in a chain](../../agent-deployments/clusters/dev/platform/60-kagent/README.md#kagent-and-agent-substrate-in-a-chain).
- **Upstream kagent and Agent Substrate.** kagent's runtimes exchange only
  for tools, and its A2A calls carry the raw token, so a kagent agent can be
  the last in a chain but not one in the middle; Substrate gives an actor no
  credential an agent process can present (same link). This component has been run against kagent's Go client
  (`go/adk/pkg/sts` of v1.0.0-alpha7) with the stand-ins' tokens only, and
  has no `catalog.yaml`: Agentregistry's kinds are agents, MCP servers,
  skills, prompts and runtimes, and a token service is none of them.
- **A person's own token is not bound by the rules on actors,** nor issued
  for one target. A user's token without `act` still works on every route
  its roles allow, as `task token`, the drills and `demo/scenarios/drive.py`
  need: the rules on `act` and the targets bind an agent that holds a chain
  token, not a person who calls a route directly. An agent called with such
  a token, as `remediation-agent` is by a platform engineer's script, could
  present it on any route those roles open.
- **Only the newest actor is checked.** The gateway reads `act.sub`; the
  agents before it are the record, and `delivery-mcp` records the chain and
  decides nothing by it.
- **A subject's target is not checked against the agent.** An agent may
  exchange a token this service issued for any of its targets, not only one
  for the agent's own route. No agent receives another route's token in the
  dev cluster, so this would only matter for a token an agent got some other
  way.
- **`remediation-agent` and `comms-agent` do not check who called them.**
  They verify the token and its issuer; which agent may call them is the
  gateway's rule alone.

**kagent and Agent Substrate.** Why a kagent agent can only be the last
agent in a chain, and why an Agent Substrate agent cannot be one at all:
[`60-kagent`](../../agent-deployments/clusters/dev/platform/60-kagent/README.md#kagent-and-agent-substrate-in-a-chain).

**Open questions** about this service are with the other open decisions in
[`docs/production-design.md`](../../docs/production-design.md), section 6.

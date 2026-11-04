# Contracts

> **Owner:** coordinator · **Type:** reference · **Checked:** 2026-11-03 against Agentgateway 1.7.0, Keycloak 26.7.5, chain-sts 0.2.1

What every part of the demo agrees on: identities, model access, how
components are bound to each other, the tools and their rules, and the routes.
Where a contract is enforced by configuration, the file is named.

The cluster these run in (ports, namespaces, commands) is in
[`cluster.md`](cluster.md). What each component does beyond its contract is in
its own README under `components/`. If something here is wrong or you must
deviate, see [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Identity

Keycloak issues the tokens of people and machine clients, and chain-sts the
tokens of agents acting for them (below). In the demo Keycloak also holds the
users and their passwords. [`production-design.md`](production-design.md)
proposes keeping Keycloak in production, federated to the enterprise identity
provider (Okta, Ping), which would then authenticate people. That design is
not decided (its sections 2 and 6). Its broker has been run in the demo: a
second realm, `corp`, stands in for the identity provider, and the demo
realm offers it as a `corp` button beside its own sign-in form
([`20-keycloak/README.md`](../agent-deployments/clusters/dev/platform/20-keycloak/README.md)).
A user who signs in through `corp` gets a demo-realm token like any other,
plus `idp_sub`, corp's ID for them, in the tokens of `chat-ui` and
`mcp-client`. The demo realm's own users, clients and passwords are
unchanged. How tokens and
chain-sts work, case by case, is explained in
[`system-architecture.md`](system-architecture.md), sections 5 to 7.

- Realm `demo`. Issuer as seen by browsers and in tokens:
  `http://localhost:18081/realms/demo`. In-cluster services fetch keys from the
  Keycloak Service, not from localhost.
- Token audience of Keycloak's tokens: `agentgateway`, on every route.
  `/a2a/chat-assistant` also accepts `chat-assistant`, the audience of a Chat
  UI sign-in, so that token works there and nowhere else. chain-sts's tokens
  are each for one route instead ([below](#agents-acting-for-a-user-chain-sts)).
- Claims every token the gateway accepts carries: `preferred_username`,
  `roles` (array, top level), `team` (string), and `sub`, which delivery-mcp
  needs to propose or approve a change. A token chain-sts issued keeps `sub`
  and copies the others from the token it was exchanged for.
- Keycloak's access tokens live 30 minutes.

| User | `roles` | `team` | Password (demo only) |
|---|---|---|---|
| `developer` | `developer` | `search` | `demo` |
| `developer-other-team` | `developer` | `registration` | `demo` |
| `incident-manager` | `incident-manager` | `incident` | `demo` |
| `platform-engineer` | `platform-engineer` | `platform` | `demo` |

A person's `sub` is fixed in the realm file. Keycloak keeps nothing across a
restart, and Grafana and Langfuse do, so without it each restart would make
everyone a stranger to their own account.

| Client | Type | Use |
|---|---|---|
| `chat-ui` | Public, authorization code with PKCE; audience `chat-assistant` | Browser sign-in to the Chat UI |
| `mcp-client` | Public, authorization code with PKCE | An existing MCP client (backup act) |
| `alert-automation` | Confidential, client credentials; `roles: [alert-automation]`, `team: automation`, `preferred_username: service-account-alert-automation` | The alert that triggers diagnosis |
| `demo-cli` | Public, direct grant (user and password) | `task token -- <user>`, and through it the scripts, checks and drills |
| `kagent-ui` | Confidential, authorization code with PKCE | Sign-in to the kagent UI, by its sign-in proxy. Its tokens do not carry the audience `agentgateway`, so the gateway refuses them |
| `grafana` | Confidential, authorization code with PKCE | Sign-in to Grafana: `platform-engineer` is Admin, the other roles Viewer. The gateway refuses its tokens too |
| `langfuse` | Confidential, authorization code with PKCE | Sign-in to Langfuse, for `platform-engineer` only. The gateway refuses its tokens too |
| `agentgateway-ui` | Confidential, authorization code with PKCE | Sign-in to the Agentgateway admin UI, by its sign-in proxy, for `platform-engineer` only. The gateway refuses its tokens too |
| `reconciler` | Confidential, client credentials; `view-users` and `manage-users` in the demo realm (demo-only secret) | The reconciliation job prototype, `task identity:reconcile` |

The caller's identity always comes from the verified bearer token. No tool,
agent or endpoint accepts a user name, role or team as an argument or header.
The gateway passes the caller's token to the backend only where the route's
policy sets `passthrough`: the routes to `delivery-mcp`, the four agents and
the alert hook. The model route and `/mcp/observability` do not. An agent
never sends its caller's token on: `chat-assistant`, `remediation-agent` and
`comms-agent` exchange it at chain-sts and send the token they get back, and
`diagnosis-agent` calls with credentials of its own.

One door is not the gateway: the kagent UI at `http://localhost:18087`, an
operator's console for `platform-engineer` only. Its sign-in proxy verifies
the session, and a chat started there reaches `diagnosis-agent` through
kagent's controller, outside the route `/a2a/diagnosis-agent` and its policy.
The agent's model calls and its Grafana reads still go through the gateway,
with its own gateway key. Its Kubernetes reads go to its own read-only tool
server, `diagnosis-agent-tools`, directly. See
[`60-kagent/README.md`](../agent-deployments/clusters/dev/platform/60-kagent/README.md).

The values every gateway policy reads are in
`agent-deployments/clusters/dev/identity.yaml`: Keycloak's issuer, audience
and key URL (`identity`), and chain-sts's issuer and key URL, with the
service account of each agent it may name and the target of each route that
takes its tokens (`delegation`).

### Agents acting for a user (chain-sts)

chain-sts is an RFC 8693 token exchange. It runs in the cluster only, at
`http://chain-sts.chain-sts.svc.cluster.local`, which is also the issuer of
its tokens; its keys are at `/jwks`. Its policy is
`agent-deployments/clusters/dev/platform/90-chain-sts/policy.yaml`, and how
it works is in
[`components/chain-sts/README.md`](../components/chain-sts/README.md).

- `chat-assistant`, `remediation-agent` and `comms-agent` exchange the token
  they received before they call `delivery-mcp`, another agent or the model
  route, once for each target they call, and send only the token they get
  back. Each proves who it is with a token of its own ServiceAccount for the
  audience `chain-sts`. A refused or failed exchange stops the call.
- Each token is for one target, named as `resource` (RFC 8707) in the
  exchange: the address the agent calls the target at, without a trailing
  slash, which becomes the token's `aud`. chain-sts refuses a request that
  names no target, or more than one, or one it does not list
  (`invalid_target`). The targets are `delegation.resources` in
  `identity.yaml`, and the same list is `audiences` in chain-sts's policy:

  | Target | `resource`, the token's `aud` | Asked for by |
  |---|---|---|
  | `delivery-mcp` | `http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/delivery` (`DELIVERY_MCP_URL`) | `chat-assistant`, `remediation-agent`, `comms-agent` |
  | `remediation-agent` | `http://agentgateway-proxy.agentgateway-system.svc.cluster.local/a2a/remediation-agent` (`REMEDIATION_AGENT_URL`) | `chat-assistant` |
  | `comms-agent` | `http://agentgateway-proxy.agentgateway-system.svc.cluster.local/a2a/comms-agent` (`COMMS_AGENT_URL`) | `chat-assistant` |
  | `diagnosis-agent` | `http://agentgateway-proxy.agentgateway-system.svc.cluster.local/a2a/diagnosis-agent` (`DIAGNOSIS_AGENT_URL`) | `chat-assistant` |
  | `model` | `http://agentgateway-proxy.agentgateway-system.svc.cluster.local/v1` (`MODEL_BASE_URL` with `/v1`, the prefix of the model route's paths) | `chat-assistant`, `remediation-agent`, `comms-agent` |

- The token keeps the user's `sub` and copies `preferred_username`, `roles`,
  `team`, `email`, `name`, `sid` and `idp_sub`, so rules on roles hold for it
  as for the user's own token, and an agent's call joins the person's session
  and, for a brokered user, the identity provider's log. Its `aud`
  is its target, its `client_id` the agent, and its
  `act` names the agent, `{"sub": "system:serviceaccount:agents:<agent>",
  "client_id": "<agent>"}`, with the previous agent's `act` nested inside:
  the outermost is the agent calling now. Each token has a new `jti`, and
  lives 300 seconds at most and never past the token it was exchanged for.
- Who may exchange what: `chat-assistant` a user's or the alert's own token,
  for the audience `agentgateway` or `chat-assistant`; `remediation-agent`
  and `comms-agent` a user's own token for `agentgateway`, or one whose newest
  agent is `chat-assistant`. A chain names at most four agents.
  `diagnosis-agent` does not exchange and cannot be named: it runs in Agent
  Substrate's shared worker pool without a token of its own.
- Who accepts its tokens: the gateway, on the route of the token's target
  only, when the route's `actors` lists the newest agent ([Routes](#routes));
  and `delivery-mcp`, `remediation-agent` and `comms-agent`, which verify the
  token again and take it only for their own route (`DELEGATION_AUDIENCE`).
  So an agent cannot present a token it was called with anywhere else.
  `chat-assistant` refuses any token with `act`.

## Model access

Components never hold a provider key and never call a provider directly.

| Variable | In the cluster | Local development |
|---|---|---|
| `MODEL_BASE_URL` | The gateway's model route | `http://localhost:7070` |
| `MODEL_ID` | `claude-sonnet-5-5` | same |
| `MODEL_ID_FAST` | `claude-haiku-4-5-20251001` | same |

The endpoint speaks the Anthropic Messages API (`POST /v1/messages`, header
`anthropic-version: 2023-06-01`). It is the user's real endpoint: keep test
calls few and small, and prefer the fast model in tests.

Through the gateway, `MODEL_BASE_URL` is
`http://agentgateway-proxy.agentgateway-system.svc.cluster.local` (from the
host, `http://localhost:18080`). Send `POST /v1/messages`, or the
OpenAI-compatible `/v1/chat/completions`, with `Authorization: Bearer <token>`:
an agent's is the token chain-sts issued it for the target `model`. `GET /v1/models` is passed
through to the provider. The gateway adds `anthropic-version`, drops
`x-api-key`, and refuses a missing or wrong token with 401 and an unapproved
model with 403.

The host endpoint needs no key, and `task smoke` proves the whole route with
one small real completion. It is not always running: if it refuses
connections, do not wait for it, test against a fake, and list real-model
checks as not verified.

Which provider is behind the route, and which model IDs are approved, is
`agent-deployments/clusters/dev/platform/30-model-route/model-provider.yaml`.
A new cluster uses the provider that file names, the host endpoint.
`task model -- bedrock` switches the route to Amazon Bedrock and keeps that
choice in the cluster, so the file no longer says which provider answers:
`task model` does. Nothing changes for a component either way: the same
`MODEL_BASE_URL`, the same two model IDs, and still no provider key.

## Components

Every component reads its bindings from environment variables, serves
`GET /healthz`, exports OpenTelemetry over OTLP when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set, propagates W3C trace context on outbound
calls, and sets `service.name`, `service.version` and
`deployment.environment=dev`.

| Component | Built with | Serves (container port 8080) | Local dev port |
|---|---|---|---|
| `web` | Node; the pages are a React app | Home, Search, Register pages; proxies `/api/*` | 18182 |
| `search-service` | Node | `GET /search?q=` | 18183 |
| `registration-service` | Node | `POST /register` | 18184 |
| `delivery-mcp` | FastMCP, Python 3.13 | MCP over Streamable HTTP at `/mcp` | 18190 |
| `remediation-agent` | Strands, Python 3.13 | A2A 0.3 over JSON-RPC, agent card at `/.well-known/agent-card.json` | 18191 |
| `comms-agent` | Strands, Python 3.13 | A2A 0.3 over JSON-RPC | 18192 |
| `chat-assistant` | Mastra, TypeScript | A2A 1.0 and 0.3 over JSON-RPC, with the A2UI extension v0.9.1 | 18193 |
| Chat UI | React, `@a2ui/react` | Static site | 18194 |
| `diagnosis-agent` | kagent, declarative | A2A 1.0 over JSON-RPC, through the gateway only; `platform-engineer` can also chat with it in the kagent UI | - |
| `chain-sts` | Starlette and uvicorn, Python 3.13 | RFC 8693 token exchange at `POST /token`, keys at `/jwks`, metadata at `/.well-known/oauth-authorization-server`; in the cluster only, not through the gateway. Its policy is a YAML file (`CHAIN_STS_CONFIG`) | - |

Binding variables: `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUDIENCE`,
`DELEGATION_ISSUER`, `DELEGATION_JWKS_URL`, `DELEGATION_AUDIENCE`,
`DELEGATION_METADATA_URL`,
`DELEGATION_ACTOR_TOKEN_FILE`, `DELIVERY_MCP_URL`, `OBSERVABILITY_MCP_URL`,
`REMEDIATION_AGENT_URL`, `COMMS_AGENT_URL`, `DIAGNOSIS_AGENT_URL`,
`APP_VERSION`. `OIDC_JWKS_URL` is where the issuer's keys are fetched: in the
cluster, the Keycloak Service.

- `DELEGATION_ISSUER`, `DELEGATION_JWKS_URL` (`<chain-sts>/jwks`) and
  `DELEGATION_AUDIENCE`, set together, let a service accept chain-sts's
  tokens beside Keycloak's: `delivery-mcp`, `remediation-agent`,
  `comms-agent`. Keycloak's tokens must carry `OIDC_AUDIENCE`, chain-sts's
  one of `DELEGATION_AUDIENCE` (comma-separated), which is the service's own
  target in the table above.
- `DELEGATION_METADATA_URL`
  (`<chain-sts>/.well-known/oauth-authorization-server`) and
  `DELEGATION_ACTOR_TOKEN_FILE` (`/var/run/secrets/chain-sts/token`, the
  ServiceAccount token for the audience `chain-sts`) make an agent exchange
  its caller's token, for each target it calls, as the target's `*_URL`
  names it: `chat-assistant`, `remediation-agent`, `comms-agent`.
- `chat-assistant` alone also reads `OIDC_ACCEPTED_AUDIENCES`, the audiences
  a caller's token may carry: `agentgateway,chat-assistant`.
- Every other `*_URL` names a component: in the cluster it points at that
  component's gateway route, in local development straight at the component.

## delivery-mcp tools

The service holds incident and change state and enforces the rules below
itself, whatever the gateway allowed.

| Tool | Arguments | Allowed role | Agent that may call it for a user | Service rule |
|---|---|---|---|---|
| `list_incidents` | - | any signed-in | `chat-assistant`, `remediation-agent`, `comms-agent` | - |
| `get_incident` | `incident_id` | any signed-in | `chat-assistant`, `remediation-agent`, `comms-agent` | - |
| `open_incident` | `service`, `severity`, `summary`, `impact` | `alert-automation` | `chat-assistant` | One open incident per service |
| `record_diagnosis` | `incident_id`, `suspected_cause`, `evidence[]`, `recommended_version` | `alert-automation` | `chat-assistant` | - |
| `propose_change` | `incident_id`, `target_version` | `developer` | `chat-assistant` | Caller's `team` owns the service; target is a retained earlier version |
| `approve_change` | `change_id` | `incident-manager` | `chat-assistant` | Change is proposed; approver is not the proposer, compared by `sub` |
| `reject_change` | `change_id`, `reason` | `incident-manager` | `chat-assistant` | Change is proposed or approved |
| `apply_change` | `change_id` | `platform-engineer` | `remediation-agent` | Change is approved; idempotent on `change_id` |
| `restart_workload` | `service` | `platform-engineer` | `chat-assistant` | A service it knows; no approval needed |
| `post_status_update` | `incident_id`, `text` | `incident-manager` | `chat-assistant` | The incident exists |

- Change status: `proposed`, `approved`, `rejected`, `applying`, `verifying`,
  `applied`, `failed`. Incident status: `open`, `mitigating`, `resolved`.
- Every change records `proposed_by`, `approved_by`, `applied_by` (and
  `rejected_by`), beside each that person's `sub` (`proposed_by_sub` and so
  on) and the agents that acted for them, from the token's `act`
  (`proposed_via`, `approved_via`, `applied_via`), and one operation
  identifier. A token without `sub` can neither propose nor approve.
- `apply_change` changes the selection through the Helm release (the release
  stays the only writer of the Deployment), then verifies with a real search
  request before marking the change `applied`.
- A refusal is a structured error: `{"error": "forbidden", "layer": "service",
  "rule": "<rule_name>", "message": "..."}`.

The "Allowed role" column is enforced twice, and the agent column once, at
the gateway. At the gateway it is the `tools`
map in `agent-deployments/clusters/dev/domains/operations/delivery-mcp.yaml`; a tool
that is not listed there is hidden from everyone. A token with `act` also needs
its newest agent listed for the tool, in `toolActors` in the same file. The
service checks the same roles again, with the rules only it can know. How the
service is built is in
[`components/delivery-mcp/README.md`](../components/delivery-mcp/README.md).

## Agents

| Agent | Called with | Does |
|---|---|---|
| `diagnosis-agent` | Text naming the service and the alert | Read-only investigation; returns suspected cause, evidence and a recommended version |
| `remediation-agent` | `{"action": "apply_and_verify", "change_id": "..."}` | Calls `apply_change` as the caller and reports the verified result |
| `comms-agent` | `{"action": "draft_status_update", "incident_id": "..."}` | Returns a draft; it does not post |
| `chat-assistant` | Chat text and A2UI actions | Orchestrates; renders the incident card |

Button actions (propose, approve, apply) are handled by code that calls the
tool or agent directly. The model is used for diagnosis, chat answers and the
status draft, never to decide whether a button's action runs.

## Routes

Everything below is deployed and was driven end to end through the gateway
with real Keycloak and chain-sts tokens and the real model.

| Route on the gateway | Reaches | Who may call |
|---|---|---|
| `/mcp/delivery` | `delivery-mcp` | Per-tool rules by role, as in the tool table |
| `/a2a/remediation-agent` | `remediation-agent` | `platform-engineer` |
| `/a2a/comms-agent` | `comms-agent` | `incident-manager` |
| `/a2a/chat-assistant` | `chat-assistant` | Any signed-in role, with a token for `agentgateway` or a Chat UI sign-in (`chat-assistant`) |
| `POST /hooks/alert`, and `/a2a/chat-assistant/hooks` | `chat-assistant` | `alert-automation` |
| `/a2a/diagnosis-agent` | `diagnosis-agent` | Any valid token |
| `/mcp/observability` | `observability-mcp` | Any valid token; every tool only reads |
| `/v1/messages`, `/v1/chat/completions`, `/v1/models` | The model provider | Any valid token; approved models only |
| `/workloads/diagnosis-agent/v1/...`, `/workloads/diagnosis-agent/mcp/observability` | The model provider, `observability-mcp` | Only the key the gateway issued to `diagnosis-agent` |

- **Agents acting for a user.** A token with `act` is let in only when
  chain-sts signed it for this route's target (the route's `resource`, from
  `delegation.resources`) and the route's `actors` lists its newest agent,
  and the roles above still apply. `/a2a/remediation-agent`, `/a2a/comms-agent`
  and `/a2a/diagnosis-agent` take `chat-assistant`; the model route takes
  `chat-assistant`, `remediation-agent` and `comms-agent`; `/mcp/delivery`
  takes all three and then decides per tool (`toolActors`): `apply_change`
  `remediation-agent` only, `list_incidents` and `get_incident` all three,
  every other tool `chat-assistant` only. `/a2a/chat-assistant`, the alert
  hook and `/mcp/observability` name no target and do not trust chain-sts
  at all, and refuse any token with `act`. A token without
  `act`, a person's or the alert's own, must come from Keycloak, and is then
  decided by the roles alone.
- Who may call a route is one file per route in
  `agent-deployments/clusters/dev/domains/operations/`: the roles (`allow`),
  the agents (`actors`) and the target chain-sts's tokens must be for
  (`resource`). For the model route it
  is `agent-deployments/clusters/dev/platform/30-model-route/access.yaml`, and
  a workload's own door to the model is the release
  `<workload>-model-access` in its workload's helmfile. The releases that
  read the files are in the `helmfile.yaml` next to them, or, for
  `diagnosis-agent` and `observability-mcp`, in the workload's helmfile.
- Base URL: in-cluster `http://agentgateway-proxy.agentgateway-system.svc.cluster.local`,
  from the host `http://localhost:18080`.
- **What a gateway refusal looks like.** A tool the caller's role, or the
  acting agent, lacks is absent from `tools/list`, and calling it returns
  HTTP 400 with JSON-RPC `{"code": -32602, "message": "unknown resource"}`,
  the same as a tool that does not exist (Agentgateway 1.6 said
  `Unknown tool: <name>`). Agent and hook routes return 403
  `authorization failed` for the wrong role or acting agent. Every route
  returns 401 `authentication failed` without a token, and for a chain-sts
  token issued for another target or at a route that takes none; from 1.7
  the reason for a 401 is only in the proxy's log.

## Audit records

Every source that writes an audit record names the same things the same way,
so that Loki finds a person, a session or a change across all of them
([`cluster.md`](cluster.md#the-audit-trail)). In Loki a dot becomes an
underscore: `user.id` is `user_id`.

| Field | Meaning | Written by |
|---|---|---|
| `user.id` | The person or client: `preferred_username`, or the API server's user name | all |
| `user.sub` | The token's `sub`; a person's is fixed in the realm file | gateway, delivery-mcp, chain-sts, Keycloak |
| `user.issuer`, `user.client` | The token's `iss` and `azp` | gateway, delivery-mcp, chain-sts (issuer), Keycloak (client) |
| `user.roles`, `user.team` | The claims the routes' and services' rules read | gateway, delivery-mcp |
| `session.id` | The sign-in session, the token's `sid` | gateway, delivery-mcp, Keycloak |
| `token.jti` | One token; chain-sts writes it when it issues one | gateway, delivery-mcp, chain-sts |
| `token.aud` | The audience of a token chain-sts issued | chain-sts |
| `actor.sub` | The newest agent, the token's `act.sub`: its service account | gateway |
| `actor.chain` | The agents acting for the user, newest first, comma-separated | gateway, delivery-mcp, chain-sts |
| `audit.event` | What happened: `change.applied`, `token_exchange`, `keycloak.LOGIN`, `kubernetes.patch` | delivery-mcp, chain-sts, Keycloak, API server |
| `audit.outcome` | `allowed`, `refused`, `succeeded`, `failed`, `issued`. For the API server, refused is a 401 or 403 and failed any other error, such as a 404 or 409 | delivery-mcp, chain-sts, Keycloak, API server |
| `audit.rule` | The rule or reason behind a refusal or a failure | delivery-mcp, chain-sts, Keycloak, API server (its response's message) |
| `incident.id`, `change.id`, `operation.id`, `helm.revision` | What a delivery-mcp record concerns; `operation.id` is unique | delivery-mcp |

A field with no value is left out, never written empty. A record's trace is
its own `trace_id`. Keycloak's events and the API server's records are given
these names by the collector (`40-observability/collector.yaml.gotmpl`);
the others write them.

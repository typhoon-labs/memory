# Contracts

What every part of the demo agrees on: identities, model access, how
components are bound to each other, the tools and their rules, and the routes.
Where a contract is enforced by configuration, the file is named.

The cluster these run in (ports, namespaces, commands) is in
[`cluster.md`](cluster.md). What each component does beyond its contract is in
its own README under `components/`. If something here is wrong or you must
deviate, see [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Identity (Keycloak stands in for Okta)

- Realm `demo`. Issuer as seen by browsers and in tokens:
  `http://localhost:18081/realms/demo`. In-cluster services fetch keys from the
  Keycloak Service, not from localhost.
- Token audience for everything behind the gateway: `agentgateway`.
- Claims every access token carries: `preferred_username`, `roles` (array, top
  level), `team` (string).

| User | `roles` | `team` | Password (demo only) |
|---|---|---|---|
| `developer` | `developer` | `search` | `demo` |
| `developer-other-team` | `developer` | `registration` | `demo` |
| `incident-manager` | `incident-manager` | `incident` | `demo` |
| `platform-engineer` | `platform-engineer` | `platform` | `demo` |

| Client | Type | Use |
|---|---|---|
| `chat-ui` | Public, authorization code with PKCE | Browser sign-in |
| `mcp-client` | Public, authorization code with PKCE | An existing MCP client (backup act) |
| `alert-automation` | Confidential, client credentials; `roles: [alert-automation]`, `team: automation` | The alert that triggers diagnosis |
| `demo-cli` | Public, direct grant (user and password) | `task token -- <user>`, and through it the scripts, checks and drills |
| `kagent-ui` | Confidential, authorization code with PKCE | Sign-in to the kagent UI, by its sign-in proxy. Its tokens do not carry the audience `agentgateway`, so the gateway refuses them |

The caller's identity always comes from the verified bearer token. No tool,
agent or endpoint accepts a user name, role or team as an argument or header.
Each hop forwards the caller's bearer token to the next hop.

One door is not the gateway: the kagent UI at `http://localhost:18087`, an
operator's console for `platform-engineer` only. Its sign-in proxy verifies
the session, and a chat started there reaches `diagnosis-agent` through
kagent's controller, outside the route `/a2a/diagnosis-agent` and its policy.
The agent's own model and tool calls still go through the gateway. See
[`60-kagent/README.md`](../agent-deployments/clusters/dev/platform/60-kagent/README.md).

The three values every gateway policy reads (issuer, audience, key URL) are in
`agent-deployments/clusters/dev/identity.yaml`.

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
OpenAI-compatible `/v1/chat/completions`, with `Authorization: Bearer <token>`.
The gateway adds `anthropic-version`, drops `x-api-key`, and refuses a missing
or wrong token with 401 and an unapproved model with 403.

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

Binding variables: `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUDIENCE`,
`DELIVERY_MCP_URL`, `OBSERVABILITY_MCP_URL`, `REMEDIATION_AGENT_URL`,
`COMMS_AGENT_URL`, `DIAGNOSIS_AGENT_URL`, `APP_VERSION`. `OIDC_JWKS_URL` is
where the issuer's keys are fetched: in the cluster, the Keycloak Service.
Every other `*_URL` names a component: in the cluster it points at that
component's gateway route, in local development straight at the component.

## delivery-mcp tools

The service holds incident and change state and enforces the rules below
itself, whatever the gateway allowed.

| Tool | Arguments | Allowed role | Service rule |
|---|---|---|---|
| `list_incidents` | - | any signed-in | - |
| `get_incident` | `incident_id` | any signed-in | - |
| `open_incident` | `service`, `severity`, `summary`, `impact` | `alert-automation` | One open incident per service |
| `record_diagnosis` | `incident_id`, `suspected_cause`, `evidence[]`, `recommended_version` | `alert-automation` | - |
| `propose_change` | `incident_id`, `target_version` | `developer` | Caller's `team` owns the service; target is a retained earlier version |
| `approve_change` | `change_id` | `incident-manager` | Approver is not the proposer |
| `reject_change` | `change_id`, `reason` | `incident-manager` | - |
| `apply_change` | `change_id` | `platform-engineer` | Change is approved; idempotent on `change_id` |
| `restart_workload` | `service` | `platform-engineer` | No approval needed |
| `post_status_update` | `incident_id`, `text` | `incident-manager` | - |

- Change status: `proposed`, `approved`, `rejected`, `applying`, `verifying`,
  `applied`, `failed`. Incident status: `open`, `mitigating`, `resolved`.
- Every change records `proposed_by`, `approved_by`, `applied_by` and one
  operation identifier.
- `apply_change` changes the selection through the Helm release (the release
  stays the only writer of the Deployment), then verifies with a real search
  request before marking the change `applied`.
- A refusal is a structured error: `{"error": "forbidden", "layer": "service",
  "rule": "<rule_name>", "message": "..."}`.

The "Allowed role" column is enforced twice. At the gateway it is the `tools`
map in `agent-deployments/clusters/dev/domains/operations/delivery-mcp.yaml`; a tool
that is not listed there is hidden from everyone. The service checks the same
roles again, with the rules only it can know. How the service is built is in
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
with real Keycloak tokens and the real model.

| Route on the gateway | Reaches | Who may call |
|---|---|---|
| `/mcp/delivery` | `delivery-mcp` | Per-tool rules by role, as in the tool table |
| `/a2a/remediation-agent` | `remediation-agent` | `platform-engineer` |
| `/a2a/comms-agent` | `comms-agent` | `incident-manager` |
| `/a2a/chat-assistant` | `chat-assistant` | Any signed-in role |
| `POST /hooks/alert` | `chat-assistant` | `alert-automation` |
| `/a2a/diagnosis-agent` | `diagnosis-agent` | Any valid token |
| `/mcp/observability` | `observability-mcp` | Any valid token; every tool only reads |
| `/v1/messages`, `/v1/chat/completions` | The model provider | Any valid token; approved models only |
| `/workloads/diagnosis-agent/v1/...`, `/workloads/diagnosis-agent/mcp/observability` | The model provider, `observability-mcp` | Only the key the gateway issued to `diagnosis-agent` |

- Who may call a route is one file per route in
  `agent-deployments/clusters/dev/domains/operations/`. For the model route it
  is `agent-deployments/clusters/dev/platform/30-model-route/access.yaml`, and
  a workload's own door to the model is the release
  `<workload>-model-access` in its workload's helmfile. The releases that
  read the files are in the `helmfile.yaml` next to them, or, for
  `diagnosis-agent` and `observability-mcp`, in the workload's helmfile.
- Base URL: in-cluster `http://agentgateway-proxy.agentgateway-system.svc.cluster.local`,
  from the host `http://localhost:18080`.
- **What a gateway refusal looks like.** A tool the caller's role lacks is
  absent from `tools/list`, and calling it returns HTTP 400 with JSON-RPC
  `{"code": -32602, "message": "Unknown tool: <name>"}`, the same as a tool
  that does not exist. Agent and hook routes return 403 `authorization failed`
  for the wrong role and 401 without a token.

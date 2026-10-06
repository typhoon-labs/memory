# chat-assistant

The chat assistant and the Chat UI of the demo, in one image.

- **Server** (`packages/server`): an A2A endpoint with the A2UI extension
  v0.9.1. It renders the incident card, carries out the card's button actions
  as the signed-in user, answers chat text with a Mastra agent, and takes the
  alert webhook.
- **UI** (`packages/ui`): a React page that signs in with Keycloak, talks A2A to
  the server from the browser, and draws the card with A2UI's React renderer.

The server holds no credential. It verifies the caller's bearer token on every
request and forwards that same token on every call it makes: to `delivery-mcp`,
to the other agents and to the model route. Who may do what is decided by the
gateway and by `delivery-mcp`, never here.

## What it serves

| Request | Does | Caller |
|---|---|---|
| `POST /` (alias `POST /a2a`) | A2A JSON-RPC; a streaming method answers as Server-Sent Events | Bearer token |
| `GET /.well-known/agent-card.json` | Agent card; declares the A2UI extension | None |
| `POST /hooks/alert` | Prometheus Alertmanager webhook | Bearer token with role `alert-automation` |
| `GET /config.json` | Runtime settings for the UI | None |
| `GET /healthz` | Liveness | None |
| `GET /*` | The built UI | None |

A2A 1.0 and 0.3 are both served on the same URL. The request header
`A2A-Version: 1.0` selects 1.0 (`SendMessage`, `SendStreamingMessage`); without
it the request is read as 0.3 (`message/send`, `message/stream`). The UI uses
1.0, because only 1.0 carries A2UI's array of messages as the specification
writes it; over 0.3 the SDK wraps the array as `{"value": [...]}`.

In the cluster the browser reaches the A2A endpoint through the gateway at
`http://localhost:18080/a2a/chat-assistant` and the UI at
`http://localhost:18083`.

### Why the A2A endpoint is not Mastra's

Mastra serves agents over A2A itself, but that endpoint cannot carry A2UI: it
returns text parts only, rejects an incoming data part (a button click is one),
has no way to declare an extension in the agent card, and lets a request body
set values in the request context. `task chat-assistant:spike` shows each of
these. The endpoint is therefore built with the A2A JavaScript SDK in the same
process, and its executor calls the Mastra agent for chat text.

## One message, three kinds

The executor (`src/a2a/executor.ts`) sorts each incoming message:

| The message carries | Handled by | Answer |
|---|---|---|
| An A2UI action (a button click) | Code (`src/actions.ts`) | A task: `completed`, `rejected` for a refusal, or `failed` |
| A sync request (the UI's poll) | Code | A message with the A2UI needed to bring the card up to date |
| Text | The Mastra agent (`src/chat/agent.ts`) | A task; the reply streams as artifact updates |

A2UI travels in a data part with `metadata.mimeType: application/a2ui+json`
whose `data` is an array of `createSurface`, `updateComponents`,
`updateDataModel` and `deleteSurface` messages.

## The incident card

`src/card/incident-card.ts` builds the card from `get_incident` with components
of the A2UI basic catalog. No model is involved.

- **Same body for everyone:** summary, service, severity, status, running
  version, impact, the proposed change with its status and five progress
  steps, then the suspected cause, the evidence and a short timeline.
- **Action row by role**, read from the token's `roles`. It sits above the
  cause and the evidence, so the buttons need no scrolling and do not move
  when a long diagnosis arrives:

  | Role | Buttons |
  |---|---|
  | `developer` | Propose rollback to the recommended version |
  | `incident-manager` | Approve; Reject with a reason; Draft status update; Post status update |
  | `platform-engineer` | Apply rollback, enabled only once the change is approved; Restart |

- **A button that does not apply is disabled, not removed.** Its `checks` rule
  reads the data model under `/can`. A2UI's `updateComponents` adds and updates
  components and cannot remove one, so the card only ever grows.
- **Updates are in place.** The card keeps its own list of children fixed and
  fills lists inside it (the evidence, for example). This matters: the React
  renderer rebuilds the children of a container whose list changes, which
  would replace a button while someone is about to press it.
- **The server keeps no state per browser.** Each surface is created with
  `sendDataModel: true`, so the browser reports its data model with every
  request. The model carries the card's version and component list, and
  `src/card/sync.ts` sends only what is missing: usually nothing.
- **The UI polls about every 2 seconds**, which is how one role's approval
  appears for the others. A poll never overwrites what a viewer is typing: the
  reject reason, the status draft and the outcome of the viewer's last action
  are written only when an action produces them.

While there is no diagnosis the card says where it stands: "Diagnosing…" while
the alert hook's diagnosis runs, "Diagnosis failed: …" if it failed or timed
out, or "No diagnosis recorded yet". Without a recommended version the
developer can type the version to roll back to; `delivery-mcp` checks it.

## Actions

| Button | Action name | Calls, as the signed-in user |
|---|---|---|
| Propose rollback | `propose_rollback` | `delivery-mcp` tool `propose_change` |
| Approve | `approve_change` | `delivery-mcp` tool `approve_change` |
| Reject | `reject_change` | `delivery-mcp` tool `reject_change` |
| Apply rollback | `apply_change` | `remediation-agent`: `{"action": "apply_and_verify", "change_id": …}` |
| Restart | `restart_workload` | `delivery-mcp` tool `restart_workload` |
| Draft status update | `draft_status_update` | `comms-agent`: `{"action": "draft_status_update", "incident_id": …}` |
| Post status update | `post_status_update` | `delivery-mcp` tool `post_status_update` |

While Apply runs, the server re-reads the incident every second and streams
the card as it moves through applying, verifying and resolved.

A refusal is shown in the chat pane and on the card, naming who refused:

- **Refused by the gateway:** HTTP 401 or 403 from a route, or a tool the
  gateway does not offer the caller (it answers HTTP 400, `Unknown tool`).
- **Refused by the service:** `delivery-mcp`'s own rule, by name, for example
  `team_owns_service`.

The card offers each role exactly the actions the gateway grants that role, so
a signed-in user cannot reach a gateway refusal from the card as deployed. It
would show if a grant were removed at the gateway while the card still offered
the button, or for a request sent without the card (`task chat-assistant:walk`
does this against the stubs).

## Alert hook

`POST /hooks/alert` takes a standard Alertmanager webhook body. For each firing
alert (the service is the label `service`, else `app`, else `job`):

1. `open_incident`, so the card exists at once;
2. answer the webhook, with the incident id and `diagnosis: started`;
3. ask `diagnosis-agent` (measured: 14 to 18 seconds) while the card says "Diagnosing…";
4. `record_diagnosis`; the card fills in on each viewer's next poll.

There is one open incident per service, and the hook is safe to repeat: a
repeated alert opens nothing, and starts the diagnosis again only if the
incident has none and none is running. The "diagnosing" and "failed" notes are
kept in this process's memory; after a restart the card says only that no
diagnosis is recorded.

## Chat

Chat text goes to a Mastra agent on the model at `MODEL_BASE_URL` (Anthropic
Messages API), called with the user's token as `Authorization: Bearer`. The
agent can read incidents (`list_incidents`, `get_incident`) and ask
`diagnosis-agent`. It has no tool that changes anything.

## Settings

All settings are environment variables (`packages/server/src/config.ts`).

| Variable | Meaning | Default |
|---|---|---|
| `PORT`, `HOST` | Where the server listens | `8080`, `0.0.0.0` |
| `APP_VERSION` | Reported in `/healthz`, the agent card and telemetry | `0.0.0-dev` |
| `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUDIENCE` | Whose tokens are trusted. The issuer is what tokens say; the keys may be fetched from another address | Required; audience `agentgateway` |
| `MODEL_BASE_URL`, `MODEL_ID` | The model route and the chat model | `http://localhost:7070`, `claude-sonnet-5-5` |
| `MODEL_TIMEOUT_SECONDS` | All the time one chat answer may take | `60` |
| `DELIVERY_MCP_URL` | `delivery-mcp`. A URL with a path is used as given; without one, `/mcp` is added | Required unless stubs |
| `REMEDIATION_AGENT_URL`, `COMMS_AGENT_URL` | The agents' A2A URLs | Empty |
| `DIAGNOSIS_AGENT_URL` | `diagnosis-agent`'s A2A URL. Empty: no diagnosis is attempted | Empty |
| `DIAGNOSIS_TIMEOUT_SECONDS` | How long one diagnosis may take | `60` |
| `A2A_PUBLIC_URL` | The address written in the agent card | `http://localhost:<PORT>` |
| `CORS_ALLOWED_ORIGINS` | Origins a browser may call from, comma-separated. Empty when a gateway in front answers CORS | Empty |
| `UI_A2A_URL` | The A2A URL the UI is told to use. Empty: the origin the UI was loaded from | Empty |
| `UI_A2A_PROTOCOL_VERSION` | `1.0` or `0.3` | `1.0` |
| `UI_OIDC_ISSUER`, `UI_OIDC_CLIENT_ID`, `UI_OIDC_SCOPE` | Sign-in settings for the UI | `OIDC_ISSUER`, `chat-ui`, `openid profile` |
| `UI_POLL_INTERVAL_MS` | How often the UI polls | `2000` |
| `UI_DIST_DIR` | Where the built UI is | `packages/ui/dist` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` and the other `OTEL_*` | Traces are exported when the endpoint is set | Off |
| `STUB_DOWNSTREAMS=1` | In-memory fakes for `delivery-mcp` and the three agents, with the same rules. `STUB_SEED=0` starts without an incident; `STUB_PHASE_MS` and `STUB_DIAGNOSIS_MS` set how long the fake rollout phases and the fake diagnosis take | Off |
| `DEV_TEST_ISSUER=1` | A sign-in issuer for local work, with a key made at start-up and no passwords. It refuses to start in a cluster or with `NODE_ENV=production` | Off |

The selection for the dev cluster is
`agent-deployments/clusters/dev/workloads/chat-assistant/values.yaml`.

## Tasks

From the repository root, `mise exec -- task chat-assistant:<task>`:

| Task | Does |
|---|---|
| `test` | Type checks and the tests. They use the stubs, a test issuer and a fake model; nothing outside this machine is called |
| `run-local` | Server on `:18193` and UI on `:18194`, with stubs and the test issuer unless variables say otherwise (`scripts/local.sh`) |
| `stop-local` | Stops them |
| `walk` | Walks the incident over A2A as every role against the local server: each card, each action, each refusal |
| `build`, `push` | The image `localhost:5002/chat-assistant:<version>` |
| `spike` | Shows what Mastra's built-in A2A endpoint can and cannot do |

To deploy a new version: raise `CHAT_ASSISTANT_VERSION` in `Taskfile.yml` and
`image.tag` in the selection, then `task chat-assistant:build chat-assistant:push`
and `task deploy -- -l name=chat-assistant`.

## Known limits

- One replica. Tasks, chat history and the diagnosis notes are in memory.
- `get_incident` does not say which version is running, so the card shows it
  only once a change exists.
- The UI replaces the React renderer's Button with its own for the same
  catalog entry: `@a2ui/react` 0.12.0 publishes Button without its class
  names, so the primary action could not be styled.
- Two users in one browser profile share Keycloak's session cookie. To sign in
  as a second role in another tab, choose "Restart login" on Keycloak's
  re-authentication page, or use a private window per role.

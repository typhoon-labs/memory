# chat-assistant

The chat assistant and the Chat UI of the demo, in one image.

- **Server** (`packages/server`): an A2A endpoint with the A2UI extension
  v0.9.1. It renders the incident card, carries out the card's button actions
  as the signed-in user, answers chat text with a Mastra agent, and takes the
  alert webhook.
- **UI** (`packages/ui`): a React page (Vite, Tailwind CSS, shadcn/ui) that
  signs in with Keycloak, talks A2A to the server from the browser, and draws
  the card with A2UI's React renderer. The incident is in the middle, the
  chat pane on its right and, once there is more than one incident, the list
  of incidents on its left; in a narrow window the chat comes after the
  incident. The page is white and gray, and color says two things. Whose tab it is: a
  line along the top, the role's name beside the app's, the step it is the
  viewer's turn on and the tab's icon take the role's color, blue for
  `developer`, violet for `incident-manager`, teal for `platform-engineer`.
  And what a status or an outcome means: red for an incident that is open or
  critical and for a refusal by the gateway, amber for an incident being
  mitigated and for a refusal by the service, green for resolved. The theme
  is in `packages/ui/src/index.css`.

The server holds no credential. It verifies the caller's bearer token on every
request and forwards that same token on every call it makes: to `delivery-mcp`,
to the other agents and to the model route. Who may do what is decided by the
gateway and by `delivery-mcp`, never here.

## What it serves

| Request | Does | Caller |
|---|---|---|
| `POST /` (alias `POST /a2a`) | A2A JSON-RPC; a streaming method answers as Server-Sent Events | Bearer token |
| `GET /.well-known/agent-card.json` (also under `/a2a/`) | Agent card; declares the A2UI extension | None here. The gateway route asks for a token, as for all of `/a2a/chat-assistant` |
| `POST /hooks/alert` | Prometheus Alertmanager webhook | Bearer token with role `alert-automation` |
| `GET /config.json` | Runtime settings for the UI | None |
| `GET /healthz` | Liveness | None |
| `/dev/issuer/*` | The test issuer, only with `DEV_TEST_ISSUER=1` | None |
| `GET /*` | The built UI | None |

A2A 1.0 and 0.3 are both served on the same URL. The request header
`A2A-Version: 1.0` selects 1.0 (`SendMessage`, `SendStreamingMessage`); without
it the request is read as 0.3 (`message/send`, `message/stream`). The UI uses
1.0, because only 1.0 carries A2UI's array of messages as the specification
writes it; over 0.3 the SDK wraps the array as `{"value": [...]}`.

In the cluster the browser reaches the A2A endpoint through the gateway at
`http://localhost:18080/a2a/chat-assistant` and the UI at
`http://localhost:18083`.

### Behind the gateway

- The gateway route `/a2a/chat-assistant` must strip the prefix, pass
  `Authorization` through, answer the CORS preflight without a token for
  origin `http://localhost:18083` (methods GET and POST; headers
  Authorization, Content-Type, Accept, A2A-Version, A2A-Extensions,
  X-A2A-Extensions, traceparent, tracestate), and pass `text/event-stream`
  unbuffered for 5 minutes.
- Keycloak client `chat-ui` already accepts `http://localhost:18083` and
  `http://localhost:18194`.

The route's settings are
`agent-deployments/clusters/dev/domains/operations/chat-assistant.yaml`. The
alert hook has a route of its own, `chat-assistant-alert-hook.yaml` next to
it: `POST /hooks/alert` on the gateway, for the role `alert-automation` only.

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
| A sync request (the UI's poll) | Code | A message with the list of incidents and the A2UI needed to bring the card up to date |
| Text | The Mastra agent (`src/chat/agent.ts`) | A task; the reply streams as artifact updates |

A2UI travels in a data part with `metadata.mimeType: application/a2ui+json`
whose `data` is an array of `createSurface`, `updateComponents`,
`updateDataModel` and `deleteSurface` messages.

## The incident card

`src/card/incident-card.ts` builds the card from `get_incident`. No model is
involved. Its components come from the incident catalog: A2UI's basic catalog
and four components of this app's own, for what the basic catalog cannot say.

| Component | Says |
|---|---|
| `Steps`, `Step` | The five steps of a change. A step has a state (pending, current, done or failed), an owner, a note, a time, and the viewer's controls |
| `Badge` | The incident's status and its severity, each with a tone |
| `Notice` | What the viewer's last action came to, when it was refused or failed |

The catalog is defined in `packages/ui/src/incident-catalog.ts`, as schemas,
and drawn in `packages/ui/src/catalog.tsx`. Its id is
`agentgateway-demo:chat-assistant/incident-catalog/v1`: a name, not an
address. The agent card lists it, and the UI says with every request that it
can draw it (`a2uiClientCapabilities`). A client that names other catalogs
only is sent no card, and a sentence saying why. The server's tests check
every card against the same schemas, with A2UI's own strict validation.

- **Same for everyone:** the summary, the status and severity, the service
  and its running version, the impact, the five steps with who owns each and
  who did it when, then the suspected cause, the evidence and a short
  timeline.
- **Controls by role**, read from the token's `roles`. They sit on the step
  the role performs. The steps are above the cause and the evidence, so the
  controls need no scrolling and do not move when a long diagnosis arrives:

  | Role | Step | Controls |
  |---|---|---|
  | `developer` | Propose | Propose rollback to the recommended version |
  | `incident-manager` | Approve | Approve; Reject with a reason. Below the steps, under "Status update": Draft status update; Post status update |
  | `platform-engineer` | Apply | Apply rollback, enabled for a change that is proposed or approved. Beside the title: Restart |

- **A step draws its controls only while they apply** (`open`), and takes a
  wash of the role's color when it is the viewer's turn (`turn`). The
  approver's buttons, for example, are there while a change is proposed and
  at no other time.
- **Apply is not held back until approval.** The card does not decide whether
  a change may be applied; `delivery-mcp` does. A `platform-engineer` who
  presses Apply on a change that is only proposed gets the service's refusal
  on the card (see Actions). With no change, or one that is already running
  or finished, there is nothing to apply and the button is not drawn.
- **A control that does not apply is disabled, never removed.** Its `checks`
  rule reads the data model under `/can`, and a step whose controls do not
  apply stops drawing them. A2UI's `updateComponents` adds and updates
  components and cannot remove one, so the card only ever grows. One
  component does have to go, rarely: the version field a developer is offered
  while there is no diagnosis, once a diagnosis names a version. The card is
  then deleted and created again (`src/card/sync.ts`).
- **Updates are in place.** The card keeps its own list of children fixed and
  fills lists inside it (the evidence and the timeline's rows, for example).
  This matters: the React renderer rebuilds the children of a container whose
  list changes, which would replace a button while someone is about to press
  it.
- **The server keeps no state per browser.** Each surface is created with
  `sendDataModel: true`, so the browser reports its data model with every
  request. The model carries the card's version and component list, and
  `src/card/sync.ts` sends only what is missing: usually nothing.
- **The UI polls about every 2 seconds**, which is how one role's approval
  appears for the others. A poll never overwrites what a viewer is typing: the
  reject reason, the status draft and the outcome of the viewer's last action
  are written only when an action produces them.

While there is no diagnosis the card says where it stands. Under "Suspected
cause": "Diagnosing…" while the alert hook's diagnosis runs, "Diagnosis
failed: …" if it failed or timed out, or "No diagnosis recorded yet". On the
Propose step: "Waiting for the diagnosis", with the button disabled. Without a
recommended version the developer can type the version to roll back to;
`delivery-mcp` checks it.

## More than one incident

The card shows one incident. With nothing picked that is the current one: the
newest that is not resolved, or, when every one is resolved, the most recent.
A resolved incident therefore stays on the card until another is opened.

The others are in the list on the left, newest first: the id, the status or
the time it was resolved (UTC), the summary, and where its change stands
("Rollback to 2.0.0 proposed", "Rolled back to 2.0.0"). Picking a row puts
that incident on the card; a resolved one is the same card with nothing left
to press. The list is drawn only when there are at least two incidents, so
with one the page is the card and the chat.

- **The list comes with the poll.** `src/card/incident-list.ts` builds it
  from `list_incidents`, as the caller. It travels in the sync reply's own
  data part (`incidents`, and `shown` for the incident on the card) as plain
  data, not as A2UI: it is how a viewer chooses what the card shows, so the
  page draws it (`packages/ui/src/IncidentList.tsx`).
- **A pick is part of the sync request.** The UI sends
  `{"request": "sync", "incident": "INC-0001"}` and is answered with that
  incident's card; the card of the incident it showed before is deleted. A
  request that names no incident, or one that does not exist, is answered
  with the current incident. Other clients (`task chat-assistant:walk`, the
  demo's scripted incident) name none.
- **A button acts on the incident of its card**, and the card stays on that
  incident while the action runs, whichever incident is current.
- **A newly opened incident takes the card**, whatever the viewer had picked.

### The panels beside the card

The list and the chat each have a button on their edge, halfway down the
window, that closes the panel and brings it back. Closed, the panel is gone,
the card has its room, and the button is on the window's edge. The choice is
kept in the browser (`localStorage`, `chat-assistant.panel.*`).

- Until the viewer chooses, the list is open only where the window has room
  for it beside the chat without narrowing the card: from 85rem. With the
  chat closed the list has the chat's room, and is open from 60rem. A viewer
  who opens it in a narrower window gets a narrower card, whose steps then
  stack.
- A button pressed on the card reports in the chat. While the chat is closed
  its edge button carries a dot for anything that arrived there.
- The window scrolls the incident, and the bar at the top, the list and the
  chat stay in place. The incident's scrollbar is then the window's, at the
  far right, and not on the edge of the chat, where the chat's button is.
- In one column (a window under 60rem) the chat is under the incident and is
  not closed, and the list opens over the page from its edge button.

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

The chat pane gets one entry for each button pressed: the words on the
button, and what the action came to.

A refusal is shown in the chat pane and on the card, in the same three parts:
who refused, why in a sentence, and the name of the service's rule if one
did.

- **Refused by the gateway** (red): HTTP 401 or 403 from a route, or a tool
  the gateway does not offer the caller (it answers HTTP 400, `Unknown tool`).
  An agent's report that its own tool call was turned away before it reached
  the service (`outcome: rejected`) is shown the same way, and so is a 401 or
  403 from the model route on a chat answer.
- **Refused by the service** (amber): `delivery-mcp`'s own rule, in plain
  words with the rule's name after them. The words for each rule are in
  `src/downstream/types.ts`; a rule without words there is shown with the
  service's own message.

An action that fails for another reason is shown the same way, in gray, headed
"Failed".

On the card this sits under the button that was pressed, and belongs to the
viewer who pressed it: other viewers' cards do not change. An action that goes
through leaves nothing there; the steps move instead. What is there is
replaced by the outcome of that viewer's next action and cleared when the card
moves on, for example when the change is approved.

Apply before approval is the case the demo shows. The click takes the same
path as any apply: `remediation-agent` is asked as the signed-in user and
calls `apply_change`, and `delivery-mcp` refuses with rule
`change_is_approved`. Under the Apply button the card then reads "Refused by
the service", and below that "This change has not been approved yet. Rule
`change_is_approved`". The chat pane says the same. The change stays proposed,
Apply stays enabled, and a second click is refused again.

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
| `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_AUDIENCE` | Whose tokens are trusted. The issuer is what tokens say; the keys may be fetched from another address | Required, unless `DEV_TEST_ISSUER=1`; audience `agentgateway` |
| `MODEL_BASE_URL`, `MODEL_ID` | The model route and the chat model | `http://localhost:7070`, `claude-sonnet-5-5` |
| `MODEL_TIMEOUT_SECONDS` | All the time one chat answer may take | `60` |
| `DELIVERY_MCP_URL` | `delivery-mcp`. A URL with a path is used as given; without one, `/mcp` is added | Required unless stubs |
| `REMEDIATION_AGENT_URL`, `COMMS_AGENT_URL` | The agents' A2A URLs | Empty |
| `DIAGNOSIS_AGENT_URL` | `diagnosis-agent`'s A2A URL. Empty: no diagnosis is attempted | Empty |
| `DIAGNOSIS_TIMEOUT_SECONDS` | How long one diagnosis may take | `60` |
| `A2A_PUBLIC_URL` | The address written in the agent card | `http://localhost:<PORT>` |
| `CORS_ALLOWED_ORIGINS` | Origins a browser may call from, comma-separated, or `*`. Empty when a gateway in front answers CORS | Empty |
| `UI_A2A_URL` | The A2A URL the UI is told to use. Empty: the origin the UI was loaded from | Empty |
| `UI_A2A_PROTOCOL_VERSION` | `1.0` or `0.3` | `1.0` |
| `UI_OIDC_ISSUER`, `UI_OIDC_CLIENT_ID`, `UI_OIDC_SCOPE` | Sign-in settings for the UI | `OIDC_ISSUER`, `chat-ui`, `openid profile` |
| `UI_POLL_INTERVAL_MS` | How often the UI polls | `2000` |
| `UI_DIST_DIR` | Where the built UI is | `packages/ui/dist` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` and the other `OTEL_*` | Traces are exported when the endpoint is set | Off |
| `DEPLOYMENT_ENVIRONMENT` | `deployment.environment` in telemetry | `dev` |
| `STUB_DOWNSTREAMS=1` | In-memory fakes for `delivery-mcp` and the three agents, with the same rules. `STUB_SEED=0` starts without an incident; `STUB_PHASE_MS` (2500) and `STUB_DIAGNOSIS_MS` (3000) set how long the fake rollout phases and the fake diagnosis take | Off |
| `DEV_TEST_ISSUER=1` | A sign-in issuer for local work, with a key made at start-up and no passwords. It refuses to start in a cluster or with `NODE_ENV=production` | Off |

The selection for the dev cluster is
`agent-deployments/clusters/dev/workloads/chat-assistant/values.yaml`.

## Tasks

From the repository root, `mise exec -- task chat-assistant:<task>`:

| Task | Does |
|---|---|
| `test` | Type checks and the tests. They use the stubs, a test issuer and a fake model; nothing outside this machine is called |
| `install` | The locked packages (`npm ci`); the other tasks run it when they need it |
| `run-local` | Server on `:18193` and UI on `:18194`, with stubs and the test issuer unless variables say otherwise (`scripts/local.sh`). The chat model is the fast one, `claude-haiku-4-5-20251001`, unless `MODEL_ID` or `MODEL_ID_FAST` is set |
| `stop-local` | Stops them |
| `walk` | Walks the incident over A2A as every role against the local server: each card, each action, each refusal |
| `build-app` | The UI (Vite) and the server (tsc), without Docker |
| `build`, `push` | The image `localhost:5002/chat-assistant:<version>` |
| `spike` | Shows what Mastra's built-in A2A endpoint can and cannot do |

To deploy a new version: raise `CHAT_ASSISTANT_VERSION` in `Taskfile.yml`,
`image.tag` in the selection and `version` in `catalog.yaml`, then
`task chat-assistant:build chat-assistant:push`,
`task deploy -- -l name=chat-assistant` and, for the catalog,
`task registry:publish`.

## Known limits

- One replica. Tasks, chat history and the diagnosis notes are in memory.
- The list of incidents is what `delivery-mcp` holds, which is in memory
  there: a restart of `delivery-mcp`, and so `task demo:reset`, empties it.
- Which incident a viewer picked is kept by the page, not in the address: a
  reload shows the current incident again.
- `get_incident` does not say which version is running, so the card shows it
  only once a change exists.
- Of the basic catalog, the UI draws the five components the card uses (Text,
  Row, Column, Button, TextField) itself, for the same catalog entries
  (`packages/ui/src/catalog.tsx`): `@a2ui/react` 0.12.0 styles its
  components inline and publishes them without their class names, so a
  stylesheet cannot restyle them. Any other component of the basic catalog is
  still the renderer's own and would look different from the rest of the page.
- The incident catalog is not published as a JSON document. Its definition is
  the schemas in `packages/ui/src/incident-catalog.ts`; another client would
  need them, and drawings of the four components, to show the card.
- A step's time is read from the change's `history`, and for Propose,
  Approve and Reject also from the change's own `proposed_at`, `approved_at`
  and `rejected_at`. A change that carries none of these shows who did each
  step and not when.
- Two users in one browser profile share Keycloak's session cookie. To sign in
  as a second role in another tab, choose "Restart login" on Keycloak's
  re-authentication page, or use a private window per role.

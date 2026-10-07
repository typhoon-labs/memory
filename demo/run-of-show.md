# Run of show

One incident in ten beats. **Target 9:15. Hard limit 10:00.**

The times below come from three rehearsals on 2026-10-06, two of them on a
cluster rebuilt from nothing with `task up`. A script drove the real
pages in Chrome at 1280x720: nine tabs, three signed-in roles, the terminal
commands through `task`, the lines below spoken at 150 words a minute, and 1
to 3 seconds for every click, tab switch and command. **No person has
presented it yet.** The script took 6:11 on the rebuilt cluster; of that, 6
seconds were spent waiting with nothing to say. The targets leave about three
minutes for a human pace. If you run late, shorten beats 9 and 10, never 3 to
7.

The Chat UI and the Sample App's pages were redrawn after those rehearsals
(`chat-assistant` 0.1.7 to 0.1.9, `web` 1.1.0 to 1.2.1). What the room sees is
described below as the pages are now. The times, and what fits on a 1280x720
screen without scrolling, were not measured again: rehearse once on the screen
you will present on.

Commands assume a shell in the repository root with mise active. Otherwise put
`mise exec --` in front of each.

## Before the show

### Once on this machine

1. `task up`. About 15 minutes; it ends with the pre-flight.
2. Read this page with the pages open. Run `task demo:drive` once to see the
   whole incident as text (75 seconds).

### 60 minutes before, at the latest

Finish the last rehearsal. Grafana's tile "Error budget left, last hour" stays
red for an hour after any break, and its graphs show the break for 15 minutes.
`task demo:preflight` tells you when the tile will be green again. If you
cannot wait, say that the red tile is your rehearsal.

### 15 minutes before: one browser window, nine tabs, one terminal

```sh
task demo:reset && task demo:preflight
```

Every line must say `GO`. Under a `NO-GO` it says what to do.

Open the tabs in this order, so that `Ctrl+1` to `Ctrl+8` reach the first
eight and `Ctrl+9` the last. Use the screen you will present on. At 1920x1080
every card and dashboard fits and only the last scroll of beat 9 is needed. At
1280x720 present in full screen (`F11`) and expect the scrolls marked
**scroll** in beats 4, 6 and 9.

| Tab | Page | Sign-in and arrangement |
|---|---|---|
| 1 | Sample App search: <http://localhost:18082/search> | None. It refreshes itself every 3 seconds |
| 2 | Grafana, Sample App: <http://localhost:18084/d/sample-app?refresh=5s&kiosk> | `admin` and the password from `task observability:login`. You land on the dashboard |
| 3 | Registry: <http://localhost:18086> | None. Leave it on **Servers**. Never press **Deploy**: the registry is a catalog and has no rights in the cluster |
| 4 | Chat as `developer`: <http://localhost:18083> | See "10 minutes before" |
| 5 | Chat as `incident-manager`: same address | |
| 6 | Chat as `platform-engineer`: same address | |
| 7 | Langfuse, model calls only: <http://localhost:18085/project/agentgateway-demo/traces?filter=type%3BstringOptions%3B%3Bany+of%3BGENERATION> | Email and password from `task langfuse:login`. Then the columns, below |
| 8 | Grafana, Platform overview: <http://localhost:18084/d/platform-overview?refresh=10s&kiosk> | Already signed in |
| 9 | Grafana, Agentgateway: <http://localhost:18084/d/agentgateway?refresh=10s&kiosk> | Click the row titles **Overview** and **Requests** to fold them, then **LLM** and **MCP** to open them. Do not reload this tab: the rows fold back |

**Langfuse columns, once per browser.** Without the link above the table is a
wall of `POST /mcp http send` rows: use the link. Then press **Columns** and
untick Input, Output, Metadata, Status, Time To First Token, Prompt Name,
Environment and Trace Tags; check **User ID**; open **Usage** and check **Total
Tokens**. Press **Hide filters** (the icon left of the word Filters) and fold
the sidebar (the icon at the top left). The browser remembers all of it. At
1280 wide the User ID column is still off to the right: press `Ctrl` and `-`
twice on this tab (80%), which affects no other tab.

**Terminal.** Large font, in the repository root. Run nothing yet. Have these
three ready to recall, in this order. The third is the fallback for beat 5 and
is not run if the click works:

```sh
task demo:break
task demo:backup:refused-by-gateway
task demo:backup:refused-by-service
```

### 10 minutes before: sign in the three chat tabs

On tab 4 press **Sign in**, user `developer`, password `demo`.

On tabs 5 and 6 Keycloak does not offer a user field. It shows the last
user's name and "Please re-authenticate to continue". Click the small
**Restart login** arrow beside the name, then sign in as `incident-manager`
(tab 5) and `platform-engineer` (tab 6), password `demo`. Each tab names its
role beside "Incident chat", in the role's own color, with a line of that
color along its top: blue, violet and teal.

**A sign-in lasts 30 minutes.** With three tabs in one browser only the tab
that signed in last renews itself; the other two end 30 minutes after their
sign-in (measured twice). A tab that has expired shows a red strip, "Your
session has expired. Sign in again": click it and sign in, 10 seconds. So sign
in no earlier than 15 minutes before you start.

For a session longer than the show, with questions at the cards afterward,
give each role its own browser profile (three profiles, or three different
browsers; private windows of one browser share a session). Then every sign-in
is a plain user and password form, and all three renewed themselves in a
32-minute test.

Each chat tab must say "No incident right now.", and its chat pane must hold
no conversation: only "Ask about the incident" and three example questions.
If a tab shows an old conversation, reload it (`F5`); you stay signed in.

### 1 minute before

```sh
task demo:preflight
```

It takes 4 seconds and makes one small model call. Then tab 1.

## The beats

| Beat | What | Starts at | Target | Measured |
|---|---|---|---|---|
| 1 | Healthy system; the registry lists agents and tools | 0:00 | 1:00 | 0:51 |
| 2 | One command ships 2.1.0; Search and Grafana go red | 1:00 | 0:40 | 0:20 |
| 3 | The incident card appears unprompted | 1:40 | 0:50 | 0:31 |
| 4 | `developer` reads the evidence and proposes; the gateway does not offer `apply_change` | 2:30 | 1:05 | 0:39 |
| 5 | `platform-engineer` clicks Apply before approval; the service refuses, on the card | 3:35 | 0:40 | 0:27* |
| 6 | `incident-manager` reads the impact and a status draft, approves | 4:15 | 0:50 | 0:29 |
| 7 | `platform-engineer` applies; resolved; Search and Grafana recover | 5:05 | 0:55 | 0:30 |
| 8 | Langfuse: every model call, by user or workload, with tokens and cost | 6:00 | 1:10 | 0:41 |
| 9 | Grafana: the platform dashboard and the Agentgateway dashboard | 7:10 | 1:10 | 0:50 |
| 10 | Closing | 8:20 | 0:55 | 0:54 |
| | Ends at | **9:15** | 9:15 | **6:11** |

\* Beat 5 was rehearsed in an earlier form: a gray Apply button, then a
terminal command. The card now takes the click. The click was run once since,
with real clicks on the real alert, and the refusal was on the card 0.1
seconds later; the beat as a whole has not been rehearsed again. Its two lines
are as long as the old ones and a click replaces the command, so expect the
same half minute.

### Beat 1. Healthy system (0:00, 1:00)

1. **Tab 1.** Click the **red** chip under the search box.
   The room sees a list of red shapes, and in the bar at the foot of the
   page "web 1.2.1", "search-service 2.0.0" and "registration-service 1.0.0",
   each "Running".
   *Say:* "This is the Sample App. Its search is what we are about to break.
   Release 2.0.0 is running, and every search answers."
2. **Tab 2.** The room sees "Search success" at 100% in green and the version
   2.0.0.
   *Say:* "Grafana stands in for our operational backend. Search success is
   at one hundred percent and no alert is firing."
3. **Tab 3.** Two tool servers are listed. Click **Agents**: four agents.
   *Say:* "This is the registry. Two tool servers and four agents are
   published here, each with what it does, who may call it, and its route on
   the gateway. Every one of them is reached only through the gateway."
4. **Tab 4.** "developer" in blue beside "Incident chat", and "No incident
   right now."
   *Say:* "And this is the chat, signed in as a developer on the search team.
   There is no incident right now."

*If it stalls:* a Grafana or Langfuse tab that shows a sign-in page has lost
its session: sign in again. A chat tab with a red strip has expired: click
"Sign in again".

### Beat 2. One command ships 2.1.0 (1:00, 0:40)

1. **Terminal.** `task demo:break`. It returns in 5 to 6 seconds and ends
   with "Search check: ... answers HTTP 500".
   *Say:* "One command ships release 2.1.0 of the search service, the way a
   pipeline would. Nothing else is touched."
2. **Tab 1.** A red banner fills the top: "Search is unavailable".
   *Say:* "Search is failing for every visitor."
3. **Tab 2.** "Search success" falls and turns red, "Error budget burn"
   climbs, the version tile says 2.1.0.
   *Say:* "And Grafana sees it: search success falls and the error budget
   burns."

Do not hurry: the alert needs about 20 seconds from here whatever you do.

*If it stalls:* "search-service is already 2.1.0; nothing to ship" means the
last showing was not reset. Run `task demo:reset`, then `task demo:break`
again. If tab 1 is not red 10 seconds after the command returned, reload it.

### Beat 3. The incident card appears (1:40, 0:50)

1. **Tab 4.** Do nothing. The card appears about 20 seconds after
   `demo:break` returned (measured 17 to 20), with "Diagnosing…" under
   Suspected cause. If you arrive early, wait here.
   *Say:* "Nobody typed anything. The alert called the platform, and an
   incident card appears for everyone who is signed in."
2. Stay on the card. The diagnosis fills in 12 seconds after the card
   appeared (18 for the first diagnosis after a rebuild), and **Propose
   rollback to 2.0.0** turns blue.
   *Say:* "A read-only diagnosis agent is already reading the logs, the
   metrics and the traces. It can look, and it cannot change anything."
   Then: "There it is: the suspected cause, the evidence, and the version to
   go back to."

*If it stalls:* no card 40 seconds after the break returned: run
`task demo:alert`. It delivers the alert by hand, and if no diagnosis arrives
within 45 seconds it records one itself and says so. If the card says
"Diagnosis failed", type `2.0.0` into the version field on the developer's
card and carry on.

### Beat 4. The developer proposes (2:30, 1:05)

1. **Tab 4. Scroll** down to the evidence, read one line aloud, scroll back.
   *Say:* "The evidence is specific: the line that throws, the error count
   for each version from Prometheus, a trace to open. This is what the
   developer needs to decide."
2. Click **Propose rollback to 2.0.0**. The chat pane answers at once:
   "Rollback to 2.0.0 proposed. An incident-manager can now approve it."
   The first step, Proposed, gets its check mark, and the status under the
   title turns from a red "Open" to an amber "Mitigating".
   *Say:* "The developer owns the search service, so the developer may
   propose the rollback. Proposing is all this role can do."
3. **Terminal.** `task demo:backup:refused-by-gateway`. Half a second. Three
   entries of two lines each, between a `Showing:` and a `Result:` line: the
   developer is offered three tools, listed by name; the call to
   `apply_change` is refused with "HTTP 400 from the gateway: Unknown tool:
   apply_change"; the platform engineer is offered four.
   *Say:* "If the developer calls apply directly, without the card, the
   gateway does not even offer the tool. This role is offered three tools;
   the platform engineer is offered four."

*If it stalls:* the Propose button is gray until the diagnosis has arrived.
If the terminal command fails, skip it and say it in words; beat 9 shows the
refusals of earlier runs.

### Beat 5. Apply before approval (3:35, 0:40)

1. **Tab 6.** "platform-engineer" in teal. The card shows Proposed with its check mark,
   Approve "Waiting for approval", and on the Apply step, which is tinted
   teal, "Not approved yet" and a solid **Apply rollback to 2.0.0**.
   *Say:* "The platform engineer sees the same incident and the proposal.
   Nobody has approved it. Let us try to apply it anyway."
2. Click **Apply rollback to 2.0.0**, once. The refusal is there a tenth of a
   second later, in two places, with nothing to scroll at 1280x720:
   - on the card, under the Apply button, an amber box headed "Refused by the
     service": "This change has not been approved yet. Rule
     change_is_approved";
   - in the chat pane, under "You pressed Apply rollback to 2.0.0", the same
     amber box.

   No step has moved: Approve still says "Waiting for approval".
   *Say:* "Refused, and not by the gateway. The gateway let this call
   through, because this role may apply. The delivery service refused it
   under its own rule: the change is not approved. Two layers, each with its
   own rule."

The click takes the same path as the apply in beat 7: the chat assistant asks
the remediation agent with the platform engineer's token, and the remediation
agent calls `apply_change`. Nothing is applied and no model is called. The
other two roles' cards do not change. Apply stays enabled, and a second click
is refused again in the same words. The amber box on the card goes away when
the incident manager approves.

Beside the title this role also has **Restart search-service**. Do not press
it: it needs no approval, it restarts the pods, and it is not part of the
story.

*If it stalls:* no refusal 5 seconds after the click, or the box is gray and
headed "Failed": do not click again. **Terminal.**
`task demo:backup:refused-by-service` makes the same call without the card, in
under a second. Three entries: the platform engineer is offered `apply_change`;
the call is "refused ... delivery-mcp, rule change_is_approved"; the change is
still `proposed`. Say the same line. If it prints "Nothing to show yet", it ran
before Propose or after Approve: skip it.

### Beat 6. The incident manager approves (4:15, 0:50)

1. **Tab 5.** "incident-manager" in violet. The Approve step is tinted violet
   and says "Waiting for you".
   *Say:* "The incident manager reads the impact: visitors cannot search the
   catalog."
2. **Scroll** down to "Status update", below the steps, at 1280x720. Click
   **Draft status update**. The draft arrives in about 2 seconds, in the text
   box above the button.
   *Say:* "She asks the comms agent for a status update. It is a draft,
   written with her identity and her access. She can edit it, and posting it
   stays her own action."
3. Scroll back. Click **Approve rollback to 2.0.0**. The chat pane answers at
   once: "Change approved. A platform-engineer can now apply it."
   *Say:* "She approves. The service checks that the approver is not the
   person who proposed."

Do not press **Post status update**: it is not part of the story, and the
rehearsals did not press it.

*If it stalls:* no draft after 10 seconds means the model is slow or down.
Carry on: approving does not use the model.

### Beat 7. Apply, resolved, recovered (5:05, 0:55)

1. **Tab 6.** The amber box of beat 5 is gone from the card, and the Apply
   step reads "Ready for you to apply". Click **Apply rollback to 2.0.0**,
   the button that was refused in beat 5. The steps run through Applying and
   Verifying to Resolved in 7 seconds, and the status under the title turns
   green; then the chat pane gives the result in two sentences, below the
   refusal of beat 5.
   *Say:* "Now it is approved. One click, and the remediation agent applies
   the change as the platform engineer, through the Helm release, then checks
   with a real search before it calls the change applied."
   Then: "Resolved. The card records who proposed, who approved and who
   applied."
2. **Tab 1.** The banner is green, "Search is back", then gone. It is green
   for 10 seconds from the moment the page saw search answer, about 7 seconds
   after the click on Apply, and the page keeps checking while another tab is
   in front. If you arrive later there is no banner: the red shapes are
   listed again, and the bar at the foot says search-service 2.0.0, "Running".
   *Say:* "Search is back."
3. **Tab 2.** The version tile says 2.0.0 and the error graph has dropped.
   "Search success" is back above 90% about 28 seconds after the click on
   Apply and still climbing. The tile is red below 99.5% and turns green when
   the last errors have left its 30-second window. "Error budget left, last
   hour" stays red: that is the budget this incident spent. "Error budget
   burn, last minute" falls back through amber to green about a minute
   after the recovery.
   *Say:* "And Grafana recovers: the version is 2.0.0 again and search
   success climbs back. The error budget for this hour is spent, and it says
   so."

*If it stalls:* refused again with "this change has not been approved yet":
look at tab 5, was Approve pressed? The card may sit on Verifying for up to
90 seconds before it gives up. If the change ends as failed, run
`task demo:reset`, show tab 1 working, and say that the pipeline is the
fallback.

### Beat 8. Langfuse (6:00, 1:10)

1. **Tab 7.** Reload (`F5`). The top five rows are this incident.
   *Say:* "Langfuse records every model call that went through the gateway.
   The top five rows are this incident. Three calls were made by the
   diagnosis agent, a workload with its own key from the gateway. One was
   made for the incident manager and one for the platform engineer, each with
   that person's verified identity."
   The room sees: the three diagnosis rows are named
   `POST /workloads/diagnosis-agent/...` and have no user; the two
   `POST /v1/messages` rows carry `incident-manager` and `platform-engineer`.
   Rows of about 30 tokens signed `developer` further down are the pre-flight
   checks.
2. Point at the Cost and Total Tokens columns.
   *Say:* "Every call has its model, its tokens and its cost. This incident
   cost about fifteen cents, and almost all of it was the diagnosis."
3. Click the third row. A panel opens with the system prompt and the answer.
   `Esc` closes it.
   *Say:* "Open one, and the prompt and the answer are there, for the people
   who are allowed to read them."

Langfuse gets a trace about 20 seconds after it began. In the rehearsals the
platform engineer's call was listed 21 to 22 seconds after the click on
Apply, which is before you get here.

*If it stalls:* the top row is not `platform-engineer`: wait 10 seconds and
reload again. If the table is empty or shows an error, skip to beat 9, which
shows tokens and cost from the gateway itself, and run
`task langfuse:restart-clickhouse` afterward.

### Beat 9. Grafana, the gateway's view (7:10, 1:10)

1. **Tab 8.** Five tiles: requests through the gateway, requests refused,
   model tokens used, tool calls, telemetry lost. Below them, requests by
   route and the refusals per minute.
   *Say:* "This is the same story from the gateway. Every request by route,
   the model tokens by model, the tool calls by tool."
   Then: "And the refusals. The developer's call to apply is here as a tool
   that was not offered. Nothing reached the service, and it is still on
   record."
2. **Scroll** down one row: model tokens per minute by model, tool calls by
   tool.
   *Say:* "Tokens per minute, by model, and the tools that were called most."
3. **Tab 9.** Token consumption and cost per model.
   *Say:* "This dashboard ships with Agentgateway. Token consumption and cost
   for each model come from the gateway itself, so they are there for every
   agent, whatever framework it was written in."
4. **Scroll** to the bottom (on any screen): MCP calls by method, tool
   calls by tool.
   *Say:* "And the same for tools: every call, by tool, whoever made it."

The service's refusal in beat 5 is not in the "Requests refused" panel: the
gateway let that call through with HTTP 200, and the refusal is in the tool's
answer.

*If it stalls:* the rows on tab 9 are folded after a reload: click **LLM**.
A panel that says "No data" needs its next refresh, 10 seconds.

### Beat 10. Closing (8:20, 0:55)

**Tab 6**, the resolved card. *Say:*

- "One incident. Three people, four agents, two tool servers and one model
  provider, and every call between them went through the gateway with a
  verified identity."
- "The rules were enforced twice, at the gateway and again in the service,
  and none of them lived in an agent's prompt."
- "What stood in for something else: Keycloak for our identity provider,
  Grafana for our operational backend, a local registry and task targets for
  the artifact registry and the pipeline, and a local endpoint for the model
  provider."
- "And the limits. A real MCP client cannot yet sign in through the gateway
  by itself. Langfuse shows an incident as several traces, and not every role
  appears, because proposing and approving call no model. The diagnosis
  agent's runbook is in its prompt. And kagent is alpha."

## If the pages fail altogether

`task demo:reset && task demo:drive` runs the whole incident in the terminal
in 75 seconds, through the gateway, as each role, with the real alert and the
real model, and prints every refusal with the layer that refused. With the
model down: `task demo:drive -- --alert manual --expect-model down`.

After every showing: `task demo:reset`, then reload the three chat tabs.

## Backup drills

Each prints what it is about to show, each attempt, and the result, and puts
back what it changed. Each can be run again at once.

| Task | Use it when |
|---|---|
| `task demo:backup:refused-by-gateway` | Beat 4. Or: "what if a developer calls the apply tool directly?" The gateway does not offer it |
| `task demo:backup:refused-by-service` | Beat 5, if the click on the card stalls. Or: "what if the gateway's rule were wrong?" The service has its own, and this is the same call made without the card. Needs a change that is proposed and not approved |
| `task demo:backup:bypass-tool` | "What stops an agent from calling the tool server directly, around the gateway?" Blocked directly, answered through the gateway (9 seconds) |
| `task demo:backup:bypass-model` | "What stops an agent from calling the model provider directly?" Blocked directly; the gateway says 401 without a token (6 seconds, one small model call) |
| `task demo:backup:policy-override` | "Can a team loosen a platform rule with a gateway policy of its own?" Three attempts refused at admission |
| `task demo:backup:registry-down` | "Is the registry in the request path?" Scaled to zero: tools and agents still answer (18 seconds) |
| `task demo:backup:telemetry-down` | "What if the telemetry backend is down?" The collector at zero: the Sample App and the gateway still answer |
| `task demo:backup:mcp-client` | "Can a developer use these tools from their own client, without hosting anything?" Both tool servers, as `developer`, through the gateway |
| `task demo:backup:mcp-oauth-check` | "Can I point my IDE's MCP client at it today?" No: it shows which three steps of the client's own sign-in this cluster does not answer |

Two more, not drills: `task demo:alert` delivers the alert by hand (beat 3),
and `task demo:model-fault -- down` cuts `remediation-agent`, `comms-agent`
and `chat-assistant` off from the model, to show that the incident still runs
without it; `task demo:model-restore` undoes it. `diagnosis-agent` has a route
of its own to the model and keeps it, so the diagnosis still arrives.

## What is a stand-in

| Here | Stands in for |
|---|---|
| Keycloak, realm `demo`, four users with the password `demo` | The corporate identity provider |
| Grafana with Prometheus, Loki, Tempo and Alertmanager | The operational backend |
| The local registry and the `task` targets (`publish`, `demo:break`) | The artifact registry and CI |
| The model endpoint on this machine | The model provider. Switching to Bedrock is `task model -- bedrock`, described in the README; no answer has come back from Bedrock yet |
| kind, one node | The cluster |

Langfuse, Agentgateway, kagent, Agentregistry, Kyverno and the collector are
what they are.

## Limits to state honestly

From the build:

- **A real MCP client cannot sign in through the gateway by itself.** A
  client with a token works (`demo:backup:mcp-client`); the client's own
  sign-in does not (`demo:backup:mcp-oauth-check` shows the three missing
  steps).
- **Langfuse shows several traces for one incident, and not every role.**
  The alert with its diagnosis is one trace; each button that calls a model
  is another. Proposing and approving call no model, so the developer does
  not appear. The diagnosis is attributed to the workload, not to a person.
- **The diagnosis agent's runbook is in its prompt.** This kagent version
  could not load a skill from git.
- **kagent and Agent Substrate are alpha.** kagent does not verify tokens
  itself; the gateway route, the sign-in proxy of its UI and network policies
  guard its port. The kagent UI (<http://localhost:18087>, `platform-engineer`
  only) is not part of the show: a chat started there reaches the diagnosis
  agent without passing the gateway.
- **Incidents live in memory.** Restarting `delivery-mcp` forgets them, which
  is what `demo:reset` uses.

From the rehearsals:

- **Three chat tabs in one browser share one Keycloak session**, hence
  "Restart login" and the 30-minute rule above. One browser profile for each
  role avoids both.
- **Nothing here has been presented by a person**, and the Bedrock switch has
  not been tried with real AWS credentials.

## Measured

Seconds, from the three rehearsals of 2026-10-06. "Current" is the cluster the
nine workstreams built on. "Rebuilt" is a cluster made by `task up` from
nothing: its first incident, then another after one `task demo:drive` and the
drills.

| Moment | Current | Rebuilt, first | Rebuilt, again |
|---|---|---|---|
| `task demo:break` returns | 5.7 | 4.6 | 5.7 |
| Search page red, from the start of the command | | 6.9 | 6.9 |
| Grafana "Search success" under 90%, from the start of the command | | 11.9 | 11.7 |
| Card visible, from the start of the command | 24.8 | 26.7 | 26.7 |
| Diagnosis on the card, from the start of the command | 38.8 | 38.8 | 38.6 |
| Propose answered | 0.2 | 0.2 | 0.1 |
| Status draft written | 1.8 | 2.3 | 2.1 |
| Approve answered | 0.1 | 0.1 | 0.1 |
| Apply clicked to Resolved | 7.2 | 7.3 | 7.3 |
| Apply clicked to the result in words | | 8.7 | 8.5 |
| Search page back, from the click on Apply | | 6.9 | 6.9 |
| Grafana "Search success" over 90%, from the click on Apply | 33.0 | 27.9 | 27.7 |
| Langfuse lists the platform engineer's call, from the click on Apply | | 22.0 | 20.9 |
| An answer to a question typed in the chat pane | | 2.5 | 2.7 |

Measured once after the rehearsals, with `chat-assistant` 0.1.6 and real
clicks on the real alert: the refusal of beat 5 was on the card and in the
chat pane 0.1 seconds after the click on Apply, and again 0.1 seconds after a
second click. After approval the same button reached Resolved in 7.3 seconds.

| Beat | Current | Rebuilt, first | Rebuilt, again |
|---|---|---|---|
| 1 | 51 | 51 | 51 |
| 2 | 20 | 20 | 20 |
| 3 | 31 | 31 | 31 |
| 4 | 39 | 39 | 39 |
| 5 | 27 | 27 | 27 |
| 6 | 29 | 29 | 29 |
| 7 | 35 | 30 | 30 |
| 8 | 41 | 54 | 41 |
| 9 | 50 | 50 | 50 |
| 10 | 54 | 54 | 54 |
| **Whole show** | **6:16** | **6:24** | **6:11** |
| Waiting with nothing to say | 12 | 19 | 6 |

The beats barely differ because the script speaks the same lines at the same
speed every time; what the system adds is in beats 2, 3, 7 and 8. Beat 5 in
these rehearsals was the earlier form, with a terminal command where the click
on Apply now is. On the
rebuilt cluster's first run, 12 of the 54 seconds of beat 8 were the rehearsal
script waiting for the wrong thing on a page that had already opened. The 12
seconds of waiting on the current cluster were the diagnosis (4) and Grafana's
recovery (7).

Sign-in to the end of the show took 7 minutes; each chat tab had 23 minutes
left on its sign-in. The browser set-up of the pre-flight, done by the script,
took 16 seconds; allow 5 minutes by hand.

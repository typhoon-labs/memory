# The demo: one incident, end to end

| | |
|---|---|
| Status | Built and running on one machine. A demonstration of what is possible; its results are observations, not pilot evidence. |
| Updated | 7 October 2026 |
| Based on | The demo repository as of 7 October 2026: its README, contracts, measurements and run of show. Screenshots taken on 7 October 2026 at 1920 by 1080. |
| Parent | [Agent platform proposal](00-proposal.md) |

The demo is a kind cluster that shows the EKS agent platform option in under ten minutes, through one incident. A release breaks the search of a Sample App. An alert starts a read-only diagnosis agent. Three signed-in people propose, approve and apply the rollback from an incident card in a chat UI. Every agent, tool and model call goes through Agentgateway with the caller's verified identity.

It shows three things:

- **One governed path.** Three people, four agents, two tool servers and one model endpoint, and every call between them passes the gateway.
- **Rules enforced twice.** The gateway decides who may call which tool, agent and model. The tool server checks again, with the rules only it can know.
- **No rule lives in a prompt.** Buttons are handled by code that calls the tool as the signed-in user. The model diagnoses, answers questions and drafts text; it never decides whether an action runs.

What the demo taught us, and what it does not show, is on [Demo findings and limits](21-demo-findings.md).

## What is in the cluster

![The demo's kind cluster by namespace, with Agentgateway and its routes at the center, the calls that were made, one refused direct call, and each stand-in labeled with what it replaces](diagrams/demo-topology.svg)

| Component | Built with | Part in the incident |
|---|---|---|
| Sample App: `web`, `search-service`, `registration-service` | Node | The application that breaks. Release 2.1.0 of `search-service` fails every search. |
| `delivery-mcp` | FastMCP, Python | Holds incident and change state as MCP tools, and enforces the separation of duties itself. |
| `observability-mcp` | Grafana's MCP server | Twenty read-only tools over metrics, logs and traces. |
| `chat-assistant` and the Chat UI | Mastra and React, TypeScript | Takes the alert, draws the incident card for each role and carries out its buttons as the signed-in user. |
| `diagnosis-agent` | kagent, declarative | Reads logs, metrics and traces and returns a suspected cause, evidence and a version to go back to. It cannot change anything. |
| `remediation-agent` | Strands, Python | Applies an approved change as the caller and reports the verified result. |
| `comms-agent` | Strands, Python | Drafts a status update. It does not post. |

Four people can sign in, and one machine client starts the incident.

| Identity | Role | Team | May |
|---|---|---|---|
| `developer` | `developer` | `search` | Propose a rollback of a service the team owns |
| `developer-other-team` | `developer` | `registration` | Propose only for services the registration team owns; used to show a refusal by team |
| `incident-manager` | `incident-manager` | `incident` | Approve or reject a change; draft and post status updates |
| `platform-engineer` | `platform-engineer` | `platform` | Apply an approved change; restart a workload |
| `alert-automation` | Machine client | `automation` | Open an incident and record its diagnosis |

### What stands in for what

| In the demo | Stands in for |
|---|---|
| Keycloak, one realm, four users | Okta |
| Grafana with Prometheus, Loki, Tempo and Alertmanager | New Relic or Dynatrace |
| A local registry and `task` targets | ECR and the GitLab pipeline |
| An Anthropic-compatible model endpoint on the same machine | The model provider |
| kind, one node | EKS |

Agentgateway, kagent with Agent Substrate, Agentregistry, Langfuse, Kyverno and the OpenTelemetry Collector are what they are.

## The incident in one picture

Every arrow below is a call through Agentgateway that carries a verified identity: a person's token, the alert's machine token, or the key the gateway issued to the diagnosis agent.

```mermaid
sequenceDiagram
    autonumber
    participant AL as Alertmanager
    participant UI as Chat UI (three roles)
    participant CA as chat-assistant
    participant DM as delivery-mcp
    participant DA as diagnosis-agent
    participant RA as remediation-agent
    participant CO as comms-agent
    participant SA as Sample App release

    AL->>CA: Search error alert, as alert-automation
    CA->>DM: open_incident
    CA->>DA: Diagnose search-service
    DA->>DA: Read logs, metrics and traces
    DA-->>CA: Cause, evidence, recommended version
    CA->>DM: record_diagnosis
    UI->>CA: developer presses Propose
    CA->>DM: propose_change, as developer
    UI->>CA: platform-engineer presses Apply
    CA->>RA: apply_and_verify, as platform-engineer
    RA->>DM: apply_change
    DM-->>RA: Refused by rule change_is_approved
    UI->>CA: incident-manager asks for a status draft
    CA->>CO: draft_status_update, as incident-manager
    CO-->>CA: Draft
    UI->>CA: incident-manager presses Approve
    CA->>DM: approve_change, as incident-manager
    UI->>CA: platform-engineer presses Apply
    CA->>RA: apply_and_verify, as platform-engineer
    RA->>DM: apply_change
    DM->>SA: Upgrade the Helm release to 2.0.0
    DM->>SA: Verify with a real search
    DM-->>RA: Applied
    RA-->>CA: Verified result, in words
```

## The incident, step by step

The screenshots are from one run on 7 October 2026. Times on the incident card are UTC; the other pages show the machine's local time, seven hours earlier.

### 1. A healthy system

Release 2.0.0 of the search service is running and every search answers.

![The Sample App's search page listing fifty red shapes, with all three services reported as running](screenshots/01-sample-app-search-healthy.png)

The registry lists what is published: two tool servers and four agents, each with what it does and its route on the gateway. It is a catalog only and has no rights in the cluster.

![Agentregistry's catalog, on the Agents tab, listing chat-assistant, comms-agent, diagnosis-agent and remediation-agent](screenshots/03-registry-agents.png)

### 2. A release breaks search

One command ships release 2.1.0 of the search service, the way a pipeline would. Search fails for every visitor within seconds.

![The Sample App's search page with a red banner, "Search is unavailable", and search-service 2.1.0 marked as failing](screenshots/05-sample-app-search-unavailable.png)

The operational dashboard sees it: search success falls to zero and the error budget burns. The earlier bands in the graphs are earlier runs on the same morning.

![The Sample App dashboard in Grafana with search success at 0.0 percent, the error budget tiles red, and search-service version 2.1.0](screenshots/06-grafana-sample-app-failing.png)

### 3. The incident card appears, then the diagnosis

Nobody types anything. The alert calls the platform as a machine client, an incident is opened, and a card appears for everyone who is signed in. It shows the five steps of the change and who owns each.

![The incident card as the developer sees it, with status Open and Critical, the five steps of the rollback, and "Diagnosing" under Suspected cause](screenshots/07-chat-card-diagnosing.png)

About fifteen seconds later the diagnosis is on the card: the suspected cause, the evidence, and the version to go back to. The evidence is specific: the line that throws, the error counts for each version from Prometheus, and a trace to open.

![The incident card with the diagnosis filled in: a defect in ranking.js in release 2.1.0, evidence from logs, Prometheus and Tempo, and an enabled button "Propose rollback to 2.0.0"](screenshots/08-chat-developer-diagnosis.png)

### 4. The developer proposes

The developer's team owns the search service, so the developer may propose the rollback. Proposing is all this role can do. The incident moves from Open to Mitigating.

![The developer's card after proposing: step Proposed is done, Approve says "Waiting for approval", Apply says "Not approved yet"](screenshots/09-chat-developer-proposed.png)

If the developer calls the apply tool directly, without the card, the gateway does not offer it. This is the output of the demo's own check:

```text
Showing: developer asks the gateway for delivery-mcp's tools, then calls apply_change anyway.
  offered   developer: tools/list at http://localhost:18080/mcp/delivery
            get_incident, list_incidents, propose_change
  refused   developer: tools/call apply_change
            HTTP 400 from the gateway: Unknown tool: apply_change
  offered   platform-engineer: tools/list at the same address
            apply_change, get_incident, list_incidents, restart_workload
Result: the gateway does not offer apply_change to developer and refuses the call; platform-engineer is offered it.
```

### 5. Apply before approval is refused by the service

The platform engineer sees the same incident and presses Apply before anyone has approved. The gateway lets the call through, because this role may apply. The delivery tool server refuses it under its own rule.

![The platform engineer's card with an amber notice under the Apply button and in the chat pane: "Refused by the service. This change has not been approved yet. Rule change_is_approved"](screenshots/10-chat-engineer-refused-by-service.png)

The same call made without the card gives the same answer:

```text
Showing: platform-engineer calls apply_change on CHG-0001 (INC-0001) before an incident manager has approved it.
  offered   platform-engineer: tools/list at http://localhost:18080/mcp/delivery
            apply_change, get_incident, list_incidents, restart_workload
  refused   platform-engineer: tools/call apply_change CHG-0001
            HTTP 200 from the gateway, then delivery-mcp, rule change_is_approved: change CHG-0001 is proposed, not approved. A change is applied only after an incident manager has approved it.
  unchanged CHG-0001 read back
            status proposed; nothing was applied
Result: the gateway lets a platform-engineer call apply_change; delivery-mcp refuses it until the change is approved.
```

### 6. The incident manager drafts a status update and approves

The incident manager asks the comms agent for a status update. It is a draft, written with her identity and her access. She can edit it, and posting it stays her own action.

![The incident manager's card with a drafted status update in an editable text box, and the Approve step marked "Waiting for you"](screenshots/11-chat-manager-status-draft.png)

She approves. The service checks that the approver is not the person who proposed.

![The incident manager's card after approving: Proposed and Approved are done, and Apply says "Ready to apply"](screenshots/12-chat-manager-approved.png)

### 7. Apply, verify, resolved

The platform engineer presses the same button that was refused in step 5. The remediation agent applies the change as the platform engineer, through the Helm release, and the tool server checks with a real search before it calls the change applied.

![The platform engineer's card while the change runs: Proposed, Approved and Applied are done and Verifying says "Checking that the rollback worked"](screenshots/13-chat-engineer-verifying.png)

About seven seconds after the click the incident is resolved. The card records who proposed, who approved and who applied, and the chat pane keeps the earlier refusal above the result.

![The platform engineer's card with status Resolved and all five steps done, each with its owner and time; the chat pane shows the earlier refusal and then the verified result in words](screenshots/14-chat-engineer-resolved.png)

Search success is back at 100 percent and the version is 2.0.0 again. The error budget for the hour is spent, and the dashboard says so.

![The Sample App dashboard in Grafana after the rollback: search success at 100 percent, version 2.0.0, and the error budget tiles still red](screenshots/16-grafana-sample-app-recovered.png)

### 8. What the platform recorded

Langfuse lists every model call that went through the gateway, with its model, tokens and cost. The top five rows are this incident. Three calls were made by the diagnosis agent, a workload with its own key from the gateway, and carry no user. One was made for the incident manager and one for the platform engineer, each with that person's verified identity. Together they cost about $0.15. The five rows from 04:39 are an earlier run, and the 32-token rows signed `developer` are pre-flight checks.

![Langfuse's table of model calls: three calls to the diagnosis agent's own route with no user, one call for incident-manager and one for platform-engineer, each with latency, cost, tokens and model](screenshots/17-langfuse-model-calls.png)

Opened, a call shows its place in the trace, its prompt and its answer, for the people allowed to read them. This is the comms agent's call for the incident manager.

![One model call opened in Langfuse: user incident-manager, 607 tokens, the trace tree from the tool server to the model endpoint, the system prompt, the incident record sent as input and the drafted status update](screenshots/19-langfuse-model-call-detail.png)

The same story from the gateway, over the last ten minutes: requests by route, model tokens by model, tool calls by tool, and the refusals. The one request refused is the developer's direct call to apply, counted as a tool that was not offered. Nothing reached the service, and it is still on record. The service's own refusal in step 5 is not in this count: the gateway answered that call with HTTP 200, and the refusal is in the tool's result.

![The platform overview dashboard in Grafana: requests through the gateway, requests refused, model tokens used, tool calls, telemetry lost, requests by route and refusals per minute by kind](screenshots/20-grafana-platform-overview.png)

The dashboard that ships with Agentgateway gives token consumption and cost for each model. The figures come from the gateway itself, so they exist for every agent, whatever framework it was written in.

![The Agentgateway dashboard in Grafana, LLM row: token consumption, cost per interval, time to first token and request time, per model](screenshots/21-grafana-agentgateway.png)

## The kagent console

kagent has a console of its own, and the dev cluster switches it on for the platform engineer only. It is an operator's console and not part of the show. It sits behind a sign-in proxy on its own port. kagent reads the user from the token without verifying it, so the proxy is the only check. A chat started there would reach the diagnosis agent through kagent's controller and not through the gateway, so none was started for these pictures.

The agent as kagent holds it: one template, which says what the agent does, and one harness, which says where and how it runs.

![The kagent console's Agents page: an overview of template, harness, agent and agent instance, and one agent, diagnosis-agent, with status Ready and 16 conversations](screenshots/22-kagent-agents.png)

The agent's own page shows what a declarative agent is made of: its template and harness, the revision that is running, its model, seven read-only tools, and instructions read from a ConfigMap. Below are its sixteen conversations, all started by the alert's machine client. The platform engineer sees that they exist and cannot open them, because kagent scopes a conversation to whoever started it.

![The kagent console's page for diagnosis-agent: template, harness, revision and status, the model and seven tools, and a table of 16 conversations started by service-account-alert-automation, with a notice that conversations started by somebody else cannot be opened](screenshots/23-kagent-agent-details.png)

Agent Substrate is the runtime under kagent. The console shows one pool of two workers, the agent's two revisions compiled as actor templates in the gVisor sandbox class, and one actor for each conversation. Of the sixteen actors, nine are suspended and seven are shown as resuming; none is running.

![The kagent console's Substrate page: one worker pool with two replicas, two actor templates in phase Ready with sandbox class gvisor, and sixteen actors, nine suspended and seven resuming](screenshots/26-kagent-substrate.png)

## The change and its rules

A change moves through these states. Each transition is a tool of `delivery-mcp`, and each tool has a role the gateway checks and a rule the service checks.

```mermaid
stateDiagram-v2
    [*] --> proposed: developer proposes
    proposed --> approved: incident-manager approves
    proposed --> rejected: incident-manager rejects
    approved --> applying: platform-engineer applies
    applying --> verifying: Helm release upgraded
    verifying --> applied: a real search answers
    verifying --> failed: no answer in time
    applying --> failed: the upgrade fails
    applied --> [*]
    rejected --> [*]
    failed --> [*]
```

| Tool | Role allowed at the gateway | Rule the service adds |
|---|---|---|
| `list_incidents`, `get_incident` | Any signed-in role | None |
| `open_incident` | `alert-automation` | One open incident per service |
| `record_diagnosis` | `alert-automation` | None |
| `propose_change` | `developer` | The caller's team owns the service; the target is a retained earlier version |
| `approve_change` | `incident-manager` | The approver is not the proposer |
| `reject_change` | `incident-manager` | None |
| `apply_change` | `platform-engineer` | The change is approved; a repeated call with the same change starts nothing |
| `restart_workload` | `platform-engineer` | No approval needed |
| `post_status_update` | `incident-manager` | None |

A tool that a role lacks is hidden from that role's tool list. Every change records who proposed, who approved and who applied it. How the two layers fit the design is on [Identity and authorization](11-identity-and-authorization.md).

## Timings

Seconds from the command that ships the bad release, from three runs driven by the real alert on 6 October 2026.

| Moment | Seconds |
|---|---|
| Alertmanager calls the alert hook | 22 |
| Incident card visible, "Diagnosing" | 22 to 23 |
| Diagnosis shown on the card | 39 to 41 |
| Propose and Approve answered | Under 1 |
| Status draft written | About 2 |
| Apply clicked to Resolved | 7 |
| Alert clears after the fix | 31 to 33 |

The run in these screenshots matched: the card was visible at 25 seconds and the diagnosis at 41. A diagnosis is three model calls and five read tool calls. The whole show, with narration, was rehearsed by script at just over six minutes against a ten-minute limit. No person has presented it yet.

## Running it

| Need | Detail |
|---|---|
| Machine | Docker Desktop with about 16 GiB of memory free for it |
| Bring-up | `task up` in the demo repository: from no cluster to a ready demo in about 15 minutes, safe to run again |
| Before a showing | `task demo:reset`, then `task demo:preflight`, which prints one GO or NO-GO line per check |
| The incident as text | `task demo:drive`: the whole incident through the gateway as each role, in 75 seconds |
| Questions from the room | Nine short drills, among them the two refusals above, the two bypass attempts, a policy override, and the registry and telemetry outages |

The script that took these screenshots, `scripts/capture_screenshots.mjs`, runs the same incident in a browser with a separate session for each role. The kagent console was captured about half an hour after the incident, without running it again.

## More screenshots

| File | Shows |
|---|---|
| [`02-registry-tool-servers.png`](screenshots/02-registry-tool-servers.png) | The registry's two tool servers |
| [`04-chat-no-incident.png`](screenshots/04-chat-no-incident.png) | The Chat UI before the incident, signed in as `developer` |
| [`15-sample-app-search-recovered.png`](screenshots/15-sample-app-search-recovered.png) | The search page after the rollback |
| [`18-langfuse-cost-breakdown.png`](screenshots/18-langfuse-cost-breakdown.png) | Input and output cost of the largest diagnosis call |
| [`24-kagent-tool-servers.png`](screenshots/24-kagent-tool-servers.png) | The tool servers kagent knows, with the Kubernetes server's nine tools |
| [`25-kagent-models.png`](screenshots/25-kagent-models.png) | kagent's model configurations, one of them with the agent's gateway key |

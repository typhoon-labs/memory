# What was measured

> **Owner:** coordinator · **Type:** record · **Checked:** 2026-11-03 against the records below, each dated where its run was

Timings and costs observed on the dev cluster. They are observations of this
demo on one machine, not pilot evidence for the architecture decision. Sizes
and timings of a single platform service are in its README (see
[`cluster.md`](cluster.md)); a component's are in its own.

## The core path

- Break to failing search 4.7 s; apply to recovered search about
  5 s; model calls 1 to 4 s, 6 s for a chat answer with tool calls. Agents
  give a model call one total deadline (`MODEL_TIMEOUT_SECONDS`) and no retry.

## A trace through kagent, by version

One A2A request to `diagnosis-agent` through the gateway, with a `traceparent`
of known trace id, read back from Tempo on 2026-10-30. The model was a stand-in
on port 7070, because the real endpoint was down: a tool call, then one
sentence. So these figures are the shape of a trace, not timings; the real
model's follow the table.

| | kagent 1.0.0-alpha7, Substrate 0.3.0-alpha3 | kagent 1.0.0-alpha17, Substrate 0.6.0-alpha3 |
|---|---|---|
| Spans, new conversation | 49 | 170 |
| Spans, resumed Actor | 49 | 153 |
| Disconnected pieces | 17 | 1 |
| Parents never exported | 16: 1 into the sandbox, 15 out of it | 0 |
| `tools/call` spans | 2 | 2 |
| Model spans, all answered | 4 | 4 |
| `ResumeActor` spans | 0 | 2 |

The right-hand column is the same on Agentgateway 1.6.0 and 1.7.0. The pieces
came together because Substrate's router and egress proxy now export their
spans; the left-hand column had neither. `ResumeActor` comes from
Agentgateway's fix #3674, in the build Substrate 0.6.0-alpha3 pins, not from
the gateway this cluster runs.

With the real model on alpha17, on Agentgateway 1.7.0, 15 turns gave 195 to
290 spans, 2 `tools/call` spans, 4 answered model spans and 2 `ResumeActor`
spans. 14 came to 1 piece. `task diagnosis-agent:trace` repeats this with
three turns, and passed three runs of three in one piece each.

A turn can still lose its last spans, when the Actor suspends before they are
exported. On alpha17, with the stand-in, two resumed turns gave 12 and 2
pieces and five later ones 1. With the real model, one fresh turn gave 2
pieces, with `a2a.request` missing its parent, which looks like the same loss;
the cause was not proven.

kagent 1.0.0-rc1 on Substrate 1.0.0-rc1 was traced on 2026-11-02, with the
real model. Substrate 1.0's API server writes a span for each statement it
sends to PostgreSQL, and most of them belong to its authorization check, whose
own spans the collector already dropped, so each arrived as a piece of its
own. Until the collector dropped those statements too, three turns gave 673,
705 and 602 spans in 400, 418 and 336 pieces. After, five runs of
`task diagnosis-agent:trace` gave 15 turns:

| | alpha17, 15 turns | rc1, 15 turns |
|---|---|---|
| Spans per turn | 195 to 290 | 274 to 288 new, 260 to 267 resumed |
| Turns in 1 piece | 14 | 15 |
| `tools/call` spans | 2 | 2 |
| Model spans, all answered | 4 | 4 |
| `ResumeActor` spans | 2 | 2 |

The split seen on alpha17, `a2a.request` without its parent, did not show in
these 15 turns, but it did on the clean rebuild after them: the first of
three turns gave 273 spans in 2 pieces, the other two 1 each. So 17 of 18
rc1 turns came to 1 piece. The span that never arrived is the agent
runtime's own gRPC server span of `SendMessage`, the parent of
`a2a.request` in every whole turn and the last span of the turn to end in
the Actor. That fits the Actor suspending before it is exported; the cause
is still not proven. On rc1 Substrate's router is Agentgateway 1.7.0 itself,
which has fix #3674, so `ResumeActor` no longer depends on a build of
Substrate's.

## diagnosis-agent

`task diagnosis-agent:eval` passes all three scenarios with the real model. On
alpha17: 21.5 and 23.2 seconds during an incident and 15.0 seconds after it.
On rc1: 23.7 seconds for `bad-release` and 14.9 for `asked-to-change` during
an incident, 20.3 for `recovered` after it. `task demo:drive` passes: on
alpha17 16.4 seconds for the diagnosis, and the alert clears 33.8 seconds
after Apply; on rc1 14.2 and 30.7 seconds.

On 2026-11-02, on the rc1 cluster rebuilt that day (see Rebuilds), `diagnosis-agent`'s runbook moved out of
its prompt into a kagent skill, an image the model loads with `load_skill`.
One run each, the eval's scenarios before and after, and `task demo:drive`'s
diagnosis, counted from the alert:

| | Runbook in the prompt | Runbook as a skill |
|---|---|---|
| `asked-to-change` | 21.4 s, 3 model calls, 64,411 tokens in | 20.7 s, 4, 74,305 |
| `bad-release` | 14.3 s, 3, 50,450 | 23.8 s, 4, 90,614 |
| `recovered` | 12.2 s, 3, 44,295 | 24.2 s, 4, 84,436 |
| `demo:drive`, diagnosis | 14.6 s | 18.9 s |

- **Every turn loaded the skill first**, the eval's and demo:drive's. The
  load is one model call more: the first call is 6,594 tokens instead of
  7,119 (the prompt is 4,011 characters instead of 8,300, with 3 more tools
  and the skill toolset's own instructions), and the runbook comes back as
  its result, 1,712 tokens that every later call carries.
- **The rest is where the model put two reads.** In four of the five turns,
  all but demo:drive's, it asked for Prometheus and Tempo together with the
  three lists, not with the log as the runbook says, so their results,
  about 13,000 tokens, ride in one call more. In three, `bad-release`,
  `recovered` and a `task diagnosis-agent:ask` of the same alert (20.2 s,
  4, 84,345), it read the ReplicaSets as YAML where the runbook says wide,
  about 8,000 tokens more, also carried twice. For `bad-release` that
  accounts for the 40,164 tokens: 6,600 for the load, 5,100 for the runbook
  carried, 12,900 for the queries and 16,200 for the YAML. Before, one of
  the three turns did both, `asked-to-change`, though its YAML was one
  ReplicaSet, read in its second step.
  Earlier rc1 turns with the runbook in the prompt also took 20 to 24
  seconds, but their tool calls were not kept, so five turns do not show
  whether the move makes the model keep to the runbook less.
- Output tokens did not change (1,450 to 1,534 against 1,308 to 1,468).
  `task diagnosis-agent:checks` passed 43 of 43, every eval check passed,
  `task diagnosis-agent:trace` gave 3 of 3 turns in one piece (246 to 326
  spans), and the pre-flight 16 of 16. One of those three trace turns, a
  question that names search-service but is no incident, loaded the
  runbook too: 3 model calls instead of 2.

Two rules of the prompt then still contradicted the skill: its tool list did
not name `load_skill`, and it said text from a tool is never an
instruction, which covered the runbook. With both fixed, the eval ran twice
in each state, six turns, every check passing:

| | Turn 1 | Turn 2 |
|---|---|---|
| `asked-to-change` | 23.7 s, 4 model calls, 60,841 tokens in | 15.4 s, 4, 60,442 |
| `bad-release` | 28.3 s, 4, 74,624 | 21.2 s, 4, 74,579 |
| `recovered` | 21.6 s, 4, 68,405 | 21.3 s, 4, 68,370 |

The ReplicaSets were read wide in all six. Prometheus and Tempo still came
with the three lists in `bad-release` and `recovered`, and with the log in
`asked-to-change`. So the skill costs one model call per diagnosis, about 5
to 7 seconds and 10,000 to 25,000 tokens in against the runbook in the
prompt; the rest of the earlier difference was the YAML.

On 2026-11-03 the prompt stopped telling the agent that every tool takes a
namespace: the Kubernetes tools do, the metrics, traces and logs tools take
queries. The eval then passed all three scenarios, each loading the skill
first and making 7 read-only tool calls and 4 model calls:

| Scenario | Seconds | Tokens in | Tokens out |
|---|---|---|---|
| `recovered` | 13.4 | 66,729 | 1,323 |
| `asked-to-change` | 13.0 | 72,785 | 1,383 |
| `bad-release` | 13.2 | 72,809 | 1,470 |

`task diagnosis-agent:checks` passed on the same revision.

## kagent and diagnosis-agent, checked by version

Moved here from the kagent README, which links to it.

- **With the runbook as a skill, on rc1, 2026-11-02:**
  `task diagnosis-agent:checks` passes 43 of 43 (the prompt without the
  runbook, the skill's image mounted and in the registry, 13 tools offered).
  `task diagnosis-agent:eval` passes the three scenarios, each loading the
  skill first: `asked-to-change` in 20.7 seconds, `bad-release` in 23.8 and
  `recovered` in 24.2, with 4 model calls each. `task demo:drive` passes,
  with the diagnosis 18.9 seconds after the alert. `task demo:chain` passes,
  `task diagnosis-agent:trace` gives 3 of 3 turns in one piece, and
  `task demo:preflight` is GO, 16 of 16. Substrate's pods have no restart,
  atelet's included. Once the prompt named `load_skill` and took the
  runbook it returns as instructions, the eval passed twice per scenario,
  15.4 to 28.3 seconds with 4 model calls each, reading the ReplicaSets
  wide in all six turns. The figures are under [diagnosis-agent](#diagnosis-agent).
- **With the real model, on rc1, 2026-11-02:** `task diagnosis-agent:checks`
  passes 41 of 41. `task diagnosis-agent:eval` passes the three scenarios:
  `asked-to-change` in 14.9 seconds (8 checks), `bad-release` in 23.7 (11)
  and `recovered` in 20.3 (10). `task demo:drive` passes, with the diagnosis
  in 14.2 seconds and the alert cleared 30.7 seconds after Apply.
  `task demo:chain`, `task smoke` and `task sts:check` pass, and
  `task demo:preflight` is GO, 16 of 16.
- **With the real model, on alpha17, 2026-10-30:** the same checks passed 41
  of 41, and while nothing answers on 7070 one check fails (the agent's key
  on `/v1/models`). The eval passed all three scenarios, but one run covers
  only those whose precondition holds: `recovered` needs the search healthy,
  and `bad-release` and `asked-to-change` need it failing
  (`task demo:break`). In `asked-to-change` the agent called only read tools
  and the Deployment stayed unchanged. `task demo:drive` passed, and
  `task demo:preflight` was GO after `task demo:reset`.
- **Install and removal, from alpha17 to rc1, on 2026-11-02:** the uninstall
  took about 50 seconds and left no kagent or `ate.dev` CRD, namespace or
  volume. The install passed at the first attempt in 2 minutes 10 seconds:
  all 18 pods ran with no restart, and `diagnosis-agent` compiled and became
  Ready. `task down && task up` then built rc1 on an empty machine the same
  day, at the first attempt and with no manual step, this layer in 177
  seconds, and the pre-flight was GO, 16 of 16.
- **Install and removal, on alpha17, 2026-10-30:** the uninstall removed this
  layout in 46 seconds with no release, namespace, Secret, volume, trust
  bundle or CRD left, and `task kagent:install` then put it back.
  `task down && task up` built it on an empty machine at the first attempt,
  with no manual step, and every check above passed again on that cluster.
- **The UI in a browser, on rc1, 2026-11-02:** signing in goes as
  **Signing in** in [`60-kagent`](../agent-deployments/clusters/dev/platform/60-kagent/README.md) says. `platform-engineer` gets in, and the UI lists
  `diagnosis-agent` as Ready. `developer` gets the proxy's 403.
- **The UI in a browser, on alpha17, 2026-10-30:**
  - `platform-engineer` signs in through Keycloak, and the UI then shows its
    own "Signed in as" page with a Continue button. The dashboard shows 1
    agent ready, 2 model configurations, 3 MCP servers and 29 tools, and the
    Agents page lists `diagnosis-agent` as Ready. After sign-in nothing
    answered 401 or 403. Edit and delete are offered on the agent; neither
    was tried.
  - The chat list showed none of the agent's 9 earlier conversations. A chat
    from the UI answered with the real model, calling `k8s_get_resources`
    once. It left no line on the gateway's route `kagent/diagnosis-agent`,
    while the agent's own model and tool calls went through the gateway, as
    **What it opens** in [`60-kagent`](../agent-deployments/clusters/dev/platform/60-kagent/README.md) says.
  - `developer` is refused with 403 at the sign-in callback (the proxy logs
    `AuthFailure ... unauthorized`). No session cookie is issued, and the
    page and the API both answer 403.
  - The session cookie had 23 minutes left about a minute and a half after
    sign-in, and `favicon.svg` answers 403 before sign-in (still so on rc1).

## Rebuilds

Before these, as `scripts/up.sh` recorded them: 14 to 15 minutes from
`task down` on 2026-10-07, and 16 minutes on 2026-10-30 (kagent
1.0.0-alpha17, Substrate 0.6.0-alpha3, Agentgateway 1.7.0), on Docker
Desktop with 8 CPUs. Run again on a finished cluster, `task up` takes under
2 minutes.

On rc1, `task down && task up` took 16 minutes 15 seconds on 2026-11-02, at
the first attempt and with no manual step (kagent and Substrate 177 seconds,
against 137 on alpha17), and ended with a pre-flight of 16 of 16. On that
cluster the agent's checks passed 41 of 41, the eval's three scenarios took
21.4, 14.3 and 12.2 seconds, `task demo:drive` put the diagnosis on the card
14.6 seconds after the alert and the alert stopped 30.6 seconds after Apply,
and `task diagnosis-agent:trace` gave 2 of 3 turns in one piece.

On alpha17, `task down && task up` took 15 minutes 50 seconds, at the first
attempt and with no manual step, and ended with a pre-flight of 16 of 16. On
that cluster the eval's three scenarios took 16.5, 16.8 and 15.6 seconds, and
`task diagnosis-agent:trace` gave 3 of 3 turns in one piece. With Grafana and
Langfuse signing in through Keycloak it took 13 minutes 50 seconds on
2026-10-31, again at the first attempt, and `task sso:check` and the
pre-flight passed on the new cluster.

With the Agentgateway admin UI and its database added, all 14 install steps took
13 minutes 52 seconds on 2026-11-01, at the first attempt and with no manual
step, and the gateway connected to its database with no restart. The pre-flight
at step 15 said NO-GO, because the local model endpoint's own login had expired,
which is outside the cluster. Once it was renewed, with no change to the cluster,
the pre-flight gave 16 of 16, `task diagnosis-agent:checks` 41 of 41, and
`task demo:drive`, `task demo:chain`, `task sts:check`, `task sso:check`,
`task diagnosis-agent:trace` and the eval's three scenarios all passed.

Before the rebuild on rc1, on the running cluster, the move of the kagent
layer from alpha17 to rc1 on 2026-11-02 was an uninstall
of about 50 seconds and an install of 2 minutes 10 seconds, at the first
attempt; the pre-flight then gave 16 of 16.

## chain-sts

In the dev cluster, recorded on or before 2026-10-21 (commit 5efda11). Moved
here from chain-sts's README and its release's runbook, which link to it.

- **Replicas.** With exchanges every 3 s (two per round, then the
  gateway and `delivery-mcp`): the scale to two, `kubectl delete pod` of one
  pod, and an eviction of another cost no request (32 rounds); a second
  eviction right after the first was refused by the budget (429) until the
  replacement was ready; both pods sign with the same kid. A deleted pod
  bypasses the budget; the preStop sleep is what keeps it from dropping
  connections. Both pods run on kind's one node.
- **An actor's token after its pod is deleted.** The API server refused a
  token bound to a pod 10 to 13 seconds after the pod was deleted ("service
  account token has been invalidated").

### Key rotation (2026-10-21)

On 2026-10-21, from Secret `chain-sts-signing-key` (kid
`DeD-u9kqSAONbshYsorPNqK3pgtdDDZTEx4tZIKwe9k`) to
`chain-sts-signing-key-202610211048` (kid
`4A-v1fts-t4P_nLgOF1t61no_oDd_gyJESwJcEVg8-4`), with two replicas. A loop ran
every 3 s from 10:46:58 to 11:07:52 UTC: platform-engineer's Keycloak token
exchanged in `remediation-agent`'s pod with a `kubectl create token
--audience chain-sts` actor token for `chat-assistant`, that token exchanged
again for `remediation-agent`, the first used for `remediation-agent`'s agent
card and the second for `tools/list` and a `list_incidents` call at
`/mcp/delivery`, through `localhost:18080`, so the gateway and
`delivery-mcp` verified each. **418 rounds, 2,926 requests, no failure.**

| UTC | What happened | Pods (`/healthz`) | Gateway's copy |
|---|---|---|---|
| 10:48:04 | `task sts:rotate:new`; rollout done 10:48:12 | sign `DeD-…`, next `4A-…` | `DeD-…` |
| 10:52:09 | the gateway's fetch | | `DeD-…`, `4A-…` |
| 10:54:20 | `task sts:rotate:promote`, allowed at 362 s; rollout done 10:54:28 | sign `4A-…`, previous `DeD-…` | `DeD-…`, `4A-…` |
| 10:54:28 | the loop's first token signed by `4A-…`; its last by `DeD-…` was at 10:54:25 | | |
| 10:55:18 | `task sts:install` (below); rollout done 10:55:25 | the same | |
| 10:57:09 | the gateway's fetch | | `4A-…`, `DeD-…` |
| 11:02:42 | `task sts:rotate:drop`, allowed at 429 s after 10:55:25; rollout done 11:02:51; `chain-sts-signing-key` deleted | sign `4A-…` | `4A-…`, `DeD-…` |
| 11:07:09 | the gateway's fetch | | `4A-…` |

The promote's sync picked up a chart change that was in the working tree,
the narrower ClusterRole, and helm stopped at the binding's `roleRef` after
applying the rest: the pods rolled to the new key, and the task stopped
before its check. `task sts:install` with the committed chart finished the
release at 10:55:18, and the drop's wait counted from that rollout. A
`task sts:install` after the drop changed nothing.

## The identity broker (2026-11-03)

A second Keycloak realm, `corp`, stands in for the enterprise identity
provider, and the `demo` realm brokers it over OIDC as
[`docs/production-design.md`](production-design.md), section 2, proposes.
How it is set up, and the deliberate differences from that design, are in the
[Keycloak release's README](../agent-deployments/clusters/dev/platform/20-keycloak/README.md).
Deployed 08:41 PST; `task identity:broker-check` and
`task identity:revocation-drill` ran on it.

- **A brokered token.** Signed in as corp user `alex.rivera` through the
  `corp` button, for client `mcp-client`: `iss`
  `http://localhost:18081/realms/demo`, `aud` `agentgateway`, `sub` a new
  Keycloak ID, `idp_sub` `c0000000-0000-4000-8000-000000000001` (corp's
  ID), `roles` including `developer`, and `team` `search`, a single string.
  The `chat-ui` token carries the same, with `aud` `chat-assistant`.
- **The gateway** answered `tools/list` at `/mcp/delivery` with HTTP 200 and
  `get_incident`, `list_incidents`, `propose_change`; the two other corp
  users got exactly their roles' tools.
- **Linking.** A corp user whose email is a demo user's
  (`developer@demo.invalid`) was refused with HTTP 409, "already exists": no
  link offered, no account made. A brokered user deleted and signed in again
  got a new `sub` and kept its `idp_sub`.
- **Groups.** A group removed at corp took the role away at the user's next
  sign-in at corp. While the Keycloak session lived, refresh and single
  sign-on kept the old role.

**Revocation**, from the moment the user was disabled at corp (08:46:28):

| Seconds | What happened |
|---|---|
| -0.04 | Signed in: an access token valid 1,800 s, and a refresh token |
| 0.0 | Disabled at corp. A new sign-in at corp is refused at 0.1 s |
| 0.1 | The access token is still accepted by the gateway; a refresh still works and gives a new token; single sign-on to the demo realm still works without asking corp |
| 0.1 to 0.2 | `reconcile.py` disables the user in the demo realm and ends 1 session, in 0.12 s |
| 0.3 | A refresh fails (`invalid_grant`, "Session not active"); a new sign-in is refused; all three access tokens are still accepted |
| 1,801.1 | The last access token is refused, 1.2 s after its `exp`; it was last accepted 0.8 s before `exp` |

So a leaver is cut off at the job's interval plus the access token's
remaining lifetime. The gateway showed no leeway past `exp` that a
second-scale test could see, where its library's default is documented as
60 s.

## The gateway's admin port and database

What guards them is in
[`10-agentgateway/README.md`](../agent-deployments/clusters/dev/platform/10-agentgateway/README.md).

- **A gateway pod that dies while its database is down** stays down, and
  every route with it, until the database returns. Measured with the
  database down for 90 seconds (recorded on 2026-10-31): 105 seconds without
  routes, back 30 seconds after the database was started, with no manual
  step.
- **The guards, on 2026-10-31.** from two pods with no NetworkPolicy of their own, the
  gateway answered on ports 80 and 15020 and the admin port timed out, by the
  pod's address and by its Service. 70 attempts at the Service during a restart
  of the proxy got no answer. All seven pages of the UI load with no failed
  request. With the sign-in proxy scaled to 0, `task smoke`, `task sts:check`
  and the pre-flight pass and the proxy does not restart, and
  `task ui -- agentgateway` still works. The sign-in proxy starts with Keycloak
  down, which `task up:trunk` needs. Other pods cannot reach the database.
  `task sso:check` covers the rest.

## Drills

`task demo:backup:refused-by-service` passes with an open proposal: the gateway
offers `apply_change` to a platform engineer and passes the call, delivery-mcp
refuses it under rule `change_is_approved`, and the change reads back as
`proposed`. With no proposal it says so and exits 3.

## Rehearsals of the show (2026-10-06)

Moved here from the [run of show](../demo/run-of-show.md), whose beats they time.

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
left on its sign-in. The browser setup of the pre-flight, done by the script,
took 16 seconds; allow 5 minutes by hand.

## The full incident

Scripted, on 2026-11-03 (kagent 1.0.0-rc1, the runbook as a skill,
`chat-assistant` 0.1.12): `task demo:drive` took 75 seconds and passed every
check. The diagnosis took 12.8 seconds, on the card 39.9 seconds after the
release started; Apply to resolved 7.2 seconds; the alert stopped 31.9
seconds after Apply. The gateway's own usage records (table `request_logs`
in `agentgateway-postgresql`) show six model calls:

| Calls | For | Tokens in | Tokens out | Cost |
|---|---|---|---|---|
| 4 | The diagnosis, `diagnosis-agent`'s workload key | 60,702 | 1,271 | $0.134 |
| 1 | `remediation-agent`'s report, for `platform-engineer` | 215 | 71 | $0.0006 |
| 1 | `comms-agent`'s draft, for `incident-manager` | 510 | 118 | $0.0022 |
| **6** | **The incident** | **61,427** | **1,460** | **$0.137** |

Before, undated: about 75 seconds, five model calls and about $0.15.

Driven by the real alert, three runs, seconds from `demo:break`:

| Moment | Seconds |
|---|---|
| Alertmanager calls the hook | 22 |
| Incident card visible ("Diagnosing...") | 22 to 23 |
| Diagnosis shown on the card | 39 to 41 |
| Apply clicked to resolved | 7 |
| Alert clears after the fix | 31 to 33 |

- `diagnosis-agent` uses three observability tools (Prometheus, Tempo, Loki)
  besides its cluster tools; a diagnosis took 14 to 15 seconds in these
  runs. Later figures, with the runbook as a skill, are under
  [diagnosis-agent](#diagnosis-agent).
- `demo:drive` uses the real alert by default; `demo:alert` is a fallback.
  `demo:reset` restarts `chat-assistant` and waits for the alert to clear (up
  to 35 seconds). A second break opens a new incident.
- **Tempo:** one trace per request. The alert, hook, incident, diagnosis and
  its model calls are one trace. Each button click is one trace through the
  gateway, `chat-assistant`, the agent, `delivery-mcp`, the search check and
  the model call. Clicks, card polls and the alert are separate traces, and
  the browser emits no span.
- **Langfuse:** one generation per model call, with tokens, the verified
  user and cost (prices and their source in
  `agent-deployments/clusters/dev/platform/50-langfuse/model-prices.json`). An incident is several traces,
  not one. Propose and approve call no model, so they do not appear, and the
  diagnosis is attributed to the workload, not a user. About $0.15 an
  incident.
- Components when this was measured: Python components 0.1.1,
  `chat-assistant` 0.1.6, `web` 1.0.0. The cluster now runs `chat-assistant`
  0.1.12 and `web` 1.2.1, whose pages were redrawn since. The numbers in this
  section are from before that.

# Agentgateway demo

> **Owner:** coordinator · **Type:** start · **Checked:** 2026-11-03 against Agentgateway 1.7.0, Keycloak 26.7.5, chain-sts 0.2.0, kagent and Agent Substrate 1.0.0-rc1

A kind cluster that shows the EKS agent platform option from the architecture
document (`../Docs/AgentGateway/architecture.md`, kept next to this repository,
not in it) in under 10 minutes, through one incident. A Sample App's search breaks after a
release. An alert starts a read-only diagnosis agent. Three signed-in roles
(`developer`, `incident-manager`, `platform-engineer`) propose, approve and
apply the rollback from an incident card in a chat UI. Every agent, tool and
model call goes through Agentgateway, with the caller's verified identity,
except diagnosis-agent's reads from its own read-only Kubernetes tool server,
and its model and Grafana calls, which carry a key that names the workload,
not a person ([`docs/system-architecture.md`](docs/system-architecture.md),
section 7.7). `chat-assistant`, `remediation-agent` and `comms-agent` do not pass the
caller's token on: each exchanges it at chain-sts, the token exchange built
here, for one that names the same user and every agent the request passed
through.

This is a demonstration of what is possible. Its results are observations, not
pilot evidence for the architecture decision.

## Documentation

| You are | Read |
|---|---|
| New to the project | This README, then [`docs/system-architecture.md`](docs/system-architecture.md), sections 1 to 4: the parts and one incident hop by hop |
| Presenting the demo | [`demo/run-of-show.md`](demo/run-of-show.md): times, clicks, words and fallbacks |
| An architect or security reviewer | [`docs/system-architecture.md`](docs/system-architecture.md), sections 5 to 8: tokens, chain-sts, each path case by case, and what keeps the gateway the only door. Then [`docs/production-design.md`](docs/production-design.md): connecting Okta, Ping or another identity provider, the options compared, hardening and open decisions |
| Building or changing a part | [`CONTRIBUTING.md`](CONTRIBUTING.md), [`docs/contracts.md`](docs/contracts.md) (what the parts agree on), and the README next to the part |
| Operating the cluster | [`docs/cluster.md`](docs/cluster.md) (names, ports, every task), then the README of each platform release under `agent-deployments/clusters/dev/platform/` |
| Checking a figure | [`docs/measurements.md`](docs/measurements.md): every timing, token count and cost, with its date |

Each component has a README next to it, and so does each platform release
except `30-model-route` and `80-policies`, whose helmfiles explain them.
[`agent-platform/README.md`](agent-platform/README.md) says which chart,
profile and policy each release uses. Where each kind of fact lives, and the
rules for documents, are in [`CONTRIBUTING.md`](CONTRIBUTING.md#documentation).

## What you need

| Need | Detail |
|---|---|
| Docker Desktop | With about 16 GiB of memory free for it. The cluster holds 8.5 GiB when it has just been built, 10 GiB after a few incidents and 11 to 12 GiB after some hours of use. The gateway reaches the model endpoint on this machine as `host.docker.internal`, which Docker Desktop provides |
| The pinned tools | `mise trust && mise install` in this directory: kubectl, helm, kind, helmfile, task, jq, python, node and uv at the versions in `mise.toml`. Node and uv are for a component's own tasks (test, run-local), not for `task up`. Also on the `PATH`: `curl`, `openssl` and `base64`. `task doctor` checks all of it |
| The model endpoint | An Anthropic Messages API on this machine at `http://localhost:7070`, without a key, serving `claude-sonnet-5-5` and `claude-haiku-4-5-20251001`. The install works without it; the show does not. Or Amazon Bedrock, with AWS credentials exported in the shell: [Switching to Bedrock](#switching-to-bedrock) |
| Free host ports | 18080 to 18089 and 5002, all bound to 127.0.0.1. 18090 to 18096 as well, but only while `task ui` forwards a UI |
| Internet, the first time | Images, charts and two small CLIs are downloaded: about 15 minutes |

## Bring it up

```sh
mise trust && mise install
mise exec -- task up               # no cluster -> ready demo, about 15 minutes
mise exec -- task demo:preflight   # the go or no-go list; it is also the last step of `task up`
```

In a shell with mise activated, `task up` is enough. Every command in
this repository is a task; `task --list` shows them all.

`task up` runs fifteen steps in the one order that works on an empty machine
and says which step it is on. It is safe to run again. If a step fails it
stops, names the step, and `task up -- --from <n>` carries on from there.
The order and the reasons for it are at the top of
[`scripts/up.sh`](scripts/up.sh).

`demo:preflight` prints one line per check. Under every `NO-GO` it says what
to do. Run it before each showing.

`task doctor` does the same for this machine: one line per tool, and under
the `NO-GO` lines what to install. `task up`, `task demo:drive` and the backup
drills run that check before they start, and stop there if a tool is missing
or too old. `task setup` fetches now what the tasks would otherwise fetch the
first time they need it: two small CLIs, and with `-- --dev` every
component's locked packages.

## Where things are

| What | Address | Login |
|---|---|---|
| Chat UI | <http://localhost:18083> | `developer`, `incident-manager` or `platform-engineer`, password `demo` (Keycloak, demo only) |
| Sample App | <http://localhost:18082> (Search: `/search`) | none |
| Grafana | <http://localhost:18084> | `platform-engineer`, password `demo`, is Admin; the other roles are Viewer |
| Langfuse | <http://localhost:18085> | Press **Keycloak**, as `platform-engineer`; no other role is let in |
| Agentregistry | <http://localhost:18086> | none |
| kagent | <http://localhost:18087> | `platform-engineer`, password `demo`; no other role is let in |
| Agentgateway UI | <http://localhost:18088/ui/>, and <http://localhost:18088/ui/llm/analytics> for cost and tokens | `platform-engineer`, password `demo`; no other role is let in |
| Agentgateway | <http://localhost:18080> | a bearer token: `task token -- developer` |
| Keycloak | <http://localhost:18081/realms/demo>, and its admin console at <http://localhost:18081/admin/> | the sign-in pages of the above; the console is `admin`, password in Secret `keycloak/keycloak-admin` |

One sign-in to Keycloak covers Grafana, Langfuse, kagent and the Agentgateway UI:
the first one asks for the password and the others do not. `task sso:check` shows it for all but kagent. If Keycloak
is down, `task observability:login` and `task langfuse:login` print each one's
own login.

A fourth user, `developer-other-team`, is a developer who does not own the
search service; `task demo:drive` uses it to show a refusal by team.

The kagent UI is an operator's console and not part of the show. Whoever
signs in can change and delete `diagnosis-agent`, and a chat started there
reaches the agent through kagent and not through the gateway. How it is
guarded is in the
[kagent notes](agent-deployments/clusters/dev/platform/60-kagent/README.md).

Seven more UIs run in the cluster without a host port. `task ui -- <name>`
forwards one to this machine until Ctrl-C, `task ui -- all` forwards the
seven, and `task ui` alone lists every UI with its address and whether it
answers now. Nothing in the cluster changes.

| `task ui -- <name>` | Address while it runs | Shows | Login |
|---|---|---|---|
| `agentgateway` | <http://localhost:18090/ui> | Agentgateway's admin UI, the same as at <http://localhost:18088/ui/> and for when that is down. The port has no login and can stop the proxy (`docs/cluster.md`) | none |
| `prometheus` | <http://localhost:18091> | Targets, rules and queries | none |
| `alertmanager` | <http://localhost:18092> | Alerts and silences | none |
| `rustfs` | <http://localhost:18093/rustfs/console/> | The snapshots Agent Substrate keeps of its Actors | printed by the task |
| `seaweedfs` | <http://localhost:18094> | The object store of Langfuse | none |
| `seaweedfs-filer` | <http://localhost:18095> | The files Langfuse stored | none |
| `clickhouse` | <http://localhost:18096/play> | A query page on the traces Langfuse holds | printed by the task |

They are forwarded and not published because none has a login worth the
name; [`local/ui/ui.sh`](local/ui/ui.sh) gives the reasons.

## Main tasks

| Task | Does |
|---|---|
| `task doctor` | Does this machine have the tools: one line each, and what to install under the failing lines |
| `task up` | From no cluster to a ready demo. Safe to re-run |
| `task demo:preflight` | Go or no-go before a showing, with the fix under each failing line |
| `task demo:reset` | Back to a clean start: search 2.0.0, no incident, the alert quiet. Before each showing |
| `task demo:break` | Ships search-service 2.1.0, the release that starts the incident |
| `task demo:drive` | The whole incident as a script, through the gateway, as each role |
| `task status` | What is running, the addresses, node memory |
| `task ui` | Every web UI, its address and whether it answers: [Where things are](#where-things-are) |
| `task token -- <user>` | An access token for a user, or for `alert-automation` |
| `task down` | Removes the cluster, the local registry and the kubeconfig. Nothing else on the machine |

Every other task, and what each is for, is in
[`docs/cluster.md`](docs/cluster.md#tasks). All tasks use the kubeconfig in
`local/kind/kubeconfig` and never the default one.

## Layout

Each top-level directory answers one question.

| Directory | Holds | Would exist in production |
|---|---|---|
| `agent-platform/` | What any team can reuse: charts, profiles, policies, platform tests | Yes ([architecture, section 11.1](docs/architecture-layout.md)) |
| `agent-deployments/` | What runs where: platform services, one selection per workload, routes and who may call them, whose tokens the cluster trusts | Yes (section 11.1) |
| `components/` | Source owned by one team. Each child stands in for a separate repository | Yes, as separate repositories |
| `local/` | Everything that exists only because this is kind: the cluster's own configuration, Keycloak for Okta, a local registry for ECR, the Grafana stack for New Relic or Dynatrace, a traffic generator for the Sample App's visitors, and the forwards to the UIs that have no host port | No |
| `demo/` | Presenting only: the run of show, break and reset scenarios, the pre-flight, backup drills | No |
| `docs/` | What the parts agree on, the cluster reference, how the system fits together, what was measured, and the architecture's section on layout | The contracts, yes |
| `scripts/` | Building the cluster in order (`up.sh`), checking and preparing this machine (`doctor.sh`, `setup.sh`), and the shell helpers every cluster script shares | No |

## Model provider

Agentgateway is the only component that talks to a model provider. Agents and
the chat assistant call the gateway's model route with the token chain-sts
exchanged the caller's for, `diagnosis-agent` with a key the gateway issued
to it, and none holds a provider key. The binding is one file:
[`agent-deployments/clusters/dev/platform/30-model-route/model-provider.yaml`](agent-deployments/clusters/dev/platform/30-model-route/model-provider.yaml).

It says `active: local`: the Anthropic Messages API on this machine at
`http://localhost:7070`. From inside the cluster `localhost` is the pod, so
the gateway is told `host.docker.internal`. A new cluster always starts there.

### Switching to Bedrock

Amazon Bedrock is the other provider that file describes. It is off until it
is asked for, in a shell where AWS credentials are exported:

```sh
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...

task model -- bedrock            # switch a cluster that is running
MODEL_PROVIDER=bedrock task up   # or: build the cluster and switch in step 1

task model                       # which provider the gateway uses now
task model -- local              # back to the endpoint on this machine
```

From a profile or a single sign-on session instead of keys:
`eval "$(aws configure export-credentials --format env)"`.

`task model -- bedrock` writes the credentials to Secret `bedrock-credentials`
in namespace `agentgateway-system`, keeps the choice next to it, applies the
release `model-route` and runs `task smoke`. kind has no workload identity, so
the proxy cannot pick up credentials by itself as it would with IRSA on EKS.
The credentials go from the shell to the cluster and into no file.

The choice lives in the cluster. `task up` and `task deploy` keep it,
`task down` takes it away with the cluster, and credentials that happen to be
exported are never read unless Bedrock is asked for. How it works is at the
top of
[`scripts/provider.sh`](agent-deployments/clusters/dev/platform/30-model-route/scripts/provider.sh).

| Exported | Sets | Without it |
|---|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | The credentials | The ones already in the cluster are kept |
| `AWS_SESSION_TOKEN` | The session token of temporary credentials | None is sent |
| `AWS_REGION`, or `AWS_DEFAULT_REGION` | One region; the gateway does not spread over several | `us-east-1` |
| `BEDROCK_MODEL_ID`, `BEDROCK_MODEL_ID_FAST` | Bedrock's IDs for `claude-sonnet-5-5` and `claude-haiku-4-5-20251001` | `anthropic.claude-sonnet-5-5`, `anthropic.claude-haiku-4-5` |
| `BEDROCK_ENDPOINT` | Which of Bedrock's API surfaces: `MantleOnly`, `MantlePreferred`, `RuntimePreferred`, `RuntimeOnly` | `MantleOnly`, which speaks the Anthropic Messages API as the local endpoint does |

The last three keep what was exported at the previous switch, until
`task model -- local`. Their first values are in `model-provider.yaml`.

Components keep sending `claude-sonnet-5-5` and `claude-haiku-4-5-20251001`;
the gateway maps them to the Bedrock IDs and still refuses any other model
with 403. `diagnosis-agent` has a route of its own to the same backend, so it
follows without a change.

**Temporary credentials expire.** The model route then answers with Bedrock's
refusal, and `task demo:preflight` says NO-GO with Bedrock's reason. Export
new ones and run `task model -- bedrock` again; the gateway takes them without
a restart.

The IAM identity must be allowed to invoke the two models. A policy scoped by
service name must allow both `bedrock` and `bedrock-mantle`.

**No completion has come back from Bedrock yet.** There was no AWS account to
try it with. What was run on this cluster, with the example keys from the AWS
documentation:

- The gateway accepted the backend. Requests in both client formats went to
  `bedrock-mantle.us-east-1.api.aws` with the mapped model ID, and with
  `BEDROCK_ENDPOINT=RuntimeOnly` to `bedrock-runtime.<region>.amazonaws.com`.
  Bedrock refused the keys: "The security token included in the request is
  invalid."
- A changed Secret reached the proxy within seconds, without a restart.
- `task deploy` and `task up:trunk` kept Bedrock, and `task model -- local`
  brought back a route that passes `task smoke` and the pre-flight.

So the first run with real credentials decides whether the two model IDs and
the endpoint are right; `task model -- bedrock` says what to change when they
are not. Plan time to try it before a showing.

What is still written for the local endpoint, and will need a look:

- `task demo:backup:bypass-model` proves that a pod cannot reach
  `host.docker.internal:7070` directly. With Bedrock it has nothing to
  probe.
- `platform/80-policies/gateway-rules.yaml` names `host.docker.internal`
  as the model host that no team backend may point at. A Bedrock backend
  has no host, so that rule no longer covers the provider.
- `platform/50-langfuse/model-prices.json` holds Anthropic's list prices,
  matched on the client-facing model names. With Bedrock the gateway's spans
  carry the Bedrock ID (seen: `anthropic.claude-haiku-4-5`), which the
  patterns do not match, so Langfuse shows tokens and no cost. Bedrock's
  prices also differ.
- `diagnosis-agent` sends the OpenAI chat-completions format. It reached
  Bedrock like the Anthropic format did; no answer in it has been seen.
- Every timing in the run of show was measured with the local endpoint.

## Limits worth knowing

The run of show lists them for the room. In short: a real MCP client cannot
yet sign in through the gateway by itself; Langfuse shows an incident as
several traces; kagent and Agent Substrate are release candidates (1.0.0-rc1),
and parts of Agentgateway are alpha.

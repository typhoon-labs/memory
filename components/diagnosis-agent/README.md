# diagnosis-agent

> **Owner:** diagnosis-agent maintainers · **Type:** reference · **Checked:** 2026-11-03 against kagent and Agent Substrate 1.0.0-rc1

Read-only investigation of an alert. Called with text naming the service and
the alert, it returns a suspected cause, evidence and a recommended version.
The agent has no code: it is a prompt, a list of tools and its skills, and
kagent runs it. The one thing built is an image of its skills, files that
kagent mounts into the agent's sandbox.

| | |
|---|---|
| Built with | kagent 1.x, declarative |
| Serves | A2A 1.0 over JSON-RPC, through the gateway only; `platform-engineer` can also chat with it in the kagent UI |
| Gateway route | `/a2a/diagnosis-agent`, for any valid token, the alert automation's included; on a caller's behalf, `chat-assistant` only |
| Model | `claude-sonnet-5-5` (`MODEL_ID`) |
| In the dev cluster | Release `diagnosis-agent` in namespace `kagent`, on kagent 1.0.0-rc1; skills image `diagnosis-agent-skills:0.1.0`, pinned by digest |
| Values | [`agent-deployments/clusters/dev/workloads/diagnosis-agent/`](../../agent-deployments/clusters/dev/workloads/diagnosis-agent/): where it runs, with which credential and behind which route |
| Route file | [`agent-deployments/clusters/dev/domains/operations/diagnosis-agent.yaml`](../../agent-deployments/clusters/dev/domains/operations/diagnosis-agent.yaml): who may call it |

| Here | Holds |
|---|---|
| `config/agent.yaml` | What the agent is: model, tools, limits. Values for the chart `agent-platform/profiles/kagent/agent` |
| `prompts/system.md` | The system prompt |
| `skills/search-service-runbook/SKILL.md` | The runbook of search-service, an Agent Skill the model loads when a call is about that service |
| `Dockerfile` | The image of `skills/`, `localhost:5002/diagnosis-agent-skills:<version>`, built and pushed by `task publish` |
| `evals/` | Scenarios, and `run.sh`, which runs them against a deployed agent |
| `scripts/ask.sh` | One question to the agent, the way every caller asks |
| `catalog.yaml` | Its entry in Agentregistry |

## Identity

- **Its callers' tokens** are verified by the policy on its gateway route
  ([routes](../../docs/contracts.md#routes)). kagent takes the caller's name
  from the token without verifying it
  ([kagent's limits](../../agent-deployments/clusters/dev/platform/60-kagent/README.md#limits-found)).
- **No chain-sts token.** It does not exchange at chain-sts and cannot be
  named in a chain: it runs in Agent Substrate's shared worker pool without a
  token of its own
  ([why](../../agent-deployments/clusters/dev/platform/60-kagent/README.md#kagent-and-agent-substrate-in-a-chain)).
- **Its own credential:** model calls carry a key the gateway issued to the
  workload `diagnosis-agent`, not a caller's token. How such a key works is
  in the header of
  [`model-access/values.yaml`](../../agent-platform/profiles/kagent/model-access/values.yaml).
  kagent could not forward one when this was built; since alpha17 it can
  (`tokenPassthrough`), which is not used here. rc1 adds tokens that
  Substrate's egress gateway mints per conversation (`actorJwt`), evaluated
  and not adopted
  ([platform notes](../../agent-deployments/clusters/dev/platform/60-kagent/README.md)).
  Any MCP route the agent uses must accept that key, and the agent must
  address the gateway as `agentgateway-proxy.agentgateway-system.svc` for
  tools, because kagent keeps one credential per host name. Charts:
  `agent-platform/profiles/kagent/`.

## What it serves and returns

- **Calling it:** A2A 1.0 over JSON-RPC through the gateway, no bridge:
  `DIAGNOSIS_AGENT_URL=http://agentgateway-proxy.agentgateway-system.svc.cluster.local/a2a/diagnosis-agent`
  (from the host, `http://localhost:18080/a2a/diagnosis-agent`). It needs a
  bearer token. A 0.3 `message/send` gets `-32601`; retry on `-32004`.
- **A diagnosis takes less than a minute** with `claude-sonnet-5-5`,
  measured in the eval on 2026-11-02 with the prompt as it is now: 4 model
  calls, the first of which loads the runbook, and 6 read tool calls. With
  the runbook in the prompt, rc1 was quicker, with 3 model calls where they
  were counted. The times and token counts are in
  [measurements](../../docs/measurements.md#diagnosis-agent). Its answer
  ends with a JSON block: `suspected_cause`, `evidence`,
  `recommended_version`.
- **Its runbook is a skill** (kagent `AgentTemplate.spec.skills`), not part
  of its prompt. The image of `skills/` is pinned by digest, looked up in
  the registry when the workload's values are rendered, and Substrate's node
  agent mounts it read-only into the sandbox. The model sees each skill's
  name and description and loads the one for the service named in the call
  (`load_skill`); a service with no runbook gets search-service's steps. The
  runbook so reaches the model as a tool result, and the prompt makes it the
  one tool result whose steps are instructions; logs, events and
  annotations stay evidence. The model loaded and used it in every turn
  measured, though not always to the letter: with the prompt as it is now,
  in four of six eval turns it asked for Prometheus and Tempo a step early
  ([measurements](../../docs/measurements.md#diagnosis-agent)). Another
  runbook is another directory under `skills/`, with a `skills` entry in
  `config/agent.yaml`.

## Settings

`ask` and `eval` take the token command and the cluster from the environment
(`PLATFORM_TOKEN_CMD`, `PLATFORM_KUBECONFIG`, `PLATFORM_CONTEXT`), which the
root Taskfile sets for the dev cluster, and the agent's address from
`DIAGNOSIS_AGENT_URL`, which it does not set: the default is the gateway on
this machine, `http://localhost:18080/a2a/diagnosis-agent`.

## Run and test

| Task | Does |
|---|---|
| `task diagnosis-agent:ask -- "<text>"` | One question through the gateway, as `alert-automation` (`--as <user>`, `--context <id>`, `--raw`) |
| `task diagnosis-agent:eval` | Run the scenarios under `evals/` against the cluster as it is now; `-- <scenario>` for one. Each is one real model turn |
| `task diagnosis-agent:deploy`, `:status`, `:checks`, `:trace` | The workload's tasks: apply it, see what it may reach, check what it cannot do, check that a turn is one trace in Tempo (needs the model) |

## Release

| Task | Does |
|---|---|
| `task diagnosis-agent:build`, `:push` | The image of `skills/`, to the local registry (`task publish` runs both); a new image is a new digest, and the next `task diagnosis-agent:deploy` takes it |

The image's version is `DIAGNOSIS_AGENT_SKILLS_VERSION` in
[`Taskfile.yml`](Taskfile.yml), 0.1.0 by default. The dev cluster names the
same version where it looks up the digest, in
[`values.yaml.gotmpl`](../../agent-deployments/clusters/dev/workloads/diagnosis-agent/values.yaml.gotmpl).

## Limits

- It is read-only toward the cluster: its tool servers register no write
  tools, its RBAC is read-only in `sample-app`, and it is refused in other
  namespaces. Inside its own sandbox it is not: kagent 1.0.0-rc1 also offers
  it `read_file`, `write_file` and `edit_file`, with no way to switch them
  off. `bash`, `list_files`, `grep_file` and `ask_user` are switched off, so
  the model is offered 13 tools: its 7, those 3, and the 3 that read its
  skills (`list_skills`, `load_skill`, `load_skill_resource`), and
  `task diagnosis-agent:checks` fails if it is offered anything else.
  What these tools could reach is measured in the
  [platform notes](../../agent-deployments/clusters/dev/platform/60-kagent/README.md#limits-found).

kagent itself, its versions, its memory use and the limits found (among
them the built-in tools no agent asked for):
[`platform/60-kagent/README.md`](../../agent-deployments/clusters/dev/platform/60-kagent/README.md).

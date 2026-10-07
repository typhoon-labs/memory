# diagnosis-agent

Read-only investigation of an alert. Called with text naming the service and
the alert, it returns a suspected cause, evidence and a recommended version.
There is nothing to build: the agent is a prompt, a runbook and a list of
tools, and kagent runs it.

| Here | Holds |
|---|---|
| `config/agent.yaml` | What the agent is: model, tools, limits. Values for the chart `agent-platform/profiles/kagent/agent` |
| `prompts/system.md` | The system prompt |
| `skills/search-service-runbook/SKILL.md` | The runbook, which is put into the prompt |
| `evals/` | Scenarios, and `run.sh`, which runs them against a deployed agent |
| `scripts/ask.sh` | One question to the agent, the way every caller asks |
| `catalog.yaml` | Its entry in Agentregistry |

Where it runs, with which credential and behind which route, is not here: it
is `agent-deployments/clusters/dev/workloads/diagnosis-agent/`, and who may
call it is `agent-deployments/clusters/dev/domains/operations/diagnosis-agent.yaml`.

## As built

- **Calling it:** A2A 1.0 over JSON-RPC through the gateway, no bridge:
  `DIAGNOSIS_AGENT_URL=http://agentgateway-proxy.agentgateway-system.svc.cluster.local/a2a/diagnosis-agent`
  (from the host, `http://localhost:18080/a2a/diagnosis-agent`). It needs a
  bearer token. A 0.3 `message/send` gets `-32601`; retry on `-32004`.
- **A diagnosis takes 11 to 14 seconds** with `claude-sonnet-5-5` (3 model
  calls, 5 read tool calls). Its answer ends with a JSON block:
  `suspected_cause`, `evidence`, `recommended_version`.
- **Its own credential:** model calls carry a key the gateway issued to the
  workload `diagnosis-agent` (the gateway stores only the hash), not a
  caller's token, because kagent cannot forward one. Any MCP route the agent
  uses must accept that key, and the agent must address the gateway as
  `agentgateway-proxy.agentgateway-system.svc` for tools, because kagent keeps
  one credential per host name. Charts: `agent-platform/profiles/kagent/`.
- It is read-only: write tools are not offered, its RBAC is read-only in
  `sample-app`, and it is refused in other namespaces.

kagent itself, its versions, its memory use and the alpha limits found
(among them: a skill cannot be loaded from git, so the runbook is in the
prompt):
[`platform/60-kagent/README.md`](../../agent-deployments/clusters/dev/platform/60-kagent/README.md).

## Tasks

| Task | Does |
|---|---|
| `task diagnosis-agent:ask -- "<text>"` | One question through the gateway, as `alert-automation` (`--as <user>`, `--context <id>`, `--raw`) |
| `task diagnosis-agent:eval` | Run the scenarios under `evals/` against the cluster as it is now; `-- <scenario>` for one. Each is one real model turn |
| `task diagnosis-agent:deploy`, `:status`, `:checks` | The workload's tasks: apply it, see what it may reach, check what it cannot do |

`ask` and `eval` take the agent's address, the token command and the cluster
from the environment (`DIAGNOSIS_AGENT_URL`, `PLATFORM_TOKEN_CMD`,
`PLATFORM_KUBECONFIG`, `PLATFORM_CONTEXT`), which the root Taskfile sets for
the dev cluster.

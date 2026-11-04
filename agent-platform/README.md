# agent-platform

> **Owner:** platform team · **Type:** reference · **Checked:** 2026-11-03 against the helmfiles in `agent-deployments/clusters/dev/`

What any team can reuse: charts, profiles, policies and the platform's checks.
`agent-platform/` stands in for the future platform repository
([`CONTRIBUTING.md`](../CONTRIBUTING.md#where-things-go), "Where things go"),
so a chart's or a policy's notes live here, in the header of its
`values.yaml`, and move with it.

Each entry below says what it is, from its `Chart.yaml` or the header of its
`values.yaml`, and which releases use it, from the helmfiles under
`agent-deployments/`. A release is written `<namespace>/<name>` and links to
its helmfile. Every chart here has at least one release in the dev cluster.

How a workload key works (diagnosis-agent's credential at the gateway) is in
the header of
[`profiles/kagent/model-access/values.yaml`](profiles/kagent/model-access/values.yaml),
the chart that makes it.

## Charts

| Chart | What it is | Releases |
|---|---|---|
| [`charts/agent`](charts/agent/values.yaml) | One agent or tool as a Deployment, a Service and a ServiceAccount, with the platform's conventions | [`agents/chat-assistant`](../agent-deployments/clusters/dev/workloads/chat-assistant/helmfile.yaml), [`agents/comms-agent`](../agent-deployments/clusters/dev/workloads/comms-agent/helmfile.yaml), [`agents/remediation-agent`](../agent-deployments/clusters/dev/workloads/remediation-agent/helmfile.yaml), [`tools/delivery-mcp`](../agent-deployments/clusters/dev/workloads/delivery-mcp/helmfile.yaml) |
| [`charts/chain-sts`](charts/chain-sts/values.yaml) | The token exchange service that names every agent a request passed through ([`components/chain-sts`](../components/chain-sts/README.md)), with its policy, its network boundary and, for the TokenReview actor check, a ClusterRole that allows creating TokenReviews and nothing else | [`chain-sts/chain-sts`](../agent-deployments/clusters/dev/platform/90-chain-sts/helmfile.yaml) |

## Profiles

### Gateway

| Profile | What it is | Releases |
|---|---|---|
| [`profiles/gateway/a2a-route`](profiles/gateway/a2a-route/values.yaml) | One A2A agent behind the gateway: its backend and its route | [`agents/chat-assistant-route`, `agents/comms-agent-route`, `agents/remediation-agent-route`](../agent-deployments/clusters/dev/domains/operations/helmfile.yaml) |
| [`profiles/gateway/http-route`](profiles/gateway/http-route/values.yaml) | One plain HTTP endpoint of a Service behind the gateway, for something that is neither MCP nor A2A, such as a webhook | [`agents/chat-assistant-alert-hook`](../agent-deployments/clusters/dev/domains/operations/helmfile.yaml) |
| [`profiles/gateway/mcp-route`](profiles/gateway/mcp-route/values.yaml) | One MCP server behind the gateway: its backend, its route and which role and which acting agent may use which tool | [`tools/delivery-mcp-route`](../agent-deployments/clusters/dev/domains/operations/helmfile.yaml) |
| [`profiles/gateway/model-route`](profiles/gateway/model-route/values.yaml) | The gateway's model route, the only path from the cluster to a model provider: one LLM backend and the route that exposes it | [`agentgateway-system/model-route`](../agent-deployments/clusters/dev/platform/30-model-route/helmfile.yaml) |
| [`profiles/gateway/telemetry`](profiles/gateway/telemetry/values.yaml) | Sends the gateway's traces and access logs to the OpenTelemetry Collector | [`agentgateway-system/gateway-telemetry`](../agent-deployments/clusters/dev/platform/40-observability/helmfile.yaml) |

Who may call an A2A, HTTP, MCP or model route is a separate release of
`route-auth` that targets it (below).

### kagent

| Profile | What it is | Releases |
|---|---|---|
| [`profiles/kagent/agent`](profiles/kagent/agent/values.yaml) | One declarative kagent 1.x agent, with no code: its model binding, tools, prompt, skills, runtime and gateway route | [`kagent/diagnosis-agent`](../agent-deployments/clusters/dev/workloads/diagnosis-agent/helmfile.yaml) |
| [`profiles/kagent/model-access`](profiles/kagent/model-access/values.yaml) | A second door to the gateway's model route, for workloads that cannot present a user's token: they present a key the gateway issued to them, made by its `mint-key.sh` | [`agentgateway-system/diagnosis-agent-model-access`](../agent-deployments/clusters/dev/workloads/diagnosis-agent/helmfile.yaml), whose presync hook runs `mint-key.sh` |
| [`profiles/kagent/tool-access`](profiles/kagent/tool-access/values.yaml) | A second door to an MCP server behind the gateway, for workloads that cannot present a user's token: the same key as `model-access` opens an MCP backend, on a route of its own | [`agentgateway-system/observability-mcp-workload-access`](../agent-deployments/clusters/dev/workloads/observability-mcp/helmfile.yaml) |
| [`profiles/kagent/postgres`](profiles/kagent/postgres/values.yaml) | The PostgreSQL database kagent and Agent Substrate share, which neither chart brings any more | [`kagent/kagent-postgresql`](../agent-deployments/clusters/dev/platform/60-kagent/helmfile.yaml) |
| [`profiles/kagent/kagent-values.yaml`](profiles/kagent/kagent-values.yaml) | Not a chart: the reusable values for kagent's own chart, `oci://ghcr.io/kagent-dev/kagent/helm/kagent` 1.0.0-rc1, with no provider key and no bundled tool server | [`kagent/kagent`](../agent-deployments/clusters/dev/platform/60-kagent/helmfile.yaml) |
| [`profiles/kagent/substrate-values.yaml`](profiles/kagent/substrate-values.yaml) | Not a chart: the reusable values for Agent Substrate's chart, `oci://ghcr.io/kagent-dev/substrate/helm/substrate` 1.0.0-rc1, the runtime every kagent 1.x agent runs on | [`ate-system/substrate`](../agent-deployments/clusters/dev/platform/60-kagent/helmfile.yaml) |

## Policies

| Policy | What it is | Releases |
|---|---|---|
| [`policies/agentgateway/route-auth`](policies/agentgateway/route-auth/values.yaml) | Requires a verified bearer token on one gateway route, with optional rules on its claims and on the agent acting for the caller | [`agents/chat-assistant-route-auth`, `agents/chat-assistant-alert-hook-auth`, `agents/comms-agent-route-auth`, `agents/remediation-agent-route-auth`, `tools/delivery-mcp-route-auth`](../agent-deployments/clusters/dev/domains/operations/helmfile.yaml); [`agentgateway-system/model-route-auth`](../agent-deployments/clusters/dev/platform/30-model-route/helmfile.yaml); [`kagent/diagnosis-agent-route-auth`](../agent-deployments/clusters/dev/workloads/diagnosis-agent/helmfile.yaml) |
| [`policies/kyverno/gateway-rules`](policies/kyverno/gateway-rules/values.yaml) | Admission rules that keep a team from weakening the platform's gateway rules: no policy on the platform's routes, no second route to its backends, no backend that names what it protects | [`kyverno/gateway-rules`](../agent-deployments/clusters/dev/platform/80-policies/helmfile.yaml) |
| [`policies/kyverno/install-values.yaml`](policies/kyverno/install-values.yaml) | Not a chart: the values for Kyverno's chart, `oci://ghcr.io/kyverno/charts/kyverno`, as small as it goes, the admission controller and nothing else | [`kyverno/kyverno`](../agent-deployments/clusters/dev/platform/80-policies/helmfile.yaml) |
| [`policies/network/workload-boundary`](policies/network/workload-boundary/values.yaml) | The network boundary of one namespace of agents or tool servers: only the gateway calls its workloads, and they reach only the gateway and the platform services they need | [`agents/agents-network-boundary`, `tools/tools-network-boundary`](../agent-deployments/clusters/dev/platform/80-policies/helmfile.yaml) |
| [`policies/network/substrate-egress-boundary`](policies/network/substrate-egress-boundary/values.yaml) | Keeps everything an agent sends inside the cluster: Agent Substrate's egress gateway may connect to pods of this cluster and to nothing else | [`ate-system/substrate-egress-boundary`](../agent-deployments/clusters/dev/platform/60-kagent/helmfile.yaml) |

## Tests

| Directory | What it is | Run by |
|---|---|---|
| [`tests`](tests/README.md) | Checks of the platform's controls against a running cluster | No release: tasks run them, as [its README](tests/README.md) lists |

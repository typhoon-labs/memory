# Glossary and sources

| | |
|---|---|
| Status | Proposed. Nothing is selected or deployed, and there are no pilot results. |
| Updated | 7 October 2026 |
| Based on | Architecture document 0.1 (5 October 2026), sections 18 to 20; the versions pinned in the demo repository as of 7 October 2026 |
| Parent | [Agent platform proposal](00-proposal.md) |

This page defines the terms the other pages use, lists the upstream documentation the design was checked against, and records the versions the demo ran. A source link establishes what a component documents for that version. It does not prove compatibility between components or with our environment.

## Glossary

| Term | Meaning |
|---|---|
| A2A | Agent-to-Agent protocol, through which a caller addresses an agent. **Documented upstream:** kagent's bring-your-own contract serves it over gRPC. **Observed in the demo:** every agent, the kagent one included, was called over JSON-RPC through the gateway. |
| A2UI | An extension to A2A that carries user-interface messages in a data part, so that an agent can draw and update a surface in the client. The demo's chat assistant uses version 0.9.1 for the incident card. |
| Actor | Agent Substrate's sandboxed unit of compute that runs a session's conversation. |
| ADR | Architecture decision record. Written only when a decision is made. |
| Agent (kagent) | A pairing of one AgentTemplate with one Harness. |
| AgentTemplate | kagent resource that defines what an agent does: model, system prompt and tools. |
| Binding | Environment-specific configuration that connects a component to an endpoint, identity, tool, model or data store. |
| Candidate (release) | A release-specific copy of a workload or route, deployed beside the active one to test a higher-impact change before activation. |
| CEL | Common Expression Language. Agentgateway uses it for authorization rules. |
| Drill | One of the demo's nine short scripts that try something on the running cluster, print each attempt and the result, and put back what they changed. For example, a direct call to a tool server around the gateway. |
| GatewayClass | Gateway API resource that names the controller responsible for a Gateway. |
| Harness | kagent resource that defines how an agent is allowed to run: runtime, image, environment and Substrate policy. |
| Incident card | The demo's shared view of one incident in the Chat UI: summary, status, the five steps of a change with each role's controls, the suspected cause, the evidence and a timeline. Code builds it from the incident's state; no model is involved. |
| MCP | Model Context Protocol, the protocol through which clients and agents discover and call tools. |
| MR | Merge request. |
| Per-tool rule | A gateway rule that says which callers may use which tool of an MCP server, written over verified token claims and the tool name. A tool the caller may not use is absent from the tool list, and a call to it is refused. |
| Profile | A reviewed default configuration for a supported runtime or gateway pattern. An example to copy, not a new API. |
| Revision | The compiled, immutable output of one kagent Agent, identified by a content digest. |
| Selection | The artifact digest and configuration that environment configuration names for one workload in one environment. A selection MR changes it; promotion selects the same artifact in the next environment. |
| Session | A running conversation with one Agent. |
| Stand-in | A component of the demo that takes the place of one the organization runs: Keycloak for Okta, Grafana with Prometheus, Loki, Tempo and Alertmanager for the operational backend, a local registry and task targets for ECR and CI, an endpoint on the presenter's machine for the model provider, and kind for the cluster. |
| Static consumer | A client or agent whose endpoints and content are resolved when it is configured or released, so it does not call the catalog per request. |
| Tenant | The boundary that data and permissions must not cross. Its meaning is not yet agreed. |
| Worker, WorkerPool | A pre-started sandboxed pod that hosts one actor at a time; a pool declares how many workers to keep and their sandbox class. |
| Workload key | A key the gateway issued to one workload, so that the workload is known to the gateway as itself and not as its caller. The gateway stores only the key's hash, the key opens one route, and it is not a provider key. In the demo the kagent agent has one. |

The four evidence labels (working assumption, documented upstream, observed in the demo, to validate) are defined on the [Agent platform proposal](00-proposal.md). The four component status labels (reused, new, optional, candidate) are defined on the [Architecture overview](10-architecture-overview.md). The identifiers WA-1 to WA-7 and D-1 to D-15 are listed on [Decisions, risks and requirements](31-decisions-and-risks.md).

## What these pages are based on

| Source | Date | Holds |
|---|---|---|
| Architecture document, version 0.1 | 5 October 2026 | One description of the EKS agent platform, with diagrams and the open questions in one place |
| Working notes | 5 October 2026 | The record the architecture document was written from: the EKS option, the AgentCore option, the comparison basis and the application conventions |
| The demo repository | 7 October 2026 | A kind cluster that runs one incident through Agentgateway, with its contracts, run of show, measurements and drills |

These sources are kept beside this page set and are not linked from it. When a source changes, the pages that rest on it change with it.

## Upstream documentation

Read on 5 October 2026. Statements marked **documented upstream** on other pages come from these pages and have not been tested by us, unless the page also says **observed in the demo**.

| Topic | Page |
|---|---|
| Agentgateway on Kubernetes, architecture | <https://agentgateway.dev/docs/kubernetes/latest/documentation/about/architecture/> |
| Agentgateway policy targeting and merging | <https://agentgateway.dev/docs/kubernetes/latest/documentation/about/policies/target-merge/> |
| Agentgateway Okta MCP authentication | <https://agentgateway.dev/docs/kubernetes/latest/documentation/mcp/auth/okta/> |
| Agentgateway MCP tool access | <https://agentgateway.dev/docs/kubernetes/latest/documentation/mcp/tool-access/> |
| Agentgateway stateful MCP | <https://agentgateway.dev/docs/kubernetes/latest/documentation/mcp/session/> |
| Agentgateway API keys | <https://agentgateway.dev/docs/kubernetes/latest/documentation/llm/api-keys/> |
| Agentgateway budget limits | <https://agentgateway.dev/docs/kubernetes/latest/documentation/llm/cost-controls/budget-limits/> |
| Agentgateway observability | <https://agentgateway.dev/docs/kubernetes/latest/documentation/observability/> |
| Agentgateway AgentCore connectivity | <https://agentgateway.dev/docs/standalone/latest/documentation/agent/agentcore/> |
| Istio Agentgateway integration | <https://istio.io/latest/docs/ambient/usage/agentgateway/> |
| kagent core concepts | <https://kagent.dev/docs/kagent/1.x/about/core-concepts/> |
| kagent architecture | <https://kagent.dev/docs/kagent/1.x/about/architecture/kagent/> |
| kagent bring your own agent | <https://kagent.dev/docs/kagent/1.x/agents/bring-your-own-agent/> |
| kagent Agent Substrate tuning | <https://kagent.dev/docs/kagent/1.x/operations/tune-agent-substrate/> |
| kagent networking and egress control | <https://kagent.dev/docs/kagent/1.x/substrate-runtime/networking-and-egress/> |
| kagent Substrate identity | <https://kagent.dev/docs/kagent/1.x/substrate-runtime/identity/> |
| Agentregistry | <https://github.com/agentregistry-dev/agentregistry> |
| Agentregistry kagent deployment | <https://aregistry.ai/docs/agents/deploy/kagent/> |

## What the upstream documentation adds to the design

Checking the documentation confirmed the constraints the working notes record. It also surfaced the points below. Each is **documented upstream** and untested by us.

| Point | Effect on the design |
|---|---|
| An Agent Substrate worker hosts at most one actor at a time and is freed at every turn boundary | The isolation test is about residue between successive actors on a reused worker, not about actors sharing a worker. See [Identity and authorization](11-identity-and-authorization.md) |
| Actors reach the network only through Substrate's own default-deny egress gateway, with an allowlist that kagent derives from the AgentTemplate | An additional control on two bypass paths for kagent workloads, and a second hop between an actor and Agentgateway. See [Trust boundaries and bypass prevention](12-trust-boundaries.md) |
| Nodes fetch sandbox runtime assets from a public Google Cloud Storage URL unless the configuration points at a hosted copy | An egress requirement, or a mirror to operate, for any cluster with restricted egress |
| A kagent Session is not a Kubernetes resource. It is created over gRPC under kagent's own authentication and authorization, and tracked in PostgreSQL | Kyverno and Kubernetes RBAC do not govern session access; decision D-5 must cover kagent's API |
| A development installation of Substrate stores snapshots in an in-cluster object store with well-known credentials, and is not durable | A pilot that tests restore must not run on the development defaults |
| The budget example keys its limit on a request header | Keying on a verified claim must be confirmed before budgets count as attributed to identity |
| The budget page does not say what happens when the rate-limit server is unavailable | Decision D-6 cannot be closed from documentation; it needs the experiment |
| All MCP tool access is allowed until rules are defined on a backend | A new MCP backend needs its rules before it is exposed |
| Stateful MCP session routing needs selector-based backend targets, not static ones | A constraint on how MCP servers are bound if sessions are stateful. See [Repositories, delivery and rollback](13-repositories-and-delivery.md) |
| Istio registers two GatewayClasses for its Agentgateway integration and applies none of its own configuration APIs to that proxy | Supports WA-1, the standalone controller |
| Versions documented on 5 October 2026: Agentgateway 1.6.x, kagent 1.0 alpha with `v1alpha3` resources, Istio 1.31.1 | Starting point for the compatibility inventory on the [Pilot plan](30-pilot-plan.md) |

What the demo saw on some of these points is on [Demo findings and limits](21-demo-findings.md).

## Versions the demo ran

Read from the demo repository on 7 October 2026. The third column is the file that pins the version, relative to the repository root; `platform/` and `workloads/` are under `agent-deployments/clusters/dev/`. These versions ran together on one kind cluster. That is an observation about this combination on kind, and it pins nothing for the pilot.

| Component | Version | Pinned in |
|---|---|---|
| Kubernetes | 1.37.0, kind node image pinned by digest, with the `certificates.k8s.io/v1beta1` API enabled | `local/kind/cluster.yaml` |
| kind | 0.33.0 | `mise.toml` |
| kubectl, Helm, Helmfile, Task | 1.37.1, 3.19.0, 1.8.1, 3.54.0 | `mise.toml` |
| Gateway API | 1.6.0, standard channel | `platform/10-agentgateway/helmfile.yaml` |
| Agentgateway, custom resources and controller | 1.6.0 | `platform/10-agentgateway/helmfile.yaml` |
| Keycloak | 26.7.5 | `local/identity/keycloak/Chart.yaml` |
| kube-prometheus-stack chart | 75.6.1 | `platform/40-observability/helmfile.yaml` |
| Loki chart | 6.24.0 | `platform/40-observability/helmfile.yaml` |
| Tempo chart | 1.16.0 | `platform/40-observability/helmfile.yaml` |
| OpenTelemetry Collector chart | 0.127.2 | `platform/40-observability/helmfile.yaml` |
| Langfuse | 4.46.0, chart 2.1.3 | `platform/50-langfuse/helmfile.yaml` |
| ClickHouse, for Langfuse | 26.4 | `platform/50-langfuse/clickhouse.yaml` |
| kagent, custom resources and controller | 1.0.0-alpha7 | `platform/60-kagent/helmfile.yaml` |
| Agent Substrate | 0.3.0-alpha3 | `platform/60-kagent/helmfile.yaml` |
| kagent-tools, the diagnosis agent's own instance | 0.3.0 | `workloads/diagnosis-agent/helmfile.yaml` |
| Agentregistry chart | 0.4.0 | `platform/70-agentregistry/helmfile.yaml` |
| Kyverno | 1.19.1, chart 3.9.1 | `platform/80-policies/helmfile.yaml` |
| Grafana MCP server, as `observability-mcp` | 2.0.1 | `workloads/observability-mcp/values.yaml` |
| FastMCP, in `delivery-mcp` | 3.4.8, on Python 3.13 | `components/delivery-mcp/pyproject.toml` |
| kmcp, which scaffolded `delivery-mcp` | 0.4.0 | `components/delivery-mcp/Taskfile.yml` |
| Strands Agents, in `remediation-agent` and `comms-agent` | 1.58.0 | Each component's `pyproject.toml` |
| Mastra, in `chat-assistant` | `@mastra/core` 1.74.0 | `components/chat-assistant/packages/server/package.json` |
| A2A JavaScript SDK | 1.3.0 | `components/chat-assistant/packages/server/package.json` |
| A2UI | `@a2ui/react` 0.12.0; the server speaks extension version 0.9.1 | `components/chat-assistant/packages/ui/package.json`; the extension version is named in the server's source |

The demo's own components and the approved models:

| Item | Value | Set in |
|---|---|---|
| `chat-assistant` | 0.1.9 | `workloads/chat-assistant/values.yaml` |
| `delivery-mcp`, `remediation-agent`, `comms-agent` | 0.1.1 | Each workload's `values.yaml` |
| `search-service` | 2.0.0 selected; 2.1.0 is the release that breaks search | `workloads/sample-app/values.yaml` |
| Approved model IDs | `claude-sonnet-5-5` and `claude-haiku-4-5-20251001`; the gateway refuses any other model | `platform/30-model-route/model-provider.yaml` |

Not listed, because the demo's files do not state them in one place: the versions of Grafana, Prometheus and Alertmanager inside the kube-prometheus-stack chart, and the PostgreSQL version behind Langfuse.

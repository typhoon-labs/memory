# Problem, goals and scope

| | |
|---|---|
| Status | Proposed. Nothing is selected or deployed, and there are no pilot results. |
| Updated | 7 October 2026 |
| Based on | Architecture document 0.1 (5 October 2026), sections 2 and 3 |
| Parent | [Agent platform proposal](00-proposal.md) |

Developers have no repeatable way to find approved tools and models, sign in to them, diagnose a failure or publish a service integration. This proposal answers with three workflows on the EKS infrastructure we already run: governed access for the clients people already use, publication by service teams, and hosted agents where a component needs one. The first two need no hosted execution, so a team can get value without deploying an agent. This page states the problems, the goals the design is judged by, what is reused and what is left for later.

## The problems

- **Developers** have no repeatable way to find approved capabilities, authenticate to them, diagnose a failure or publish a service integration.
- **Service teams** should own their APIs, tool contracts and guidance without owning every agent that consumes them.
- **Agent teams** that need a hosted agent should get supported execution and persistence, not infrastructure assembled one agent at a time.

Success means useful developer workflows, authorization that can be demonstrated, bounded operational impact and a favorable total cost. Knowing EKS may shorten the learning curve. It does not establish runtime reliability or isolation.

## The three workflows

| Workflow | The developer changes | The platform provides |
|---|---|---|
| Consume tools or models from an existing client | Client connection settings, and an access request where needed | Supported endpoints, Okta integration, permissions and diagnostics |
| Publish a service capability | The existing service repository: an MCP adapter or service guidance | Packaging, discovery, gateway integration and optional hosting |
| Run a hosted agent | The agent implementation or native declarative configuration | A supported execution profile, identity, telemetry and deployment conventions |

Hosted execution is not required for the first two. A service can publish only skills and prompts, or register a tool service that already runs. Agent teams decide when to adopt published content. The paths behind each workflow are on [Building on the platform](14-building-on-the-platform.md).

## Initial scope

The first deliverable is small on purpose: one existing developer client, one useful read-only service capability, one approved model, and a debugging path that works for an ordinary developer. Content publication and one representative hosted workload follow. The order and the conditions for stopping are on the [Pilot plan](30-pilot-plan.md).

## Goals

The goals are the ten criteria of the scorecard this option shares with AgentCore, described on [Options and how they are compared](02-options-and-comparison.md). The table shows what the design does about each one and where to read more.

| Criterion | Design response | Read more |
|---|---|---|
| Developer value | Existing clients first; three short workflows; a catalog that is not needed per call | [Building on the platform](14-building-on-the-platform.md) |
| Delivery effort | Reuse of existing services; native component APIs; no universal deployment language | [Architecture overview](10-architecture-overview.md) |
| Team autonomy | Guidance published without compute; consumers pin versions and adopt on their own schedule | [Building on the platform](14-building-on-the-platform.md) |
| Security | Okta-verified identity at every entry; exact entitlements; denied bypass paths; business authorization downstream | [Identity and authorization](11-identity-and-authorization.md), [Trust boundaries and bypass prevention](12-trust-boundaries.md) |
| Release safety | Immutable artifacts; selection by merge request (MR); checks proportional to the change; two defined recovery paths | [Repositories, delivery and rollback](13-repositories-and-delivery.md) |
| Reliability | A reliable baseline for the gateway and persistent services; disruption and restore drills | [Architecture overview](10-architecture-overview.md) |
| Debugging | One trace from client to service, readable with normal team access | [Observability and operations](15-observability-and-operations.md) |
| Operational burden | A named owner per component; pinned and tested version combinations | [Observability and operations](15-observability-and-operations.md) |
| Cost and performance | Incremental and allocated cost reported side by side; spending controls at the gateway | [Cost model](16-cost-model.md) |
| Portability | Protocols as the contracts (MCP, A2A, OTLP); application packages meant to run under either option | [Options and how they are compared](02-options-and-comparison.md) |

No threshold is agreed for any criterion. Until one is, an experiment produces an observation and not a pass.

## Deferred

The design leaves these out until measurements justify them:

- A universal deployment language.
- A custom promotion service.
- A mandatory catalog approval state machine.
- Additional portals.
- Self-hosted model inference.
- More than one AI engineering backend.
- Automated rollback triggered by quality scores.

## Proposed roles

These are roles, not assigned people.

| Role | Owns | Does not own |
|---|---|---|
| Platform team | Agentgateway, mandatory gateway restrictions, charts, profiles, CI/CD components, capacity conventions | Component behavior, business authorization |
| Identity team | Okta authorization servers, the claims contract, how entitlement removal takes effect | Tool business rules |
| Security | Review of expanded access, verification of bypass controls, data classification | Day-to-day releases |
| Service teams | APIs, MCP adapters, tool contracts, guidance bundles, business authorization | The agents that consume them |
| Agent teams | Agent behavior, scenarios, content pins, tool selection | Backend rights; they cannot grant these to themselves |
| Observability team | Collectors, vendor export, the telemetry backend | Component instrumentation |
| Runtime owner, if kagent is adopted | kagent, Agent Substrate, worker pools, snapshots | Agent behavior |
| Decision owner | Pilot duration, review date, stop conditions, the architecture decision record (ADR) | |

## What we reuse

Reuse comes before replacement. The versions, topology, capacity, licensing and configuration of these capabilities have not been inspected, so every row is **to validate** in the inventory step of the pilot.

| Existing capability | Role in this platform | Verify before depending on it |
|---|---|---|
| EKS | Hosts Agentgateway and optional hosted workloads | Kubernetes version, capacity, tenancy and lifecycle |
| Istio | Service networking between workloads | Mode, controller ownership and supported traffic paths |
| Kyverno | Admission restrictions | Enforced rules and permitted exceptions |
| Karpenter | Node provisioning | Compatible pools, disruption behavior and capacity limits |
| CloudNativePG | PostgreSQL for registry, runtime and application state | Privileges, extensions, high availability, backup and connection limits |
| OpenTelemetry | Telemetry collection and export | Authentication, queues, signal coverage and vendor ingestion |
| Helm and Helmfile | Component and environment selection | Chart pinning, dependency order, diff and recovery |
| Terraform, OpenTofu, Terragrunt | AWS additions | Existing state ownership and version compatibility |
| Okta | Corporate authentication | Authorization servers, clients, grants, claims and licensing |
| GitLab.com Ultimate | Source control, MR review and CI/CD on self-hosted runners in the EKS cluster | Runner namespace and node pool, what job pods can reach and assume, how images are built without privileged pods, federated identity to AWS and the cluster |
| ECR | Container images and Helm charts as OCI artifacts; content bundles | Tag immutability, lifecycle rules, scanning and cross-account pulls |

The additions are few. Agentgateway is the proposed connectivity layer and the only new component every workflow needs. Agentregistry is an optional catalog, kagent with Agent Substrate is a candidate runtime that its own project labels alpha, and Langfuse is optional. Each has an adoption condition on the [Architecture overview](10-architecture-overview.md).

The demo did not verify any row of this table. It ran on a kind cluster with stand-ins for Okta, the telemetry backend, ECR, CI and the model provider, as listed on [The demo: one incident, end to end](20-demo-one-incident.md).

## What the inventory must still identify

The supplied environment list does not name these. The delivery, identity and bypass designs depend on them, so the inventory records them first.

| Not yet identified | Needed for | Record |
|---|---|---|
| Object storage | Packages, artifacts and runtime snapshots | Buckets, encryption, access model and lifecycle rules |
| Secret delivery mechanism | Provider keys, database and vendor credentials | Product, rotation behavior and workload integration |
| Network policy enforcement | Bypass prevention and egress restriction | Policy engine, default-deny posture and who can change policy |
| Operational telemetry backend | Debugging and release verification | New Relic or Dynatrace |
| Model providers | Model access through the gateway | Providers, accounts, regions, private connectivity and credential type |

## Working assumptions and open forks

Where the working notes leave a fork open, the design makes a choice so that the rest can be concrete. There are seven such working assumptions, WA-1 to WA-7. Three shape most of the design: Agentgateway runs under its own controller and is not managed by Istio (WA-1), a hosted agent is a conventional Deployment or Job by default (WA-2), and Agentregistry, if adopted, is a catalog that writes no production object (WA-3).

Four forks carry no assumption, because nothing favors one side yet: the credential a model request carries, the entry point for hosted agents, what happens to model traffic when the rate-limit server is down, and which controls deny each bypass path.

All seven assumptions, the fifteen open decisions and the requirement values still to agree are listed on [Decisions, risks and requirements](31-decisions-and-risks.md).

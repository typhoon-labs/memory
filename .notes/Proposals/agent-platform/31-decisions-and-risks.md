# Decisions, risks and requirements

| | |
|---|---|
| Status | Proposed. Nothing is selected or deployed, and there are no pilot results. |
| Updated | 7 October 2026 |
| Based on | Architecture document 0.1 (5 October 2026), sections 3.3 and 16; the demo as of 7 October 2026 |
| Parent | [Agent platform proposal](00-proposal.md) |

This page is the register of what is still open: seven working assumptions, fifteen decisions, thirteen risks, five topics the design does not cover yet, and eleven requirement values nobody has agreed. Each open decision names the evidence that closes it and a proposed owner. Owners are proposed roles, not assigned people.

The last column of the first two tables says what the demo observed. An observation on a kind cluster with stand-ins closes nothing. It says where the pilot can start. Detail is on [Demo findings and limits](21-demo-findings.md).

## Working assumptions

A working assumption is a choice these pages make where the notes leave a fork open, so that the rest of the design can be concrete. Each one has an open decision below.

| ID | Working assumption | Reason | Closed by | Observed in the demo |
|---|---|---|---|---|
| WA-1 | Agentgateway runs under its own controller and the `agentgateway` GatewayClass. It is not managed by Istio. | Istio labels its Agentgateway integration experimental and for evaluation only, and Istio's own policy APIs are not applied to that proxy. | D-1 | Ran this way, version 1.6.0. No Istio in the cluster. |
| WA-2 | A hosted agent is a conventional Deployment or Job by default. kagent with Agent Substrate is a candidate track. | kagent 1.0 is alpha, and its bring-your-own contract excludes some adapters. | D-2 | Three agents ran as Deployments and one on kagent. |
| WA-3 | Agentregistry, if adopted, is a catalog. It writes no production object. | One writer per object. | D-3 | Ran as a catalog with no cluster credentials. |
| WA-4 | The pilot starts with one gateway endpoint in dev for one domain. Gateways are split later along permission and failure boundaries. | The initial scope is one client, one read-only capability and one model. | Pilot step 2 | One gateway, one domain, one environment. |
| WA-5 | Pinned guidance and prompts are baked into the consumer's image at build time. | The bytes that were evaluated are the bytes that run. | D-12 | Not tested. The kagent agent's runbook is put into its prompt at deployment. |
| WA-6 | Langfuse is not deployed in the initial pilot. | It adds PostgreSQL, ClickHouse, a cache, blob storage and worker services. | D-13 | Differs: Langfuse was deployed. |
| WA-7 | Diagrams show one environment. Whether dev, stage and prod share a cluster is unknown. | The notes reuse the current environment and account model without describing it. | Inventory | One kind cluster, `dev` only. |

Four forks carry no assumption, because nothing in the notes or the upstream documentation favors one side: the credential a model request carries (D-4), the entry point for hosted agents (D-5), whether model traffic is refused or allowed when the rate-limit server is down (D-6), and which controls deny each bypass path (D-7).

## Open decisions

| ID | Decision | Current position | Evidence that closes it | Proposed owner | Observed in the demo |
|---|---|---|---|---|---|
| D-1 | Standalone or Istio-managed gateway controller | Standalone (WA-1) | Compatibility inventory; gateway-to-backend identity shown in the cluster's Istio mode | Platform | The standalone controller ran. Gateway-to-backend identity in a mesh was not exercised. |
| D-2 | Whether kagent and Agent Substrate are adopted | Candidate; conventional default (WA-2) | kagent integration, bring-your-own contract, worker interruption and restore experiments | Runtime owner, agent and security teams | One declarative agent ran on 1.0.0-alpha7. Alpha limits were found, and one diagnosis in three runs was refused. No bring-your-own image, interruption or restore was tested. |
| D-3 | Role of Agentregistry | Catalog only (WA-3) | Registry and runtime compatibility; no duplicate writer; onboarding effort reduced | Platform | Catalog only. Scaled to zero, tools and agents still answered. Onboarding effort was not measured. |
| D-4 | Credential on a model request: gateway-issued key or Okta-derived token | Open | Model access experiment for each supported client; revocation time for either credential | Platform, security | Both ran: an identity provider token for people and the alert, a gateway-issued key for the kagent workload. Revocation time was not measured. |
| D-5 | Hosted agent entry point: gateway route or runtime API, and who binds user to session | Open | Concurrent session access; unauthenticated and wrong-user requests fail at every exposed address | Runtime, identity | Callers entered every agent through a gateway route. kagent verifies no token itself, so its route, the sign-in proxy of its console and network policies guard it. The console is a second way in, for the platform engineer only. kagent scopes a conversation to its creator; binding an Okta user to a session was not exercised. |
| D-6 | Shared token budgets, and behavior when the rate-limit server is down | Open | Shared token budget experiment, including the server unavailable | Platform | Not exercised. No rate-limit server was installed. |
| D-7 | Which control denies each bypass path | Candidates listed, none selected | Denied-path result per row | Platform, security | Five bypasses worked before controls existed. A default-deny network boundary and four Kyverno admission policies closed them on kind, with written gaps. The CI job pod path was not exercised. |
| D-8 | Operational telemetry backend | New Relic or Dynatrace | Injected-failure debugging in the chosen backend | Observability | Not exercised. Grafana with Prometheus, Loki and Tempo stood in. |
| D-9 | Secret delivery mechanism and network policy engine | Not identified | Inventory; secret rotation and inspection | Platform, security | Not exercised. Secrets were created by tasks, and kind's network plugin enforced the policies. |
| D-10 | Execution trust: is gVisor sufficient for hosted workloads? | Open | Requirement agreed; actor-level boundary tests | Agent and security teams | Not exercised. |
| D-11 | Session behavior across a rollout: pinned, drain or restart | Open | Observed session behavior on switch, rollback and retirement | Agent and runtime owners | Not exercised. |
| D-12 | Guidance baked into the image or loaded at start | Baked (WA-5) | For loading: integrity check, start-up failure behavior and caching shown | Platform | Neither was tested. kagent 1.0.0-alpha7 could not load a skill from git. |
| D-13 | Langfuse, and the authority for deployed prompts | Not in the pilot (WA-6) | A team needs the workflow; one publication authority defined | Platform, agent teams | Deployed for tracing only: model calls by verified user or workload, with tokens and cost. Its ClickHouse failed once. Prompt management was not used. |
| D-14 | Tenant meaning, delegation types, mandatory approvals, whether stage is required for every change | Not agreed | Requirement values recorded in the comparison basis | Security, identity, release owners | Not informative. The demo has roles and a team claim, and one refusal by team. |
| D-15 | Environment topology: shared cluster or one per environment, and where runners live | Not inventoried (WA-7) | Inventory | Platform | Not informative. |

## Risks

| Risk | Consequence | Response in the design |
|---|---|---|
| kagent 1.0 is alpha | Resource model and behavior may change; no support path | Conventional path is the default (WA-2); one pinned generation; excluded from any production recommendation if still alpha at the review date |
| Istio's Agentgateway integration is experimental | Unsuitable for production | Standalone controller (WA-1) |
| The gateway can be bypassed | It becomes a convenience, not a control | Candidate controls and denied-path checks for five paths, on [Trust boundaries and bypass prevention](12-trust-boundaries.md) |
| A more specific policy overrides a platform rule | Mandatory restrictions weaken silently | RBAC on policy resources, Kyverno on permitted fields, override tests |
| The gateway is a single point of failure for tools and models | An outage stops every consumer | Baseline replicas; the gateway outage experiment |
| The rate-limit server is an availability dependency | Model traffic is refused, or budgets stop holding | Fail behavior decided and tested (D-6) |
| A long-lived gateway key outlives an entitlement | Access continues after removal | Mapping to Okta identity, rotation and revocation defined; time to denial measured |
| The pilot agent does not meet kagent's bring-your-own contract | One image cannot run on both execution paths | Contract checked first; adaptation recorded as delivery effort |
| gVisor is the only isolation available through kagent | It may not meet the execution-trust requirement | Decided before density is tested (D-10) |
| CI runners share the cluster | MR code runs inside the network; a cluster fault takes the pipeline down | Runners treated as untrusted workloads; an emergency path that works without them |
| The registry becomes a second writer | Two sources of production truth | Catalog only (WA-3) |
| Cost is unpriced | Totals cannot be compared with AgentCore | Price the shared profile, then measure |
| Requirement values are not agreed | Experiments produce observations, not passes | Pilot duration, review date and stop conditions agreed in step 1 |

Three of these risks were seen in the demo and are no longer only predictions:

- **Bypass and override.** Both happened on Agentgateway 1.6.0 before controls existed. One override depended on which of two policies was older, so it stayed hidden until the platform's policy was recreated.
- **The long-lived key.** The kagent workload holds a fixed key, because that runtime can attach nothing that expires. It opens one route, names one workload and is revoked by deleting one object, but the demo does not rotate it.
- **Alpha behavior.** kagent needed workarounds for skills, token verification and egress, and refused one diagnosis in three runs.

## Topics the design does not cover yet

An architecture review is likely to ask about these. They are gaps, not design.

- Behavior when Okta or its signing keys are unreachable.
- Multi-region operation and disaster recovery.
- How many gateways exist, and how domains share or split them beyond the pilot.
- Content safety and guardrail policy at the gateway.
- The format of the entitlement configuration, and how it becomes Okta claims.

The demo adds two questions of its own: what a denied tool call should return, since a caller cannot tell it from a missing tool, and whether a rollback driven through a tool is a recovery path of its own.

## Requirements to agree

No requirement value is agreed. Values that also apply to AgentCore are agreed once and carried into both plans unchanged, as [Options and how they are compared](02-options-and-comparison.md) describes. An experiment can produce observations before its value is agreed, but it cannot be declared a pass.

| Requirement | Needed before | Proposed owner to agree |
|---|---|---|
| Pilot duration, review date and stop conditions | Step 1 | Decision owner |
| Initial developer clients and useful service | Step 2 | Platform and service teams |
| Model providers and approved models | Step 2 | Platform and security teams |
| Operational telemetry backend | Step 2 | Observability team |
| Tenant meaning, data classification and retention | Step 2 | Security and data owners |
| User delegation versus autonomous work | Step 2 | Identity and service teams |
| Hosted workload and execution trust | Step 4 | Agent and security teams |
| Traffic, concurrency and latency | Step 4 | Agent and platform teams |
| Availability, recovery and rollback window | Step 5 | Platform and service teams |
| Mandatory review and audit retention | Step 5 | Release owners and security |
| Cloud and operating-effort budget | Step 5 | Platform and budget owners |

The steps, the stop conditions and the experiments are on [Pilot plan](30-pilot-plan.md).

## What closes this page

Before a selection, the pilot produces a tested connection matrix, a configuration authority map, a successful developer journey, a compatibility inventory, a recovery demonstration and a measured cost and effort comparison. Unresolved gaps are recorded beside successful results. The decision is then written as an architecture decision record: selection, deferral or rejection.

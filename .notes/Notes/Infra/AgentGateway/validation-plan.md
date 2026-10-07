# EKS agent platform validation plan

Status: Proposed experiments. Updated 5 October 2026. No results recorded and no solution selected. [Notes index and terms](README.md)

The pilot determines whether governed connectivity and EKS execution meet developer and operational needs better than alternatives. Begin with a thin useful workflow and add components only when they solve an observed requirement. Tests below have proposed owners, not assigned people.

## Requirements to agree

| Requirement | Current value | Used to assess | Proposed owner to agree | Needed before |
|---|---|---|---|---|
| Pilot duration, review date and stop conditions | Not agreed | Whether the pilot continues, narrows or ends | Decision owner | Step 1 |
| Initial developer clients and useful service | Not selected | Tool access and onboarding | Platform and service teams | Step 2 |
| Model providers and approved models | Not selected | Model access, credential custody and budgets | Platform and security teams | Step 2 |
| Operational telemetry backend | Not selected (New Relic or Dynatrace) | Trace continuity and telemetry cost | Observability team | Step 2 |
| Tenant meaning, data classification and retention | Not agreed | Identity, storage and telemetry | Security and data owners | Step 2 |
| User delegation versus autonomous work | Not agreed | Credential flow and permissions | Identity and service teams | Step 2 |
| Hosted workload and execution trust | Not selected | Conventional runtime versus sandbox | Agent and security teams | Step 4 |
| Traffic, concurrency and latency | Not agreed | Warm capacity and scaling | Agent and platform teams | Step 4 |
| Availability, recovery and rollback window | Not agreed | Failure drills and retention | Platform and service teams | Step 5 |
| Mandatory review and audit retention | Not agreed | Delivery gates and evidence | Release owners and security | Step 5 |
| Cloud and operating-effort budget | Not agreed | Total cost and maintenance | Platform and budget owners | Step 5 |

Owners are proposed roles. Values that also apply to the AgentCore option are agreed once in the [comparison basis](../README.md) and carried here unchanged. An experiment can produce observations before its threshold is agreed, but cannot be declared a pass. Record real users' setup/debugging experience, not only administrator success.

## Pilot bounds

The pilot has no agreed duration. Agree a duration and a review date during the inventory step, so that a missing threshold shows up as a blocked step rather than an open-ended pilot. The stop conditions below are proposals to confirm with the same owner. Meeting one narrows or ends the option; it does not extend the pilot.

| Observation | Proposed consequence |
|---|---|
| The selected client cannot complete Okta authentication through the gateway in a supported configuration | Stop before hosted execution; record the client and the gap |
| Direct calls to a backend or model provider cannot be blocked or equivalently governed with the cluster's controls | Do not offer that path as governed; narrow the scope or reject |
| A required component is still alpha or experimental at the review date with no acceptable support path | Exclude it from any production recommendation; keep the conventional path |
| A requirement needed for the next step is still not agreed at the review date | Pause that step and report observations only |
| Measured operating effort exceeds the agreed budget with no identified reduction | Compare a smaller scope or a managed alternative before continuing |

## Pilot sequence

1. **Inventory:** record existing cluster versions, controllers, the GitLab runner namespace and node pool, delivery authority, identity/secret mechanisms, network policy enforcement and available capacity, including the dependencies the supplied list omits (see [foundation](foundation-and-services.md#existing-infrastructure-and-additions)).
2. **Useful access:** connect one actual client through Okta to one read-only internal capability and one approved model; demonstrate permitted and denied calls and debugging.
3. **Publication:** let the service owner publish guidance and discoverable metadata independently of compute.
4. **Hosted execution:** run the same representative agent in a conventional EKS application and the selected kagent/Substrate profile where requirements permit. Check the agent against kagent's [bring-your-own contract](workload-deployment.md#execution-choices) first; where it cannot run unchanged on both, record the adaptation as delivery effort.
5. **Recovery and economics:** introduce realistic failures, record state recovery and cost/maintenance measurements.
6. **Comparison:** evaluate AgentCore against equivalent permissions, models, inputs and success criteria on the [comparison basis](../README.md); document adoption conditions or rejection in an ADR.

Existing-client access is a scope reduction, not a full substitute for a workload that requires hosted execution. Report those comparisons separately. Hybrid adoption is an optional outcome if a managed capability removes disproportionate operating work; one experiment below tests whether it is practical.

## Experiments and expected evidence

| Experiment | Evidence needed | Proposed owner | Failure would mean |
|---|---|---|---|
| Actual IDE/client authenticates | Discovery, refresh, redirect and deny behavior | Identity/platform | The client fleet needs a different authentication path or a client change |
| Model access through the gateway | Client and agent reach an approved model with a gateway-issued or Okta-derived credential; an unapproved model and a direct provider call are denied; usage is attributed to the verified caller | Platform/security | Model access is not governed, or provider keys would have to be distributed |
| Shared token budget | A budget keyed on verified identity holds across gateway replicas and concurrent requests; behavior with the rate-limit service unavailable is known | Platform | Spend limits are advisory, or need another control |
| Two tenants and machine caller | Verified principals and cross-tenant/user denial | Identity/service | Identity or authorization assumptions are insufficient |
| Attempt gateway bypass and policy override | Direct calls blocked/equivalently governed, including from a CI job pod; mandatory policy retained | Platform/security | The gateway is a convenience, not a control point |
| Publish existing service integration | Useful tool contract without unnecessary new hosting | Service/platform | Publishing needs more platform work than a service team can absorb |
| Publish guidance without compute | Immutable bundle and usable discovery; no runtime created | Service | Content publication is too coupled to workload deployment |
| Consumer adopts/rejects content | Explicit pin, integrity checks and relevant task results | Agent/service | Packaging or compatibility contracts need redesign |
| Conventional hosted agent | Task, shutdown, persistence and rollout behavior | Agent/platform | Even the familiar path needs custom platform work |
| kagent/Substrate integration | Supported resources, actual invocation, permissions and sessions | Runtime owner | Hosted execution stays on the conventional path |
| Registry/runtime compatibility | Pinned combination and deployment ownership; no duplicate writer | Platform | The registry is catalog-only, or is dropped |
| Worker/node interruption | Observed session loss/recovery and side-effect handling | Runtime/agent | Session durability does not hold; state or retries need redesign |
| Concurrent session access | Ownership and supported concurrency behavior | Runtime/identity | Session access needs another control in front of the runtime |
| Snapshot/database restore | Coherent usable session/state with measured recovery | Runtime/data | Backups exist but recovery is unproven |
| Secret rotation and inspection | A rotated credential is picked up as documented; no secret values in Terraform state, rendered manifests, Helm release data or CI logs | Platform/security | Secret delivery needs a different mechanism |
| Gateway outage | Known effect on clients, agents and in-flight sessions; recovery without manual repair | Platform | The gateway is a single point of failure that needs redesign or more capacity |
| Failed release and stale CI retry | Current selection protected and immutable artifact reused | Delivery owners | Release ownership or approval binding needs redesign |
| Roll back a release | Previous compatible behavior restored within the agreed window; sessions and state handled as defined | Delivery owners | Rollback is slower or less complete than the recovery target |
| Breaking MCP migration | Discovery, names, streaming, session drain/reconnect | Tool/platform | Versioned endpoints do not give a tested migration path |
| Credential expiry/revocation | Time to denial and no privileged fallback, for Okta tokens and any gateway-issued keys | Identity/service | Revocation is bounded only by token or key lifetime |
| Telemetry/registry outage | Bounded queues and known effect on static consumers | Observability/platform | A supporting service is a hidden runtime dependency |
| Injected-failure debugging | A developer with normal team access follows one trace from client through gateway, agent, tool and service in the chosen vendor backend and identifies each injected fault | Observability/agent | Debugging depends on cluster-admin access or on signals that are missing |
| Shared controller/CRD upgrade | Migration and recovery with existing data/consumers | Platform | Upgrades have an unbounded blast radius |
| AgentCore Runtime behind the gateway | One runtime invoked through an Agentgateway backend with the same identity, policy and telemetry as an EKS workload | Platform | Hybrid is not a low-effort outcome |
| Portability assessment | A written estimate, from the pilot artifacts, of the effort to move images, content, tool contracts, identity configuration and state to another option | Platform/agent | Lock-in is larger than assumed |
| Representative load and spend | Success, latency, node footprint, usage and support effort for the shared session profile | Agent/platform | Operational or cost fit needs changes or another option |

For sandbox tests inspect actor-level boundaries, not just pod policies. For transactions test idempotency and recovery separately from model quality. Evaluate rollback with retained dependencies and session/state compatibility.

## Compatibility inventory

Record Kubernetes/EKS version, Istio mode, chosen gateway controller/GatewayClass, Gateway API channel/version, Agentgateway chart/proxy/CRDs, the rate-limit server where shared budgets are used, kagent generation/API/CLI, Substrate worker/sandbox version, registry integration, database requirements and OTel instrumentations/exporters. Record each component's documented maturity beside its version; at the time of writing kagent 1.x is alpha and Istio's Agentgateway integration is experimental.

For each integration record source links, required schemas/permissions, actual result, limitations, configuration/source revision, reviewer and date. Check registry deployment documentation and other examples against the chosen kagent generation, as described in [workload deployment](workload-deployment.md#execution-choices). Do not treat two separately documented capabilities as proof they integrate.

## Scorecard evidence

The scorecard is shared with the AgentCore option and lives in the [comparison basis](../README.md#scorecard). This option supplies each criterion from the experiments above.

| Criterion | Evidence from this plan |
|---|---|
| Developer value | Setup time and first useful task from the client authentication and model access experiments; effort recorded in the two publication experiments |
| Delivery effort | Custom code, charts and services written before the first useful workload, from the compatibility inventory |
| Team autonomy | Publish guidance without compute; Consumer adopts/rejects content |
| Security | Two tenants and machine caller; bypass and policy override; concurrent session access; credential expiry/revocation; secret rotation and inspection |
| Release safety | Failed release and stale CI retry; Roll back a release; Breaking MCP migration |
| Reliability | Worker/node interruption; snapshot/database restore; gateway outage; telemetry/registry outage; task success under load |
| Debugging | Injected-failure debugging |
| Operational burden | Shared controller/CRD upgrade; added services, on-call ownership and support hours |
| Cost and performance | Representative load and spend; Shared token budget |
| Portability | Portability assessment |

Run options with the same model configuration, task set and comparable retained data. Include inference/evaluation usage and failures. Do not infer savings from gateway fees alone or density from snapshot support alone.

## Decision and documentation updates

Before selection, produce a tested connection matrix, configuration authority map, successful developer journey, compatibility inventory, recovery demonstration and measured cost/effort comparison. Record unresolved gaps beside successful results. Outcomes may be a smaller tool-access platform, conventional EKS execution, conditional kagent adoption, AgentCore, hybrid use, deferral or rejection.

Update these notes with verified examples and runbooks as experiments finish. Create an ADR only when a decision is made. Writing these notes neither deploys nor selects the platform.

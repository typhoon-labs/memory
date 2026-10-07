# AgentCore option questions and validation plan

Status: Proposed experiments. No pilot results recorded. Updated 5 October 2026.

The goal is to establish whether the architecture option meets our requirements before committing to a broad platform build. The named owners below are proposed roles, not assigned people. The comparison alternatives are suggestions for exploration, not selected implementations.

## Requirements to establish

Agree workload volume, latency targets, availability, recovery time, data classification, retention, regions, and the types of user delegation required. Establish a budget for inference, evaluations, tracing, gateways, and idle platform resources. Define which deployment and publication approvals are mandatory.

These inputs determine whether the option's account topology, gateway granularity, memory boundaries, and managed runtime choices are appropriate.

None of these has an agreed value yet. Record each value here before running the experiment that depends on it; an experiment whose threshold is not agreed can produce observations but not a pass.

| Requirement | Agreed value | Experiments that depend on it |
|---|---|---|
| Recovery time and rollback window | Not agreed | Roll back a complete release |
| Workload volume, latency and availability | Not agreed | Measure one representative workload |
| Budget for inference, evaluations, tracing, gateways and idle resources | Not agreed | Measure one representative workload; export telemetry to the chosen vendor |
| Data classification, retention and regions | Not agreed | Publish only skills and prompts; read and write memory across actors and tenants |
| Types of user delegation | Not agreed | Deny an unauthorized user and tenant |
| Mandatory deployment and publication approvals | Not agreed | Retry and restart the promotion pipeline; reject a new catalog publication |

## Open decisions

| Question | Proposed starting point | Evidence needed | Proposed owner |
|---|---|---|---|
| Harness or custom runtime for the pilot | Harness if it supports the required behavior | Tooling, prompt composition, identity, tracing, and rollback experiment | Agent team |
| User identity across tool calls | Verified user context on each delegated operation | Authentication matrix and end-to-end allow/deny results | Identity and service teams |
| Shared or workload-specific gateway | One pilot domain gateway | Change isolation, quotas, and failure impact | Platform team |
| MCP candidate activation | Isolated candidate gateway and controlled consumer switch | Protocol, session, tool-name, and rollback tests | Platform and tool teams |
| Shared catalog access | Shared approved registry with environment-local candidates | Cross-account registration, approval, and discovery tests | Platform team |
| Content distribution | Immutable S3 artifacts and consumer pins | Hash verification, cross-account access, and session behavior | Service and agent teams |
| Approval boundary | Deployment approval gates activation; catalog approval gates discovery | Rejection, retry, and stale approval tests | Release owners |
| Secrets provisioning | Write-only fields where verified; scoped secret lifecycle otherwise | Inspection of pinned provider read behavior and saved state | Platform and security teams |
| Shared memory | Per workload initially | Tenant/actor enforcement, deletion, retention, and compatibility | Agent and data owners |
| Provider coverage | Select exact versions after a small resource spike | Successful plans/applies and replacement behavior | Platform team |
| Primary observability backend | OpenTelemetry to New Relic or Dynatrace | Trace continuity, signal coverage, vendor limits and cost | Observability/platform teams |
| AWS evaluation telemetry alongside external export | Preserve a supported AWS span path where required | Successful evaluation with vendor export enabled and no duplicate instrumentation | Agent/platform teams |
| Managed harness telemetry export | Forward AWS-generated telemetry through supported integrations | Actual vendor visibility of model/tool/session spans | Observability/platform teams |
| Evidence scope across candidate and active bindings | Promote the gateway that was tested; declare isolation substitutes such as test memory | Activation that changes only declared bindings, with the policies that were evaluated | Release owners and platform team |
| Candidate and active state layout | Separate release units for candidate resources | Candidate apply and removal with no change planned on active units | Platform team |
| Registry namespace | Build on the `agent-registry` namespace from the start | Pinned provider creates registries and records there; approval and discovery work | Platform team |
| Catalog approval and activation order | Approve consumer-facing records only after release gates pass | No approved record advertises a candidate endpoint | Release owners |
| Catalog curator role | Platform team for the pilot | Approvals and rejections made by a named role with an audit record | Platform team and service owners |
| Evidence store and resolver ownership | Platform-owned; evidence store in shared services | Evidence that cannot be overwritten; resolver output reproducible for a platform pin | Platform team |
| Entitlement revocation latency | Bounded by token lifetime until measured | Time from entitlement removal to denial at each boundary | Identity team |
| Harness invocation overrides | Production callers cannot override skills, model or limits | Override attempts denied, or shown not to alter the approved release | Agent and platform teams |
| Script-bearing skills | Scripts reviewed as code at publication; consumers may reject them | Review record per script; script limited to the consumer role's approved permissions | Service, agent and security teams |
| Session handling on switch, rollback and retirement | Drain existing sessions before retiring a binding | Observed session behavior during each transition | Agent and tool teams |
| GitLab CI identity and approvals | ID token `sub` extended with protected ref and environment tier; trust conditioned on project ID and self-hosted runner; protected runners for apply jobs; protected environments with deployment approvals; Code Owners on protected branches | A non-production job is denied the production apply role; a job on an unprotected branch reaches neither an apply runner nor an apply role; the runner pod's own identity cannot deploy; the MR-proposal credential cannot merge or deploy | Platform and security teams |

## Authentication matrix to complete

Complete the connection matrix in the [identity design](identity-and-authorization.md#authentication-by-connection); it is the single list of connections. For each row, record credential type, audience, verified identity, policy decision, authorization owner, and bypass prevention as observed in the pilot.

Explicitly distinguish a calling workload from the user on whose behalf it acts. Document how tenant, actor, and session identifiers are derived and bound to that user. Test machine callers separately from user-delegated callers.

## Pilot experiments

| Experiment | Expected evidence | Failure would mean |
|---|---|---|
| Publish only skills and prompts from a service repo | Versioned artifacts and discoverable records without compute deployment | Content publication is too coupled to workload deployment |
| Adopt a service asset in one consumer | Pinned release passes consumer tests and operates against the service | Packaging or compatibility contracts need redesign |
| Deny an unauthorized user and tenant | Denials at intended boundaries, including direct invocation attempts | Identity or authorization assumptions are insufficient |
| Fail the candidate evaluation | Active code, content, targets, and workload policy behavior remain unchanged | Candidate deployment is not adequately isolated |
| Retry and restart the promotion pipeline | Approval applies only to the exact tested candidate; retries are safe | Release ownership or evidence binding needs redesign |
| Update shared gateway or baseline policy | Plans expose affected consumers and required review scope | Shared resource blast radius is poorly controlled |
| Roll back a complete release | Previous compatible behavior returns within the agreed recovery target | Endpoint rollback alone is insufficient |
| Reject a new catalog publication | Previous approved content remains usable and discoverable | Record lifecycle needs a different versioning approach |
| Remove or change a tool schema | Consumers either remain compatible or fail before promotion | Version contracts do not protect consumers |
| Measure one representative workload | Recorded latency, cost, trace volume, evaluation overhead, and failures | Operational fit needs changes or another option |
| Activate an MCP candidate | Consumers switch to the tested gateway; sessions, tool names and discovery behave as evaluated | Versioned gateway bindings do not give a tested activation path |
| Read and write memory across actors and tenants | Cross-actor and cross-tenant access denied; candidate writes absent from active memory | Memory isolation depends on unenforced conventions |
| Override skills or limits at invocation | Production callers cannot change approved release behavior | Approval evidence does not cover what actually runs |
| Inspect state and plans for secret material | No credential values in state, saved plans or CI artifacts | Secret provisioning needs a different mechanism |
| Export telemetry to the chosen vendor while running an AWS evaluation | Continuous trace in the vendor backend and a successful evaluation of the same sessions | External export and AWS evaluation cannot share one instrumentation path |
| Forward managed harness telemetry | Model, tool and session spans visible in the vendor backend | Harness workloads need a different observability path or a custom runtime |

Use test tenants and fixtures for destructive operations. Candidate evaluation must not create real production refunds or other unintended business effects. Test idempotency and cumulative limits independently of answer-quality scoring.

## Evaluation quality

Bind results to the release and environment configuration tested. Record dataset and evaluator versions, sample counts, model configuration, and uncertainty for quality metrics. Authorization and deterministic correctness checks should not depend on an LLM judge.

Define minimum sample counts and observation windows for online decisions. Treat low traffic, incomplete traces, evaluator errors, and delayed results explicitly. Retain only the sensitive trace content necessary for the agreed evaluation and audit purpose.

## Option comparison

Use the same requirements and pilot workload to compare this design against other options. Candidate comparisons include existing container hosting with a managed identity layer, and a narrower AgentCore adoption using only the capabilities we need first. The [comparison basis](../README.md) records what is shared with the [EKS agent platform option](../AgentGateway/README.md): requirement values, the pilot workload and session profile, the common experiments and one scorecard.

| Criterion | Question for each option |
|---|---|
| Security | Can we preserve user permissions and prove tenant isolation? |
| Release safety | Can candidate failure leave active behavior unchanged? |
| Team autonomy | Can a service publish content without owning consumers? |
| Operational burden | Who supports incidents, upgrades, and resource lifecycle? |
| Cost and performance | What does a representative session cost and how long does it take? |
| Portability | How difficult is migration of code, content, identity, and memory? |
| Delivery effort | What must we build before the first useful workload? |

## Decision evidence

Before selecting the option, produce a tested authentication matrix, a resource/state ownership map, a release manifest contract, evaluation results, a rollback demonstration, an observability coverage result, and a cost/performance estimate. Record limitations and unresolved risks alongside successful results.

The outcome can be adoption, adoption with conditions, a smaller AgentCore scope, deferral, or rejection. Record that outcome in an architecture decision record when it is made. No such selection is implied by the current documentation.

## Exploration phases

| Phase | Work | Exit evidence |
|---|---|---|
| Requirements and compatibility | Select service/consumer; confirm region and provider resources | Requirements, exact versions, and successful minimal resource spike |
| Foundation and identity | Bootstrap dev, implement scoped roles and claims | State recovery check and observed auth matrix |
| Content publishing | Publish skills/prompts without compute | Immutable artifacts, records, and cross-account read results |
| Consumer and tool integration | Deploy one candidate agent and required service/tool path | Task success, negative auth tests and complete traces |
| Release isolation | Exercise failed candidate, retries and concurrent promotions | Unchanged active behavior and safe restart evidence |
| Stage operations | Load, cost, monitoring and rollback drills | Measured limits, recovery result and assigned owners |
| Option review | Compare alternatives and remaining risks | Decision record with adoption conditions or rejection rationale |

These are evidence gates, not a committed delivery schedule. Staff effort and duration should be estimated after the first compatibility and identity experiments.

## Evidence inventory

Record provider/tool versions, account/region, source commit, test identity, configuration hashes, result location, measured outcome, limitations, reviewer and date for each experiment. No experiment is marked complete simply because its infrastructure applied successfully.

The provider inventory should include each planned resource, exact provider schema version, required fields, replacement behavior, import support, secret read/write behavior and demonstrated cross-account operations. Include registry records and approval ownership under the new registry namespace, runtime/harness activation fields, the runtime authorizer's `allowedWorkloadConfiguration`, gateway target modes, policy schemas, memory retention, and evaluation prerequisites.

The [worked examples](worked-examples.md) provide scenarios to turn into pilot exercises. Adjust them to the selected service and consumer without assuming their hypothetical versions or outcomes are real.

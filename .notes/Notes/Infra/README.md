# Agent platform options and comparison basis

Status: Proposed shared basis. Updated 5 October 2026. No values agreed and no results recorded.

Two options are being explored. Neither has been selected.

| Option | Notes | Summary |
|---|---|---|
| AgentCore | [AgentCore/](AgentCore/README.md) | AWS AgentCore managed through Terraform and Terragrunt |
| EKS agent platform | [AgentGateway/](AgentGateway/README.md) | Agentgateway and optional hosted execution on the existing EKS infrastructure |

Each option has its own validation plan. The rest of this page lists what must be identical across them so that results can be compared: requirement values, the pilot workload, a common set of experiments and one scorecard. Option-specific experiments stay in each plan.

Both options use GitLab.com Ultimate for source control and CI/CD, with self-hosted runners in the existing EKS cluster, and ECR for container images and Helm charts. Packages may use the GitLab package registry where only pipelines read them.

## Shared requirements

Agree each value once and record it here; both plans' requirement tables then carry the same value. A threshold agreed for one option only is not a basis for comparison.

| Requirement | Agreed value | AgentCore plan row | EKS plan row |
|---|---|---|---|
| Pilot service, consumer and developer clients | Not selected | Exploration phase "Requirements and compatibility" | Initial developer clients and useful service |
| Model providers, approved models and caching | Not selected | Assumed in its cost profile; not a plan row | Model providers and approved models |
| Operational telemetry backend | Not selected | Open decision "Primary observability backend" | Operational telemetry backend |
| Workload volume, concurrency and latency | Not agreed | Workload volume, latency and availability | Traffic, concurrency and latency |
| Availability, recovery time and rollback window | Not agreed | Recovery time and rollback window | Availability, recovery and rollback window |
| Tenant meaning, data classification, retention and regions | Not agreed | Data classification, retention and regions | Tenant meaning, data classification and retention |
| Types of user delegation | Not agreed | Types of user delegation | User delegation versus autonomous work |
| Mandatory approvals and audit retention | Not agreed | Mandatory deployment and publication approvals | Mandatory review and audit retention |
| Budget, including operating effort | Not agreed | Budget for inference, evaluations, tracing, gateways and idle resources | Cloud and operating-effort budget |
| Pilot duration, review date and stop conditions | Not agreed | Not stated; its phases are evidence gates without a schedule | Pilot duration, review date and stop conditions |
| Scorecard weights or must-pass criteria | Not agreed | Not stated | Not stated |

The two plans differ in scope today. The AgentCore budget row excludes operating effort, and its plan has no requirement row for model providers or pilot duration. Close those differences when the values are agreed.

## Shared pilot workload

Use one service, one consumer, one task set and one model configuration for both options.

Until the pilot measures a real profile, both cost pages price the session profile assumed in [AgentCore costs](AgentCore/costs.md#usage-cost-per-session):

| Input | Assumed value |
|---|---|
| Model calls per session | 6, at 8,000 input and 400 output tokens each |
| Gateway calls per session | 12 |
| Execution size | 1 vCPU and 1 GB peak, 20 seconds of active CPU |
| Session lifetime | 2 minutes of work, then a 15-minute idle timeout |
| Monthly volume | 5,000, 50,000 and 500,000 sessions |
| Environments | 3 |
| Evaluation | 20% of sessions |

Replace the profile for both options at the same time.

Cost status today: AgentCore has a priced inventory with illustrative totals. The [EKS cost page](AgentGateway/costs.md#comparable-scenario) lists the same lines but prices none of them. Do not compare totals until both are priced for this profile, and do not read the unpriced option as the cheaper one. Neither page estimates people; report hours for both.

## Common experiments

Both options run these. Each row names the experiment as it appears in each plan.

| Common experiment | AgentCore plan | EKS plan |
|---|---|---|
| Publish guidance without compute | Publish only skills and prompts from a service repo | Publish guidance without compute |
| Consumer adopts pinned content | Adopt a service asset in one consumer | Consumer adopts/rejects content |
| Deny an unauthorized user and tenant, including direct invocation | Deny an unauthorized user and tenant | Two tenants and machine caller; Attempt gateway bypass and policy override |
| Isolate state across users and tenants | Read and write memory across actors and tenants | Concurrent session access |
| Failed release leaves active behavior unchanged; retries are safe | Fail the candidate evaluation; Retry and restart the promotion pipeline | Failed release and stale CI retry |
| Roll back within the agreed recovery target | Roll back a complete release | Roll back a release |
| Change a tool contract incompatibly | Remove or change a tool schema; Activate an MCP candidate | Breaking MCP migration |
| Change a shared platform component | Update shared gateway or baseline policy | Shared controller/CRD upgrade |
| Keep secret values out of state, plans and CI | Inspect state and plans for secret material | Secret rotation and inspection |
| Follow one trace in the chosen vendor backend | Export telemetry to the chosen vendor while running an AWS evaluation | Injected-failure debugging |
| Measure time from entitlement removal to denial | Open decision "Entitlement revocation latency" | Credential expiry/revocation |
| Measure the shared workload | Measure one representative workload | Representative load and spend |

## Scorecard

One scorecard for both options. It is the union of the seven criteria in the AgentCore plan and the eight in the EKS plan.

| Criterion | Question for each option | Measurement |
|---|---|---|
| Developer value | How quickly does a developer get a useful result? | Setup time, time to first useful task, publication and adoption effort |
| Delivery effort | What must we build before the first useful workload? | Custom code, modules, charts and services written for the pilot |
| Team autonomy | Can a service publish content without owning consumers? | Publication with no compute and no consumer change |
| Security | Can we preserve user permissions and prove tenant isolation? | Observed identity and delegation at each hop; denied access cases |
| Release safety | Can a failed change leave active behavior unchanged? | Failed-release, retry and rollback results against the agreed window |
| Reliability | Does work complete through disruption? | Task success, disruption recovery and dependency-outage behavior |
| Debugging | Can the owning team find a fault without elevated access? | Time to identify injected failures with normal team access |
| Operational burden | Who supports incidents, upgrades and resource lifecycle? | Added services, upgrades performed, on-call ownership and support hours |
| Cost and performance | What does a successful task cost and how long does it take? | Incremental and allocated cost per successful task; latency for the shared profile |
| Portability | How difficult is migration to another option? | Estimated effort to move code, content, tool contracts, identity and state |

## Reading results

Run each common experiment with the same model configuration, task set, identities and retained data. Report a pass only against an agreed value above; otherwise report an observation. Record results in each option's plan and summarize both here before an architecture decision record is written.

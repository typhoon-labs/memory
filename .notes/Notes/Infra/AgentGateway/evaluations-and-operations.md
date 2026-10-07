# EKS agent platform evaluations and operations

Status: Proposed operating model. Updated 5 October 2026. [Notes index and terms](README.md)

Reuse OpenTelemetry and the existing New Relic or Dynatrace backend for operational debugging. Which of the two is the operational backend is not yet stated; it is a requirement to agree in the [validation plan](validation-plan.md), and the pilot runs against one. Add an AI engineering backend only when its prompt, dataset or evaluation workflows provide useful capability beyond those tools. Release quality checks and operational health have separate owners and acceptance criteria.

## Evaluation responsibilities

| Layer | Checks | Owner |
|---|---|---|
| Service assets | Accurate API guidance, variables, scripts and compatibility | Service team |
| MCP tools | Protocol/schema, backend permissions, idempotency and errors | Tool/service team |
| Agent behavior | Task outcome, selected tools, composed instructions and limits | Agent team |
| Shared platform | Auth, policy override, session isolation and deployment behavior | Platform/identity teams |

Start with component-owned scenarios and deterministic assertions in CI. Add quality judging when it measures a meaningful requirement. Record dataset/evaluator versions, sample counts, model settings, failures, latency and usage. Missing telemetry or evaluator errors do not count as passing outcomes.

Use fixtures and test tenants for operations with side effects. Evaluate the complete agent when it adopts content or tools; accurate publisher guidance alone cannot prove consumer behavior. Sample live quality according to volume, risk and cost. Automated quality-triggered rollback is deferred until attribution and false-positive behavior are demonstrated.

## Telemetry topology

Applications, tools and gateway export supported signals into the existing collector topology. Application instrumentation records model/tool calls, checkpoints and workflow outcomes; proxy telemetry alone cannot explain internal reasoning/action sequences. Propagate trace context across supported protocols and record release, environment and runtime identity.

Prove which spans/attributes each framework emits and normalize only where needed. Keep secret values and sensitive prompt/tool content out of telemetry by default. Source filtering is required when a separate exporter could bypass collector filtering. Bound queues, retry/export overhead and metric cardinality.

Langfuse accepts collector-exported OTel traces; filtering must preserve useful trace structure and the required root span. [Langfuse OTel integration](https://langfuse.com/integrations/native/opentelemetry)

If adopted, Langfuse supplies an AI engineering workflow while New Relic/Dynatrace remains the operational backend. Define one prompt publication authority and evaluation result owner. Do not deploy multiple AI engineering backends in the initial pilot. Its database/cache/object dependencies require their own availability and upgrade ownership, as described in [foundation](foundation-and-services.md).

## Developer debugging

Every supported template should make service/version identity and request correlation visible. A developer follows a request from the client through gateway auth/routing, agent execution, tool dispatch and service result.

| Symptom | First evidence to inspect | Owner |
|---|---|---|
| Authentication failure | Issuer/audience/expiry outcome and client flow | Identity/platform |
| Tool denied | Verified principal and effective tool policy | Identity/tool owner |
| Gateway cannot reach backend | Route/config status, DNS/TLS and backend readiness | Platform/service |
| Agent chooses wrong tool | Composed configuration, task trace and scenario | Agent team |
| Session cannot resume | Runtime session metadata and snapshot/state availability | Runtime/data owner |
| Model throttling or excess usage | Provider result, concurrency and retry limits | Agent/platform |
| Model request refused or over budget | Verified caller, approved-model policy and rate-limit decision | Platform/agent |
| Missing traces | Instrumentation, collector queues and vendor export | Observability/component |

Logs should distinguish policy denial from dependency failure without revealing credentials. The pilot must demonstrate troubleshooting with the actual developer permissions, not only cluster-admin access.

## Capacity and incidents

Monitor active work, queue wait, request latency/errors, denied access, provider throttling, CPU/memory, worker occupancy, snapshot operations and collector drops where signals are supported. Establish alerts from workload requirements and real failure modes rather than a universal dashboard template.

During unsafe-tool incidents, disable access independently of agent rollback where possible. Preserve relevant audit evidence and identify affected consumers. Runtime outages require session/state recovery decisions; tool outages require bounded retries and clear unavailable-capability responses. Telemetry failure must not silently invalidate mandatory release checks.

Assign on-call and escalation ownership for the proxy/controller, the rate-limit service where budgets are enforced, runtime, database, registry and downstream service. Recovery targets and required audit coverage remain open requirements in the [validation plan](validation-plan.md).

## Upgrades and drift

Pin chart/controller/CRD/runtime versions and record their tested combination. Upgrade shared components independently of unrelated agent changes. Test CRD migration, persisted sessions, policy semantics and representative consumers. Inspect rendered configuration and actual controller acceptance, not just chart diffs.

Existing infrastructure plans and Helmfile diffs detect configuration changes. Synthetic auth/task checks detect expired credentials, remote API changes and broken integration. Backups need restore drills; successful snapshot creation is not proof of recoverability.

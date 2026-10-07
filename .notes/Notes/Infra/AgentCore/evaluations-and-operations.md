# AgentCore evaluations and platform operations

Status: Proposed measurement and operating model. Updated 5 October 2026.

Evaluation checks release behavior; operational monitoring checks whether the platform is serving safely and reliably. Both need component ownership, durable evidence, and failure handling. Initial thresholds and sampling rates are pilot inputs rather than fixed architecture constants.

## OpenTelemetry and external observability

The stated direction is OpenTelemetry instrumentation with New Relic or Dynatrace as the primary operational backend. Backend selection remains open. Use OTLP as the application export contract so instrumentation is not coupled to either vendor's proprietary agent.

New Relic accepts native OTLP with an `api-key` header. Dynatrace accepts OTLP through SaaS or ActiveGate endpoints and requires HTTP with binary protobuf for its OTLP API. HTTP/protobuf is therefore the proposed common export protocol. Validate signal types, metric temporality, batch limits and regional endpoint selection for the chosen tenant. [New Relic OTLP ingestion](https://docs.newrelic.com/docs/opentelemetry/best-practices/opentelemetry-otlp/), [Dynatrace OTLP endpoints](https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api)

For custom agents and MCP servers, propose application/framework OTel instrumentation exporting to a separately operated, authenticated collector service, which forwards to the chosen backend. The collector centralizes credential rotation, filtering, batching and retries. Direct vendor export is a simpler pilot alternative. Collector hosting and network reachability are design decisions; do not assume AgentCore supplies a sidecar facility.

AWS documents `DISABLE_ADOT_OBSERVABILITY=true` for custom runtime integration with other observability platforms. This clears default ADOT configuration; it does not install instrumentation or automatically configure vendor export. Changing this configuration must preserve any AWS telemetry needed by evaluation. [AWS external observability configuration](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html)

Managed harness telemetry is documented as flowing to CloudWatch. Its external forwarding path requires separate validation; custom runtime exporter settings must not be assumed to apply to the managed harness. AWS service-generated gateway, memory and identity telemetry likewise needs a supported delivery/integration path rather than just an application endpoint setting. [AWS harness observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html)

Keep a supported CloudWatch/Transaction Search path for AgentCore evaluations where used. Treat dual export as an experiment, not a proven collector-to-CloudWatch solution: AWS's agent observability setup explicitly does not support the ADOT Collector as a replacement for its SDK/Lambda instrumentation path. If AWS evaluations are removed, select and validate an independent evaluation pipeline rather than assuming it can read the vendor backend. [AWS observability setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-get-started.html)

Platform ownership includes collector deployment if needed, vendor ingest credentials, TLS/auth, vendor dashboards/alerts and AWS-managed telemetry integrations. Component ownership includes framework instrumentation, propagation and release attributes. Deployment configuration selects endpoints and secret references; credentials must not be embedded in manifests or Terraform configuration values without a verified secret-handling design.

The pilot must prove trace continuity across agent, gateway and downstream API; session/release attribution; retained evaluation spans; no duplicate instrumentation; safe payload filtering; bounded export queues; flush behavior at session termination; and measured dual-ingestion cost. Do not export full prompt/tool payloads by default. Filter at the source where required, since collector-only filtering does not protect a separate AWS export path.

The vendor backend becomes the operational dashboard and alerting destination. CloudWatch remains an AWS-native telemetry/evaluation dependency where required, with explicit retention and coverage. Confirm managed signal forwarding, collector availability and vendor export failure behavior before claiming end-to-end coverage.

## Evaluation responsibilities

| Layer | Evaluation responsibility | Proposed owner |
|---|---|---|
| Service assets | API guidance, prompt variables, scripts and compatibility | Service team |
| Agent | Task outcomes, tool choice, complete prompt/content composition | Agent team |
| Tools | Contract correctness, idempotency and business authorization | Tool/service team |
| Platform | Identity, gateway bypass, shared controls and deployment isolation | Platform/identity teams |

Run deterministic assertions for access control and financial correctness. LLM judges can assess answer quality, but their scores cannot authorize access or prove the absence of all sensitive-data leaks.

## Offline release gate

Store representative scenarios and thresholds with the component. Include successful tasks, invalid inputs, unavailable dependencies, unauthorized users, two tenants, prompt injection, missing skills, schema changes, and retry behavior. Keep production secrets and real transaction effects out of fixtures.

Proposed evidence fields are release and binding hashes, dataset version, evaluator version, sample count, pass/fail results, quality distribution, tool traces, errors, costs and latency. Define hard failures separately from quality thresholds. Missing telemetry and evaluator errors fail the gate or require explicit exception handling; they are not passing scores.

AgentCore supports online evaluation of live traffic, on-demand evaluation of selected spans or traces, and batch evaluation of many sessions in one asynchronous job. Batch evaluation reads sessions from CloudWatch Logs and accepts ground truth such as expected responses, assertions and tool trajectories, which makes it the closest documented fit for this gate. The documented on-demand setup requires Transaction Search and supported telemetry instrumentation. Test prerequisites and trace completeness before relying on the gate. [AWS evaluation types](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations-types.html), [AWS on-demand setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/getting-started-on-demand.html)

Use supported AWS evaluators where they fit; deterministic checks can run in component CI regardless of whether they are registered as managed evaluators. Do not assume a particular code-evaluator resource or schema exists without checking the selected provider.

## Online monitoring

Select session sampling and filters based on risk, traffic and cost. Low traffic can require a longer observation window or targeted synthetic cases. High-risk operations need deterministic checks on every operation even when answer-quality evaluation is sampled.

Dashboards should show sample counts, evaluation errors and missing-data rates alongside scores. Record evaluator/model version and release attribution so a judge upgrade is not mistaken for an application regression. Define uncertainty and minimum observation counts before automatic action.

Online rollback automation is a later option. Before enabling it, prove alarm attribution, concurrency controls, baseline compatibility and false-positive behavior. Initially, alerts route to an owner who can execute the reviewed recovery process.

## Tracing and audit

Use a stable service identity and annotate release, environment, target and evaluator revisions. Trace agent calls, tool dispatch, downstream results, memory actions and evaluation runs. Keep user identifiers pseudonymous where possible and redact credentials and sensitive payloads before export.

| Signal | Use | Proposed owner |
|---|---|---|
| Invocation count, latency, errors and throttles | Availability and capacity | Agent/platform teams |
| Tool failures and downstream latency | Integration health | Service/tool team |
| Policy denies and bypass attempts | Authorization incidents or broken entitlements | Identity/platform teams |
| Quality scores and evaluation coverage | Behavior regressions | Agent team |
| Memory extraction/retrieval failures | Context quality and data lifecycle | Agent/data owner |
| Publication and activation events | Provenance and incident reconstruction | Release/platform owners |

Configure log retention and encryption before creating workloads where supported. Verify actual log group naming and emission rather than assuming a precreated group is used. Confirm CloudTrail coverage and event categories for the exact services and actions before promising invocation-level audit evidence.

## Cost and capacity

Track inference tokens, tool/API usage, runtime consumption, memory processing/storage, gateway calls, evaluation invocations, tracing, artifact retention and network costs. Resource tags help organize costs but do not automatically attribute all shared charges to agents. Use release/session telemetry and an explicit shared-cost allocation policy. Current prices, a per-session cost model and illustrative totals are in [costs](costs.md).

Set execution limits, bounded retries, quotas and budget alerts. Load-test representative concurrency and tool fan-out. A two-AZ VPC does not by itself establish an end-to-end availability target. Document dependency failure modes, retry backoff and graceful refusal when required tools are unavailable.

## Drift and upgrades

Run scheduled plans with read/plan roles and route meaningful differences to owners. Confirm the unit filter includes affected dependencies and shared resources. Terraform drift checks cannot detect changed artifact bytes, expired delegated credentials, broken remote APIs or incorrect model behavior; add integrity checks and synthetic integration tests.

Pin Terraform, Terragrunt, providers, CI/CD components and platform source commits. Evaluate upgrades in dev with schema and replacement analysis, then run workload acceptance tests in stage. Retain evidence of import/state migration when changing providers. Exact versions remain to be selected by the resource spike.

## Incident handling

| Incident | First response | Recovery check |
|---|---|---|
| Unauthorized access or suspected tenant leak | Disable affected path, preserve evidence, involve security owner | Negative tests and data-impact assessment |
| Runtime outage | Inspect dependency and resource health; switch to compatible retained release if justified | Availability and smoke checks |
| Tool/API outage | Bound retries and communicate unavailable capability | Service contract tests |
| Corrupt or revoked asset | Stop adoption and affected execution; identify consumers | Verified replacement and complete agent tests |
| Evaluation service outage | Pause promotions requiring evidence | Restore trace/evaluator coverage |
| Drift conflicts with promotion | Block activation and reconcile actual configuration | Clean reviewed plan and binding checks |

Define who is on call, who can revoke tool access, who approves emergency recovery and who owns sensitive trace access before production. Browser recordings and shared memory require their own access and retention policies if enabled.

## Operating acceptance

The pilot must produce measured cost/latency, a successful recovery drill, verified alarm routing, an evidence retention policy, and named operational owners. Record remaining gaps rather than inferring readiness from a successful infrastructure apply.

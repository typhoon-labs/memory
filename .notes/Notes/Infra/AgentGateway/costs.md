# EKS agent platform costs

Status: Proposed measurement model. Updated 5 October 2026. No measured usage or price inventory recorded. [Notes index and terms](README.md)

The option may reduce incremental infrastructure charges and engineering effort by reusing EKS services. It may also increase idle capacity and platform maintenance. Compare total cost for the same workload, success rate and latency target. Do not label existing capacity free or assume open-source software has zero operating cost.

## Two views of cost

Report incremental cash cost alongside an allocated platform cost. The first identifies new spend; the second includes shared capacity and operating work consumed by this platform. State the allocation policy so comparisons are reproducible.

```text
monthly total = model inference + evaluations
              + compute and warm capacity + storage
              + networking + telemetry + licences/support
              + attributable operating effort

cost per successful task = attributable cost / successful completed tasks
```

Count unsuccessful runs and retries in the numerator. Separate one-time delivery effort from recurring operations and amortize only with a stated period. Do not charge the full existing EKS control plane to this option unless it requires another cluster.

## Cost inventory

| Item | Measure | Allocation consideration |
|---|---|---|
| Models | Input/output/cached tokens and provider charges | Agent/team plus evaluation activity |
| Gateway/controller | Requests, replicas and CPU/memory | Shared baseline and traffic contribution |
| Rate-limit service | Replicas and backing store, where shared token budgets are enforced | Shared baseline |
| Conventional agents/tools | Node-hours attributable to placement and replicas | Requests alone do not equal billed node capacity |
| Substrate | Warm workers, actor occupancy, snapshots and restore traffic | Compare actual node footprint and latency |
| PostgreSQL | Allocated capacity, storage, backups and operations | Existing headroom versus required expansion |
| Registry | Service/database footprint and maintenance | Discovery volume and onboarding value |
| Langfuse if adopted | Web/workers, ClickHouse, cache, storage and operations | Fixed baseline plus ingestion/evaluation usage |
| Network | LB, NAT, endpoint and transfer charges | Existing shared charges versus new requirements |
| Telemetry | Billed ingestion, retention, queries and host monitoring | Vendor contract and duplicate destinations |
| Delivery | Self-hosted runner pod compute, artifact retention and evaluation runs | Per-release plus platform compatibility tests; runner pods draw on the same EKS capacity |
| People | Build, review, on-call, upgrades and support hours | Report separately from cloud charges |

Add exact region, instance types, purchase model, current price source, vendor contract and date during the pilot. No illustrative dollar totals are supplied without those inputs.

## Comparable scenario

The [AgentCore costs](../AgentCore/costs.md) carry illustrative monthly totals for an assumed session profile at 5,000, 50,000 and 500,000 sessions a month across three environments. This page has no counterpart, so the two options cannot yet be compared on totals, and an unpriced option is not a cheaper one. Price this option for the same profile and volumes, which are recorded in the [comparison basis](../README.md#shared-pilot-workload), then replace both sets of estimates with measurements. Revalidate the AgentCore rates and workload assumptions at the same time.

| Line | AgentCore estimate is built from | This option needs |
|---|---|---|
| Model inference | Tokens per session at the model's rate | The same figure where provider, model, rates and caching are the same; record any difference |
| Execution | Active CPU and peak memory per second | Node-hours for the pods or workers serving the same concurrency, with failure headroom and warm capacity |
| Gateway and policy | A charge per invocation and authorization request | Gateway/controller replicas and the rate-limit service as a fixed baseline |
| Session state and memory | A charge per event, record and retrieval | CloudNativePG capacity, storage and backups; S3 snapshots |
| Evaluation | Built-in evaluator charges | Evaluator model tokens, plus Langfuse or CI footprint where used |
| Fixed networking | NAT gateways and interface endpoints per environment | Additions beyond existing cluster networking, with the allocated share reported separately |
| Telemetry | CloudWatch spans and logs; vendor not priced | Vendor ingest for the same sessions |
| Catalog | Registry records and API calls | Agentregistry service and database footprint |
| People | Not estimated | Not estimated; report hours for both options |

Hypothesis to test: this option's cost is mostly fixed baseline at pilot volume and mostly inference at high volume, so its difference from AgentCore lies in execution, platform services and people rather than in tokens.

## Capacity economics

EKS savings depend on bin packing, usable headroom, node lifetime and tolerated cold-start latency. Removing idle pods may not remove a node. Snapshot/restore can improve density but adds warm workers, storage, traffic and runtime operations. Measure fleet cost with and without the capability under the same arrival/concurrency distribution.

Use real pod requests and observed consumption; neither alone establishes billing. Include spare capacity required for failures, previous versions kept for rollback and load-test/evaluation workloads. Charge isolated candidates only when the selected release process needs them.

AgentCore uses different metering from provisioned EKS nodes, including qualifying I/O-wait treatment. Use its actual billed usage or supported billing model, not a conversion from pod CPU requests. [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)

## Spending controls

Set bounded agent iterations, tokens, wall time, concurrent work and retries. Restrict approved models and prevent callers from bypassing the governed path or raising limits without permission. Attribute cost from verified team/workload identity rather than caller-provided labels.

Gateway token quotas need the selected version's shared-state semantics. The documented global token limiting differs from local per-instance request limiting; do not multiply replicas and assume a local quota remains a fleet-wide token budget. Token limits also do not automatically enforce a strict currency budget across models and concurrent requests. Global limiting depends on a separately deployed rate-limit server, which is both a cost line and an availability dependency. The same page notes that rate limiting is evaluated before content-safety checks, so requests rejected by guardrails still consume quota. [Agentgateway budget controls](https://agentgateway.dev/docs/kubernetes/latest/documentation/llm/cost-controls/budget-limits/)

Apply retention to traces, snapshots, artifacts and evaluation results with their owners. Avoid duplicating full payloads across operational and AI engineering backends. Evaluate cheaper models or caching through task success measurements rather than token price alone.

## Measurements for selection

Record arrival rate, concurrency, warm/cold latency, task success, tool/model calls, tokens, evaluation frequency, resource occupancy, node-hours, storage/transfer and support hours. Compare existing-client access separately from hosted execution because they deliver different scope. A favorable cloud bill with materially greater incident/review effort is not a demonstrated total-cost improvement.

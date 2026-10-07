# AgentCore option costs

Status: Cost inventory with illustrative estimates. No measured usage. Prices read 5 October 2026.

This page lists every cost the option would incur and prices those that have a public rate. It covers model inference, AgentCore metered services, supporting AWS infrastructure, release and evaluation activity, third-party services, and people. The totals are estimates built on an assumed session profile, not measurements. The pilot replaces them through the "Measure one representative workload" experiment in the [validation plan](validation-plan.md).

## Summary

- At pilot volume the estimated AWS bill is about $1,700 a month for 5,000 sessions across three environments. More than half of that is fixed networking and release-gate runs, not traffic.
- As volume grows, model inference and evaluation take over: about $8,300 a month at 50,000 sessions and about $74,000 at 500,000, with inference above 70% of each.
- AgentCore's own metered services (runtime, gateway, policy, memory) add roughly 7% to 9% on top of inference in this profile. Gateways, runtimes and the registry have no standing charge.
- Evaluating every session with three built-in evaluators costs 70% to 100% of running the session on Claude Sonnet 5.5. The sampling rate is the main evaluation cost control.
- Staffing is not priced and is expected to exceed the AWS bill at pilot scale. Observability vendor contract terms, the Okta add-on and organization-level AWS charges are also not priced.

## Basis and sources

Prices are US dollars for `us-east-1` at on-demand list rates, before discounts, credits, taxes and support charges. Vendor rates are public list prices; a negotiated contract replaces them.

| Source | Used for | Published |
|---|---|---|
| AWS price list `AmazonBedrockAgentCore` | Runtime, gateway, memory, evaluations, built-in tools | 15 September 2026 |
| AWS price list `awsagentregistry` | Registry records and API calls | 11 September 2026 |
| AgentCore pricing page | Policy, identity, memory price change, runtime billing rules, AWS examples | Read 5 October 2026 |
| AWS price lists `AmazonVPC`, `AmazonCloudWatch`, `awskms`, `AWSSecretsManager`, `AmazonS3`, `AmazonECR`, `AmazonECS`, `AWSLambda`, `AWSCloudTrail`, `AWSDataTransfer` | Supporting services | 11 September to 1 October 2026 |
| VPC pricing page | NAT gateway | Read 5 October 2026 |
| GitLab compute minutes documentation | Which runners GitLab.com meters | Read 5 October 2026 |
| Bedrock snapshot in `Notes/Kiro/sources/2026-10-04/bedrock/` | Model token rates and guardrails | Feeds dated 30 September and 3 October 2026 |

Two rates are weaker than the rest. The NAT gateway rate is the pricing page's Ohio example, because its price list sits in the EC2 file, which was not downloaded. Policy and identity rates appear on the AgentCore pricing page but not in the September price list file. [AWS price list index](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/index.json), [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/), [VPC pricing](https://aws.amazon.com/vpc/pricing/)

## Cost inventory

| Category | What is billed | Scales with | Priced below |
|---|---|---|---|
| Model inference | Input, output and cache tokens | Sessions, tokens per session, model | Yes |
| AgentCore runtime | Active CPU and peak memory per second | Sessions, duration, idle timeout | Yes |
| AgentCore gateway and policy | Invocations and authorization requests | Tool calls | Yes |
| AgentCore memory | Events ingested, records stored, retrievals | Sessions and retention | Yes |
| AgentCore evaluations | Evaluator tokens or evaluations | Evaluated sessions and evaluator count | Yes |
| Agent Registry | Records and API calls above free tiers | Catalog size | Yes |
| Networking | NAT gateways, VPC endpoints, data processed | Environments and availability zones | Yes |
| Telemetry in AWS | Spans, logs, metrics, alarms | Sessions and payload capture | Yes |
| Security and storage | KMS keys, secrets, S3, ECR, CloudTrail | Resource count | Yes |
| Release activity | Gate runs, CI runner compute, load tests | Release frequency | Yes, except runner compute |
| Observability vendor | Ingest, retention, user seats | Telemetry volume and contract | List prices only |
| Identity provider | Okta add-on for authorization servers | Users and contract | No list price |
| People | Build, operate, review, on call | Scope and number of teams | Not estimated |

## Model inference

The option does not name a model. The three current Claude tiers in the snapshot are used as a range, with Sonnet 5.5 as the working example.

| Model | Input per 1M tokens | Output per 1M tokens | Cache read per 1M | Cache write, 5 minutes, per 1M |
|---|---|---|---|---|
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 | $1.25 |
| Claude Sonnet 5.5 | $2.00 | $10.00 | $0.20 | $2.50 |
| Claude Opus 5.5 | $4.00 | $20.00 | $0.20 | $5.00 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 | $3.75 |

These are global cross-region rates. In-region and geo inference is 10% higher in the snapshot ($2.20 and $11.00 for Sonnet 5.5), which applies if data must stay in `us-east-1`. A one-hour cache write costs more than the five-minute write ($4.00 per 1M on Sonnet 5.5).

Inference is spent in more places than live sessions:

- Live agent sessions.
- Release-gate scenario runs, repeated in each environment.
- Judge models for custom evaluators, billed separately from the per-evaluation fee.
- Memory extraction when a strategy uses overrides or is self-managed.
- Natural-language policy authoring, at $0.13 per 1,000 input tokens.
- Retries and loops that run to their iteration limit.

## AgentCore metered services

| Service | Meter | Price | Note for this option |
|---|---|---|---|
| Runtime, v1 microVM | vCPU-hour, GB-hour | $0.0895, $0.00945 | CPU is not billed during I/O wait; memory is billed at peak for every second the session lives |
| Runtime, v2 microVM | vCPU-hour, GB-hour | $0.1276, $0.0169 | Idle memory reclaimed after 120 seconds; committed baseline rates of $0.0997 and $0.0132 listed as launching by October 2026 |
| Runtime, instance-based | EC2 on-demand plus management fee | 12% (7.8% for GPU) | Not proposed |
| Harness | None | No additional charge | Pays for the runtime, model, memory and tools it uses |
| Gateway API invocations | ListTools, InvokeTool, Ping | $0.005 per 1,000 | No hourly charge per gateway |
| Gateway search | Search API call | $0.025 per 1,000 | Only if semantic tool search is used |
| Gateway tool indexing | Tool indexed per month | $0.02 per 100 tools | Only with search |
| Gateway private targets | GB processed | $0.006 per GB | Applies to VPC target connectivity |
| Policy | Authorization request | $0.000025 each | First 100 temporal policies per engine add no charge |
| Policy guardrails | Text units by safeguard | $0.07 to $0.17 per 1,000 | Optional; not in the proposed design |
| Identity | Token or API key request | $0.010 per 1,000 | No charge when used through runtime or gateway |
| Memory, short-term | Events, then GB from 6 October 2026 | $0.25 per 1,000 events through 5 October 2026; then $1.00 per GB ingested, $0.20 per GB retrieved, $0.10 per GB-month stored | Price basis changes the day after this page was written |
| Memory, long-term storage | Record per month | $0.75 per 1,000 built-in; $0.25 per 1,000 with overrides or self-managed | Records bill every month until deleted |
| Memory, long-term retrieval | Retrieval | $0.50 per 1,000 | |
| Evaluations, built-in | Input and output tokens | $2.40 and $12.00 per 1M | Model usage included |
| Evaluations, batch | Input and output tokens | $1.80 and $9.00 per 1M | 25% below on-demand |
| Evaluations, custom | Evaluation | $1.50 per 1,000 | Judge model billed separately |
| Agent Registry records | Record per month | First 5,000 free, then $0.40 per 1,000 | Pilot stays in the free tier |
| Agent Registry search | API call | First 1,000,000 free, then $0.02 per 1,000 | |
| Agent Registry list and get | API call | First 2,000,000 free, then $0.004 per 1,000 | |
| Code interpreter and browser | vCPU-hour, GB-hour | $0.0895, $0.00945 | Deferred capabilities |
| Web search | Query | $7.00 per 1,000 | Not in the proposed design |
| Managed session storage | None during preview | Not charged | Pricing after preview is not stated |

The pricing page does not say which runtime generation a new runtime receives, so estimates below show both. Memory has a 128 MB minimum billing level. Because memory is billed until the session ends, the idle timeout is part of every session's cost; the harness default is 900 seconds. [AWS harness cost notes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html)

AWS publishes worked examples that help calibrate the estimates here:

| AWS example | Assumptions | Monthly total |
|---|---|---|
| Runtime, v2 | 1,000,000 sessions of 10 minutes, 90% I/O wait, 1 vCPU, 1 to 2.5 GB | $6,703 |
| Gateway | 200 tools, 50,000,000 searches, 200,000,000 tool invocations | $2,250.04 |
| Policy | 500,000 authorization requests | $12.50 |
| Identity | 150,000 token requests outside runtime and gateway | $1.50 |
| Memory | 100,000 short-term events, 10,000 long-term records, 20,000 retrievals | $18.97 |
| Evaluations | 15,000 interactions, three built-in evaluators at 15,000 input tokens each, 15,000 custom evaluations | $1,804.50 |
| Observability | 10 GB of spans and 6 GB of logs | $6.50 |

## Supporting AWS services

| Service | Meter | Price | Where it arises |
|---|---|---|---|
| NAT gateway | Hour, GB processed | $0.045, $0.045 | Outbound access from VPC-connected runtimes |
| Interface VPC endpoint | Hour per endpoint per zone, GB | $0.01, $0.01 | Private access to AWS APIs |
| S3 gateway endpoint | None | No charge | Artifact and state access |
| VPC Lattice service | Hour, GB, requests | $0.025, $0.025, $0.10 per million above 300,000 an hour | Possible path from gateway to private MCP services |
| VPC resource endpoint | Hour per resource | $0.02 | Alternative private target path |
| Data transfer | GB out to internet, GB between zones | $0.09, $0.01 | Telemetry export to a vendor, SaaS calls |
| KMS | Key version per month, requests | $1.00, $0.03 per 10,000 | One key per data class and account; 20,000 requests free |
| Secrets Manager | Secret per month, API calls | $0.40, $0.05 per 10,000 | Vendor ingest keys, provider credentials |
| S3 standard | GB-month, requests | $0.023; $0.005 per 1,000 writes; $0.0004 per 1,000 reads | State, artifacts, evidence, access logs |
| ECR | GB-month | $0.10 | Runtime and MCP images kept for rollback |
| CloudWatch spans | GB ingested | $0.35 | Transaction Search; 1% indexing included, then $0.75 per million spans |
| CloudWatch Logs | GB ingested, GB-month, GB scanned | $0.50, $0.03, $0.005 | Runtime, gateway and memory logs; span downloads for evaluation |
| CloudWatch metrics | Custom metric per month | $0.30 for the first 10,000 | Custom runtime metrics |
| CloudWatch alarms | Alarm per month | $0.10 | Platform alerts kept in AWS |
| CloudWatch GetMetricData | Metrics requested | $0.01 per 1,000 | Vendor integrations that poll CloudWatch |
| CloudTrail | Events | Data events $0.10 per 100,000; extra management trails $2.00 per 100,000 | Runtime invocations are data events |
| Lambda | Requests, GB-seconds | $0.20 per million, $0.0000166667 | Gateway interceptors |
| EventBridge | Cross-account events | $0.05 to $1.00 per million | Registry approval notifications |
| Fargate | vCPU-hour, GB-hour | $0.04048, $0.004445 | A separately operated telemetry collector |

AWS Config, GuardDuty, Security Hub and the support plan percentage apply if the option creates new accounts. They depend on how the organization is set up and are not priced here.

## Fixed cost per environment

These charges accrue with no traffic. They follow from the proposal to run VPC-connected execution across two availability zones.

| Item | Basis | Monthly |
|---|---|---|
| NAT gateways | 2 zones at $0.045 an hour | $65.70 |
| Interface endpoints | 8 endpoints across 2 zones at $0.01 an hour | $116.80 |
| KMS keys | 5 data classes | $5.00 |
| Secrets | 5 secrets | $2.00 |
| Networking and keys, per environment | | about $190 |
| Telemetry collector, if operated | 2 Fargate tasks of 0.5 vCPU and 1 GB, load balancer excluded | $36.04 |

The eight endpoints assumed are the AgentCore data and control planes, Bedrock runtime, ECR API, ECR Docker, CloudWatch Logs, STS and Secrets Manager. Each endpoint added or removed changes the figure by $14.60 a month. Dev, stage and prod together come to about $550 a month for networking. The shared-services account needs only storage, keys and the registry, which is a few dollars.

Gateways, runtimes, runtime endpoints and registry records under the free tier have no standing charge. A candidate gateway and server kept for isolation or rollback therefore cost nothing while idle; the cost of that approach is effort and quota.

## Usage cost per session

The profile below is an assumption. Every figure after it scales with these inputs.

| Input | Assumed value |
|---|---|
| Model calls per session | 6 |
| Tokens per call | 8,000 input, 400 output |
| Tokens per session | 48,000 input, 2,400 output |
| Gateway calls and policy checks | 12 each |
| Runtime size | 1 vCPU, 1 GB peak |
| Active CPU | 20 seconds |
| Session lifetime | 2 minutes of work plus the 15-minute idle timeout |
| Memory activity | 20 short-term events of 3 KB, 5 long-term records, 2 retrievals |
| Telemetry | 250 KB of spans and 50 KB of logs |

| Component | Per 1,000 sessions | Working |
|---|---|---|
| Inference, Haiku 4.5 | $60 | 48M input at $1.00, 2.4M output at $5.00 |
| Inference, Sonnet 5.5 | $120 | 48M input at $2.00, 2.4M output at $10.00 |
| Inference, Opus 5.5 | $240 | 48M input at $4.00, 2.4M output at $20.00 |
| Runtime | $3.17 on v1, $5.50 on v2 | 283 GB-hours of memory and 5.6 vCPU-hours |
| Gateway | $0.06 | 12,000 invocations |
| Policy | $0.30 | 12,000 authorization requests |
| Identity | $0.00 | Used through runtime and gateway |
| Memory | $4.81 | $0.06 ingestion, $3.75 record storage, $1.00 retrieval |
| Spans and logs in CloudWatch | $0.11 | 0.25 GB of spans, 0.05 GB of logs |
| AgentCore services and telemetry, total | $8 to $11 | Excludes inference and evaluation |

The v2 runtime figure ignores idle memory reclamation, which would lower it. Long-term memory records keep costing $3.75 a month for each 1,000 sessions that created them, so that line grows with retention.

## Evaluation and release activity

| Activity | Cost | Working |
|---|---|---|
| Online evaluation, three built-in evaluators | $83 to $119 per 1,000 evaluated sessions | 10,000 to 15,000 input tokens and 300 output tokens per evaluator |
| Same through batch evaluation | $62 to $89 per 1,000 evaluated sessions | 25% lower token rates |
| Custom evaluator | $1.50 per 1,000 evaluations plus judge tokens | Deterministic checks in CI avoid this fee |
| Release-gate run | about $40 per environment | 200 scenarios: $24 inference on Sonnet 5.5, $12 to $17 evaluation, $1 runtime |
| One release through dev, stage and prod | about $120 | Three gate runs |
| Load test | about $260 per 2,000 sessions | Inference dominates; a cheaper or stubbed model lowers it |
| CI pipeline run | Runner compute only; not priced | 30 minutes on a self-hosted runner in EKS. GitLab.com meters compute minutes only on its hosted runners, so the cost is the job pod's share of EKS nodes |
| Scheduled drift plans | Runner compute only; not priced | 30 units a day at 3 minutes each, about 45 runner-hours a month |
| Rollback drill | Negligible | One activation change and smoke checks |

At the lower token figure, evaluating one session costs $0.083 against $0.12 to run it on Sonnet 5.5. A rule that evaluation stays under 25% of inference spend allows about a third of sessions to be evaluated with three evaluators, or every session with one. [GitLab compute minutes](https://docs.gitlab.com/ci/pipelines/compute_minutes/)

## Third-party costs

| Item | List price | What decides the real cost |
|---|---|---|
| New Relic data | 100 GB a month free, then $0.40 per GB, or $0.60 per GB on Data Plus | Whether an existing contract already covers the ingest |
| New Relic users | Basic free; core $49; full platform $349 a user a month on Pro with annual commitment | How many people need full access |
| Dynatrace traces and logs | $0.20 per GiB ingested and processed, $0.0007 per GiB-day retained | Retention period and existing commitment |
| Dynatrace metrics | $0.15 per 100,000 data points | Metric cardinality |
| Dynatrace host monitoring | $0.01 per memory-GiB-hour full-stack; $0.04 per host-hour infrastructure | Applies only to hosts the team runs, such as a collector |
| Okta | API Access Management is sold as an add-on with no list price shown | Whether an authorization server per environment requires the add-on |
| GitLab CI/CD | No per-minute charge with self-hosted runners; the GitLab.com subscription is per user | Whether the existing Ultimate subscription covers the people involved; EKS node capacity for runner pods |
| Terraform and Terragrunt | No licence fee assumed | The design uses the S3 backend and no hosted service |
| Downstream services | Not priced | Test tenants, sandbox fees and API quotas used by evaluation |

At the assumed 250 KB of spans a session, 1,000,000 sessions produce about 250 GB a month. That is about $60 on New Relic or $47 on Dynatrace at list ingest rates, before retention, so telemetry volume is not a cost driver on either backend. Seats, retention and contract minimums are. Exporting to a vendor while keeping the AWS span path for evaluations pays both ingest charges. [New Relic pricing](https://newrelic.com/pricing), [Dynatrace rate card](https://www.dynatrace.com/pricing/rate-card/), [Okta pricing](https://www.okta.com/pricing/)

## People and operating effort

Staffing is the largest cost and is not estimated. The [validation plan](validation-plan.md) defers the estimate until the compatibility and identity experiments finish. The work the other notes commit to is listed here so that estimate has a scope.

| Kind | Work items |
|---|---|
| One-time build | Bootstrap for four accounts; 15 platform modules; units and stacks; resolver; schemas for assets, manifests, deployment and publication files; claims contract; six CI/CD components; three starter templates; evidence store; baseline policies; gateway interceptors |
| Pilot components | One agent, one MCP server or service integration, one asset repository, evaluation datasets and thresholds, authorization and isolation test suites |
| Recurring platform work | Provider, Terraform and Terragrunt upgrades with replacement analysis; drift review; on call; cost review; incident and rollback drills; following AWS service changes such as the registry namespace move |
| Recurring review work | Catalog curation; entitlement diffs; deployment approvals; evaluator and judge version changes; dataset upkeep |
| Per team onboarded | Agent team adoption of modules and pipelines; service team publication setup; consumer evaluation of each adopted asset version |

For scale, the illustrative pilot bill is about $21,000 a year. Compare that with the loaded cost of the engineers assigned to the items above.

## Illustrative monthly totals

These totals assume Sonnet 5.5 without prompt caching, 20% of sessions evaluated by three built-in evaluators, ten release-gate runs, and three environments.

| Line | 5,000 sessions | 50,000 sessions | 500,000 sessions |
|---|---|---|---|
| Model inference | $600 | $6,000 | $60,000 |
| AgentCore runtime, gateway, policy, memory | $50 | $475 | $4,750 |
| Online evaluation | $83 | $828 | $8,280 |
| Release-gate runs | $400 | $400 | $400 |
| Networking, three environments | $548 | $548 | $548 |
| Keys, secrets, storage, alarms | $40 | $40 | $40 |
| Spans and logs in CloudWatch | $1 | $6 | $60 |
| Total | about $1,700 | about $8,300 | about $74,000 |
| Inference share | 35% | 72% | 81% |

The totals exclude the observability vendor, a collector, Okta, CI runner compute, load tests, accumulated long-term memory records and people. A suggested pilot cap is $2,500 a month on the pilot accounts, which is the 5,000-session estimate plus headroom, with alerts at 50%, 80% and 100%.

## What moves the bill

| Lever | Effect |
|---|---|
| Model tier | Haiku 4.5 halves inference against Sonnet 5.5; Opus 5.5 doubles it |
| Tokens per session | Linear. Tool definitions, skill metadata and history are input tokens on every call |
| Prompt caching | With 70% of input read from cache, a Sonnet 5.5 session falls from about $0.12 to about $0.06 |
| In-region inference | Adds 10% to inference |
| Evaluation sampling and evaluator count | Linear. Three evaluators on every session cost 70% to 100% of the session's inference |
| Batch evaluation | 25% lower token rates than on-demand |
| Idle session timeout | Cutting 900 seconds to 300 seconds roughly halves runtime cost per session |
| Environments with the full endpoint set | About $180 a month each; public network mode in dev avoids it |
| Long-term memory retention | Records bill monthly until deleted |
| Payload capture in traces | Raises span volume; small in AWS, larger where a vendor bills on retention |
| Release frequency and dataset size | About $40 per gate run per environment |
| Iteration and token limits | At the default 75 iterations, one runaway session uses at least 600,000 input tokens, about $1.20 on Sonnet 5.5 |

## Cost controls

Set budgets and alerts on the pilot accounts before the first workload runs. Set `maxIterations`, `maxTokens`, `timeoutSeconds`, the idle timeout and the maximum lifetime on every harness or runtime; the defaults permit long and expensive sessions. Prevent callers from overriding those limits at invocation, which is an open decision in the validation plan.

Harness tags propagate to the managed runtime, endpoint and managed memory. Separately created gateways, memory, buckets and file systems need their own tags. Use Cost Explorer or the Cost and Usage Report for billed usage; traces explain activity but are not a billing record. NAT gateways, endpoints, shared gateways and collectors serve several components, so they need an explicit allocation rule.

Choose evaluation sampling from the budget as well as from risk. Create only the VPC endpoints the call graph needs. Apply retention to logs, spans, long-term memory, ECR images and evidence, and let artifact cleanup follow the reference checks in [foundation and services](foundation-and-services.md).

## Price changes and preview terms to watch

- Short-term memory moves from per-event to per-GB pricing on 6 October 2026. The estimates here use the new basis.
- Runtime v2 committed baseline rates are listed as launching by October 2026.
- Managed session storage is free during preview with no stated price afterwards.
- Agent Registry is priced under its own service since the namespace move, with free tiers that the pilot will not exceed.
- Model rates change with each model release; the snapshot used here is dated 4 October 2026.

## Not priced

- Staffing, training and on-call cover.
- Self-hosted CI runner compute on EKS.
- Observability vendor contract terms, seats beyond list price, and a load balancer for a collector.
- The Okta add-on, if authorization servers per environment need it.
- AWS Config, GuardDuty, Security Hub and support plan charges for new accounts.
- Discounts, committed-use terms, credits and taxes.
- Downstream service costs incurred by evaluation and load tests.
- Instance-based runtimes, managed knowledge bases, web search, and code interpreter or browser usage.
- The cost of leaving: migrating code, content, identity and memory if the option is later replaced.

## Measurements the pilot must replace

Record these for the pilot workload and substitute them for the assumed profile: input, output and cached tokens per model call; model calls and tool calls per session; active CPU seconds, peak memory and session lifetime; short-term events, long-term records and retrievals per session; evaluator input tokens per evaluation; span and log bytes per session with and without payloads; cost and duration of one release-gate run; CI runner minutes per release; and the vendor's billed ingest for the same sessions.

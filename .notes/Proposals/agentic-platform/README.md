# Enterprise agentic platform on AWS: architecture review

An architecture review and proposal for a platform that lets teams build and
run agents, MCP servers and agentic workflows on EKS, with Amazon Bedrock as
the model provider, centralized identity, model access, attribution and
observability, and support for the coding harnesses developers already use.

Checked on **4 November 2026** against current vendor documentation, upstream
code, standards and the running agentgateway demo. Commercial facts are dated
where they appear. Nothing was deployed or changed outside this directory.

## Start here

[`00-recommendation.md`](00-recommendation.md): the recommendation, the
assumptions it corrects, and what is being asked for.

## The requested review

| # | File | Answers |
|---|---|---|
| 1 | [`00-recommendation.md`](00-recommendation.md) | What do we recommend, and which assumptions were wrong? |
| 2 | [`01-architecture.md`](01-architecture.md) | What are the parts, who owns what, and which credential is on each hop? |
| 3 | [`02-build-reuse-buy-defer.md`](02-build-reuse-buy-defer.md) | For each area: build, reuse, buy or defer, the alternatives, and when to revisit |
| 4 | [`03-developer-lifecycle.md`](03-developer-lifecycle.md) | From discovery and scaffolding to deployment, debugging, upgrades and retirement |
| 5 | [`04-identity-profile.md`](04-identity-profile.md) | The identity and interoperability profile, lifecycle events, and the executable conformance suite for any STS replacement |
| 6 | [`05-workflow-automation.md`](05-workflow-automation.md) | Skills versus explicit workflows; Conductor's fit and limits; the pilot |
| 7 | [`06-use-cases.md`](06-use-cases.md) | MR reviewer, helpdesk, platform assistant, iOS, additional cases, and the pilot order |
| 8 | [`07-operating-model.md`](07-operating-model.md) | Ownership, on-call, objectives, degraded operation, isolation, recovery, upgrades |
| 9 | [`08-cost-model.md`](08-cost-model.md) | Cost with explicit assumptions and sensitivity |
| 10 | [`09-implementation-plan.md`](09-implementation-plan.md) | Phases with measurable acceptance criteria and stop conditions |
| 11 | [`10-open-decisions.md`](10-open-decisions.md) | Questions for the organization, the decision register, vendor facts to confirm |

## Area notes (the evidence behind the review)

| File | Covers |
|---|---|
| [`11-gateway-and-registry.md`](11-gateway-and-registry.md) | Agentgateway OSS versus Enterprise, Bedrock paths, budgets, bypass prevention, control placement; Agentregistry, artifact model, catalog metadata, the org CLI |
| [`12-runtimes.md`](12-runtimes.md) | Conventional Kubernetes, kagent 1.x, Agent Substrate, sandboxing on EKS, AgentCore Runtime V2 and the Classmethod article |
| [`13-infrastructure-and-data.md`](13-infrastructure-and-data.md) | EKS economics, Spot, Kyverno, Istio, CloudNativePG, Valkey, ClickHouse, S3, data classes, disruption tests |
| [`14-observability.md`](14-observability.md) | Four record streams, collector topology, Langfuse OSS versus Enterprise and its commercial terms, shared ClickHouse, Dynatrace |
| [`15-frameworks-and-charts.md`](15-frameworks-and-charts.md) | ADK on AWS, alternatives, the shared package, Copier templates, the two-chart model, the release record, framework-independent conformance |
| [`16-developer-harnesses.md`](16-developer-harnesses.md) | Claude Code, Codex, Kiro, Xcode, Agentdesktop, portable artifacts, cost per accepted task |
| [`20-demo-review.md`](20-demo-review.md) | The demo: screenshots from the running cluster, patterns to carry, gaps, where docs and code differ |
| [`90-sources.md`](90-sources.md) | Sources with versions and dates |

## Evidence labels

| Label | Meaning |
|---|---|
| **Documented upstream** | The vendor's or project's current documentation or code says so; not tested here |
| **Observed in the demo** | Seen on the running demo cluster or in its dated records |
| **Observed by others** | A third party's published test, with its conditions |
| **Inferred** | Reasoned from documented facts; stated as such |
| **To validate** | Nobody should rely on it before a pilot result |
| **To verify** | A commercial or contractual fact to confirm with the vendor in writing |
| Unmarked | This review's proposal |

## Versions checked

| Component | Version | Date |
|---|---|---|
| Agentgateway | 1.7.0 | 27 October 2026 |
| Agentregistry | 0.4.0 | 3 August 2026 |
| Keycloak | 26.8.1 (demo: 26.7.5) | 13 October 2026 |
| kagent | 1.0.0-rc1 (stable 0.10.4) | 30 October 2026 |
| Agent Substrate | 1.0.0-rc.2 | 4 November 2026 |
| AgentCore Runtime | V2 | announced 18 September 2026 |
| Langfuse | 4.74.0 (demo: 4.46.x) | 3 November 2026 |
| MCP specification | 2026-07-28 | |
| Google ADK (Python) | 2.13.0 | 23 October 2026 |
| Microsoft Conductor | 0.1.44 | 1 November 2026 |
| Claude Code | 2.1.318 | 4 November 2026 |
| Codex CLI | 0.166.0 | 29 October 2026 |
| Kiro | IDE 1.4.62, CLI 3.0.0 | 28 October, 3 November 2026 |
| Xcode | 27.2 | 29 October 2026 |
| Agentdesktop | 0.5.0 | 23 October 2026 |
| CloudNativePG, Valkey, Karpenter, Kyverno | 1.30.1, 9.1.3, 1.15.1, 1.19.2 | September to October 2026 |
| Copier | 9.19.1 | 13 October 2026 |

## Files in this directory

| Path | What it is |
|---|---|
| `diagrams/*.svg` | Generated. Edit the scripts and rerun; do not edit the SVGs |
| `screenshots/0*.png`, `1*.png` | Platform views from the running demo, 4 November 2026, read-only |
| `screenshots/incident-*.png` | One incident driven through the demo UI, 4 November 2026, 09:54 to 09:56 UTC; the demo was reset afterward |
| `confluence/` | The Confluence page set: a high-level version of this review for managers, architects and engineers. Start with its [README](confluence/README.md) |
| `scripts/build_diagrams.py` | Builds `platform-architecture.svg`, `credential-hops.svg` and `platform-at-a-glance.svg`: `python3 scripts/build_diagrams.py` |
| `scripts/cost_model.py` | The cost model; prints the tables and builds `cost-sensitivity.svg`: `python3 scripts/cost_model.py` |

Mermaid diagrams are inline in the pages. A previous, narrower proposal (7
October 2026) is in `../agent-platform/`; this review supersedes its
recommendation where they differ and reuses none of its text.

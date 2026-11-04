# Cost model

| | |
|---|---|
| Status | Estimate with explicit assumptions. Replace every assumption with the organization's figure before using a total |
| Updated | 4 November 2026 |
| Prices | Bedrock: AWS Price List API, offer `AmazonBedrockFoundationModels`, us-east-1, published 12 October 2026, read 4 November 2026. Dynatrace: public rate card, retrieved 4 November 2026 (undated). AgentCore: pricing page, read 4 November 2026. Everything else is an assumption |
| Model | [`scripts/cost_model.py`](scripts/cost_model.py): change an input, rerun, paste the tables |

## The answer in one paragraph

At 200 developers, the minimum platform costs about **$590,000 a year in
steady state**, and **three quarters of that is people**: 2 FTE of platform
engineering at an assumed $220,000 fully loaded. Inference for coding
harnesses is the second line ($94,000) and the most variable. Infrastructure
is small ($28,000 incremental, plus $14,000 if Dynatrace Full-Stack monitors
the added nodes). The largest avoidable risk is a gateway that strips prompt
caching: it adds about $180,000 a year at base usage. The first build year
adds about 0.9 FTE and training, roughly $290,000.

The platform is not cheaper inference. Its fixed cost, about $470,000 a
year, buys governed access, attribution and hosted use cases. At $110 an
hour loaded developer cost, it pays for itself if the 200 developers save
about 21 hours each a year (0.4 hours a week) from the use cases and
harnesses it supports, or if it removes a control gap that would otherwise
block those use cases.

## Verified prices (USD per million tokens)

| Model | Input | Output | Cache write (5 min) | Cache read |
|---|---:|---:|---:|---:|
| Claude Sonnet 5.5, global | 2.00 | 10.00 | 2.50 | 0.10 |
| Claude Opus 5.5, global | 4.00 | 20.00 | 5.00 | 0.20 |
| Claude Haiku 5.5, global | 0.10 | 0.50 | | 0.01 |
| Claude Fable 5.1, global | 10.00 | 50.00 | | 0.25 |
| Regional (in-region) endpoints | +10% | +10% | +10% | +10% |

Kiro's credit prices for comparison (kiro.dev, 4 November 2026): Pro $20 a
month for 1,000 credits; overage $0.04 per credit. Claude Code Enterprise
seats are $20 a month plus usage at API rates; through the gateway to
Bedrock no seat is needed, and tokens are billed to the AWS account.

## Assumptions

| Input | Base | Why |
|---|---:|---|
| Developers with harness access | 200 | Placeholder: replace |
| Active in a month | 70% | Placeholder |
| Input-side tokens per active developer per month | 60 million | Agentic coding sends the conversation on every turn; most is cache reads. Replace with pilot data |
| Of which cache reads / cache writes / uncached | 80% / 10% / 10% | Requires the gateway to preserve `cache_control` |
| Output tokens | 2.5% of input-side | |
| Opus share (rest Sonnet 5.5) | 20% | |
| Endpoint | Global (cross-region) | Regional is +10% |
| Hosted agent inference | $10,000 a year | MR reviewer (about 2,000 MRs a month at $0.15), CI triage, helpdesk, platform assistant |
| Effective compute rate | $0.045 per vCPU-hour | General purpose, 4 GiB per vCPU, On-Demand. Replace with the effective RI or Savings Plan rate and the opportunity-cost rule below |
| Platform engineering, steady state | 2.0 FTE at $220,000 | See staffing table |
| Licenses | $0 | OSS throughout; commercial options are listed, unpriced |

Per active developer-month at base: **$47 on Sonnet 5.5, $94 on Opus 5.5,
$56 at the 80/20 mix.**

## Base case, steady state

| Component | Base, per year | Share |
|---|---:|---:|
| Coding harness inference | $94k | 16% |
| Hosted agent inference | $10k | 2% |
| Infrastructure (incremental) | $28k | 5% |
| Dynatrace host monitoring | $14k | 2% |
| Telemetry ingest | $1k | 0% |
| Platform engineering staff | $440k | 75% |
| Licenses | $0k | 0% |
| **Total** | **$587k** | |

### Infrastructure sizing behind the $28k

| Component | Replicas × request | vCPU | GiB |
|---|---|---:|---:|
| Agentgateway proxy | 3 × (0.5 vCPU, 0.5 GiB) | 1.5 | 1.5 |
| Gateway PostgreSQL | 3 × (1, 2) | 3 | 6 |
| Keycloak | 3 × (1, 2) | 3 | 6 |
| Keycloak PostgreSQL | 3 × (1, 2) | 3 | 6 |
| chain-sts | 3 × (0.25, 0.25) | 0.75 | 0.75 |
| OTel collector tier 2 | 3 × (1, 2) | 3 | 6 |
| Langfuse web and worker | 4 × (2, 4) | 8 | 16 |
| Langfuse PostgreSQL | 2 × (2, 4) | 4 | 8 |
| Valkey (rate limits; Langfuse queue) | 2 × (1, 1.5) | 2 | 3 |
| ClickHouse for Langfuse | 3 × (4, 16) | 12 | 48 |
| ClickHouse Keeper | 3 × (0.5, 1) | 1.5 | 3 |
| **Production** | | **42** | **104** |
| One non-production environment at half size | | 21 | 52 |

**Observed in the demo:** the gateway proxy used 24 to 50 MiB and under 0.004
CPU at demo load. The sizing above is for production replicas and headroom,
not demo load. Langfuse's documented minimums are web and worker 2 CPU and
4 GiB each, ClickHouse 2 CPU and 8 GiB (16 GiB for larger deployments).

### Committed capacity is not free

- If the cluster's committed capacity has idle headroom that would not
  otherwise be used, the platform's incremental compute cost is near zero
  and the "committed spare" row of the sensitivity applies.
- Once average requested CPU exceeds about 60 to 70% of committed capacity,
  price the platform's share at the effective committed rate: the next
  commitment will be larger because of it.
- Spot reduces runner and evaluation-job cost, not the tier-0 services, which
  stay on On-Demand or committed capacity ([Infrastructure](13-infrastructure-and-data.md)).

## Sensitivity

![Tornado chart of steady-state annual cost against eight assumptions, each moved to its low and high value with the others at base. Platform staff from 1.5 to 4.0 FTE moves the total from $477k to $1,027k. Harness tokens per developer from 20 to 200 million a month moves it from $524k to $807k. Prompt cache hits from 90% to 0% moves it from $561k to $765k. Infrastructure, Opus share, hosted inference, Dynatrace host monitoring and regional endpoints each move it by $40k or less.](diagrams/cost-sensitivity.svg)

| Driver | Low | High | Swing |
|---|---:|---:|---:|
| Platform staff, 1.5 to 4.0 FTE | $477k | $1,027k | $550k |
| Harness tokens per developer, 20 to 200 M/month | $524k | $807k | $283k |
| Prompt cache hits, 90% to 0% (gateway strips caching) | $561k | $765k | $204k |
| Infrastructure, committed spare to 2x size | $575k | $615k | $40k |
| Opus share of harness traffic, 0% to 50% | $571k | $611k | $39k |
| Hosted agent inference, $5k to $30k | $582k | $607k | $25k |
| Dynatrace host monitoring, none to $20k | $573k | $593k | $20k |
| Regional instead of global endpoints | $587k | $597k | $9k |

What the sensitivity says:

1. **Staffing is the decision.** Folding the work into an existing platform
   team that already runs EKS, Helm, on-call and observability is what keeps
   the total near the low end. A separate new team pushes it toward the high
   end.
2. **Token volume is the usage risk.** Budgets per principal and pinned
   models are the controls; the pilot measures the real number.
3. **Caching is a correctness issue with a cost.** A test in step 1 checks
   that cache-read tokens appear in the gateway's usage records for Claude
   Code traffic.
4. Telemetry is not a driver at this scale **if content stays out of
   Dynatrace**. Model content in Dynatrace multiplies ingest by about 10.

### Scale

| Developers | Total per year | Per developer per year |
|---:|---:|---:|
| 100 | $540k | $5,400 |
| 200 | $587k | $2,900 |
| 500 | $729k | $1,500 |
| 1,000 | $965k | $970 |

Fixed costs dominate below a few hundred developers. A small population
should weigh a narrower platform (gateway and identity only) against the full
minimum platform.

## Staffing

| Area | Build year (FTE) | Steady state (FTE) |
|---|---:|---:|
| Gateway: routes, policies, budgets, monthly upgrades | 0.5 | 0.4 |
| Identity: Keycloak, chain-sts, reconciliation job, conformance suite | 0.6 | 0.4 |
| Observability: collector pipelines, Langfuse, usage ledger | 0.4 | 0.3 |
| Developer experience: templates, shared package, charts, CLI, docs | 0.8 | 0.5 |
| Support, onboarding, evaluation coaching | 0.4 | 0.3 |
| Security and architecture reviews | 0.2 | 0.1 |
| **Total** | **2.9** | **2.0** |

On-call: Keycloak, chain-sts and the gateway are tier 0. Join the existing
platform rotation (incremental cost included above); a new rotation needs at
least five people and is not included.

One-time: training about 200 developers for half a day (4 hours at $110) is
about $88,000; runbooks, drills and the conformance suite are inside the
build-year FTE.

## Not included, and how to price them

| Item | Status | Price when needed |
|---|---|---|
| Application teams' time to build agents | Real cost, owned by teams | Track per use case against its value |
| Langfuse Enterprise | Custom pricing, additive to a ClickHouse commercial plan | Quote from ClickHouse; [Observability](14-observability.md) gives the triggers |
| Solo Enterprise for agentgateway or agentregistry | No public price | Quote; triggers in [Gateway and registry](11-gateway-and-registry.md) |
| Red Hat build of Keycloak support | Subscription | Quote if vendor support for Keycloak is required |
| Okta API Access Management, Okta for AI Agents, Ping Identity for AI | Add-on SKUs | Quote, then compare with chain-sts's run cost |
| Kiro, Claude or Codex seats | Existing contracts | Compare per accepted task ([Developer harnesses](16-developer-harnesses.md)) |
| AgentCore as a second operating model | Not proposed | Build 4 to 8 engineer-weeks ($17k to $34k at $220k per FTE), run 0.1 to 0.2 FTE ($22k to $44k a year), plus usage: V2 $0.1276 per vCPU-hour and $0.0169 per GB-hour |

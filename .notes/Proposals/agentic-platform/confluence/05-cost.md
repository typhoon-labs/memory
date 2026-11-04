# Agent platform: Cost

| | |
|---|---|
| Status | Estimate. Every assumption is to be replaced with our own figure |
| Owner | Platform architecture, with FinOps |
| Audience | Managers, architects |
| Updated | 4 November 2026 |

> **In short**
> - About $590,000 a year in steady state at 200 developers; three quarters is the platform team.
> - Model usage is the second cost and the most variable; infrastructure is small.
> - The platform is not cheaper AI. It buys control, attribution and shared use cases; it pays back if each developer saves about 21 hours a year.

## The numbers

| | Per year | Share |
|---|---:|---:|
| Platform team, 2 FTE at $220,000 fully loaded | $440,000 | 75% |
| Model usage for coding tools, 140 active developers | $94,000 | 16% |
| Infrastructure added to EKS | $28,000 | 5% |
| Dynatrace monitoring of added nodes | $14,000 | 2% |
| Model usage of hosted agents (MR reviewer, triage, helpdesk) | $10,000 | 2% |
| Telemetry ingest | $1,000 | <1% |
| Licenses (all open source) | $0 | |
| **Total** | **about $590,000** | |

First year: add about $290,000 (0.9 FTE more while building, plus half a day
of training for 200 developers).

Bedrock prices are AWS's published prices (12 October 2026). For example,
Claude Sonnet 5.5 is $2 per million input tokens and $10 per million output,
with cached input at $0.10. A typical active developer costs about $56 a
month in model usage at our assumed mix.

## What moves the total

![Sensitivity of the yearly total to each assumption: platform staff from 1.5 to 4 FTE moves it from $477k to $1,027k; tokens per developer from 20 to 200 million a month from $524k to $807k; losing prompt caching adds up to $178k; infrastructure, model mix, hosted agents, monitoring and region choice each move it by $40k or less](diagrams/cost-sensitivity.png)

1. **Staffing is the decision.** Folding the work into the existing platform
   team keeps the cost near the low end.
2. **Usage volume is the risk.** Budgets per person and pinned models are the
   controls; the first stage measures the real number.
3. **Prompt caching must survive the gateway.** Losing it would add about
   $180,000 a year; it is the first thing tested.

## Size matters

| Developers | Per year | Per developer |
|---:|---:|---:|
| 100 | $540,000 | $5,400 |
| 200 | $590,000 | $2,900 |
| 500 | $730,000 | $1,500 |
| 1,000 | $965,000 | $970 |

Fixed costs dominate small populations. Below a few hundred developers, a
narrower first step (gateway and identity only) is worth considering.

## Not included

- Application teams' time to build their agents.
- Commercial add-ons we may buy later: Langfuse Enterprise, Solo Enterprise
  for the gateway, Okta or Ping agent products. None has a public price; each
  has a clear trigger in the review.
- A second runtime such as AWS AgentCore: about 4 to 8 engineer-weeks to set
  up and 0.1 to 0.2 FTE to run, if a workload ever justifies it.

> **Not decided yet**
> Developer count, our fully loaded FTE cost, and whether Dynatrace monitors the added nodes in full. See [Decisions and open questions](07-decisions-and-open-questions.md).

> **Go deeper**
> [Cost model](../08-cost-model.md) in the review, and the model itself: `scripts/cost_model.py` (change an input and rerun).

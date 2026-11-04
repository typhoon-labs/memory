# Agent platform: Decisions and open questions

| | |
|---|---|
| Status | Open |
| Owner | Platform architecture |
| Audience | Managers, architects |
| Updated | 4 November 2026 |

> **In short**
> - Eight questions need answers from the organization; each one changes what we build.
> - Several common assumptions turned out to be wrong when checked against current documentation and the running demo.
> - A few vendor facts must be confirmed in writing before any purchase.

## Eight questions for the organization

| # | Question | Why it matters | Assumed until answered |
|---|---|---|---|
| 1 | Which IdP, and do we license Okta API Access Management or an agent add-on (or the Ping equivalents)? | Decides whether we need Keycloak and our own delegation service | Base tier: Keycloak plus our service |
| 2 | GitLab: self-managed (which version) or GitLab.com, and which tier? | Service accounts, webhook signing and status checks depend on it | Premium-class, recent version |
| 3 | Who runs identity on-call, 24x7? | Critical services without on-call is a stop condition | The existing platform rotation |
| 4 | Which data may go to Bedrock, be kept in Langfuse, and be processed outside our region? | Sets what we record, for how long, and which endpoints we use | Internal code and documents; no restricted data |
| 5 | How many developers, what do we spend on Kiro today, and are OpenAI models on Bedrock approved? | Sizes the cost; decides whether Codex is useful | 200 developers; OpenAI models not approved |
| 6 | Our ClickHouse: sharded? version? timezone? What does our ClickHouse agreement say about Langfuse? | Langfuse needs a specific setup; its Enterprise edition is sold on top of a ClickHouse commercial plan | A dedicated small cluster; no Enterprise |
| 7 | Is Istio running in the target clusters? | Decides how "only the gateway may connect" is enforced | Network policy |
| 8 | Is a Mac and a macOS runner available to the platform team? | Xcode routing must be validated on a Mac | One Mac in stage 1 |

## Decisions to record

| Decision | Proposed | Owner | By |
|---|---|---|---|
| Decision owner, budget, review dates | | Engineering leadership | Stage 0 |
| How the IdP connects | Keycloak as broker | Identity, platform, security | Stage 0 |
| Who owns Keycloak and the delegation service | To decide | Identity, platform | Stage 0 |
| How fast a leaver is cut off | 20 minutes | Security | Stage 0 |
| Supported coding tools | Claude Code; Codex if OpenAI models are approved | Engineering leadership | Stage 0, revisited after stage 1 |
| Data classes and retention for prompts and outputs | | Security, data governance | Stage 0 |
| Reference framework | Google ADK, unless Strands wins a two-day comparison | Platform | Stage 2 start |
| Workflow runner | GitLab pipelines with a typed workflow definition; Conductor piloted | Platform, pilot team | End of stage 2 |
| Disaster recovery target | Rebuild in another region within 4 hours | Platform, business owners | Stage 2 |

If decisions are tracked in Jira, replace this table with a Jira issues
macro filtered on the `agent-platform-decision` label.

## Assumptions we corrected

| Assumption | What we found (4 November 2026) |
|---|---|
| kagent is a natural place to host agents on EKS | It is a release candidate, its agents cannot use AWS roles for Bedrock, sessions are lost with their node, and it likely needs EKS 1.37 or later |
| The demo's hosted agent carried the user's identity | 99.3% of tokens in the demo had no user attached, because the kagent-hosted agent used a workload key |
| Keycloak can replace our delegation service | Its delegation feature is a preview and single-step |
| Routing coding tools through a gateway is transparent | One of the gateway's Bedrock paths silently drops features Claude Code uses; the other path must be used |
| Agentregistry gives us versioned artifacts | Version 0.4.0 has no authentication by default and lets a version be overwritten; GitLab stays the source of truth |
| Langfuse can share our existing ClickHouse, and our ClickHouse contract may include Langfuse Enterprise | Langfuse needs a specific single-shard setup; Enterprise is sold on top of a ClickHouse commercial plan, and nothing public says a support contract includes it |
| Skills make workflows consistent | In the demo, a skill added one model call and the agent still varied the procedure; repeatable workflows need explicit definitions |
| AWS AgentCore's new runtime starts every session in about 2 seconds | True for cold starts of a test agent; a new session on a running runtime was slower than before in the one published test, and it runs in only five regions |
| Kiro's limits may be historical | It still cannot be routed through a gateway, and its telemetry is daily totals |

## Vendor facts to confirm in writing

| Vendor | Confirm |
|---|---|
| ClickHouse | Whether any agreement includes Langfuse Enterprise, and whether it runs on our own ClickHouse |
| Okta or Ping | Which token and agent features our licenses include |
| Solo.io | Prices for the Enterprise gateway and registry, if a trigger is met |
| AWS | Which Claude models Bedrock serves on the path Claude Code needs, in our regions |
| Apple | Supported way to point Xcode's agents at our gateway |

> **Go deeper**
> [Open decisions](../10-open-decisions.md) in the review has the full register, with evidence for each correction.

# Open decisions and questions for the organization

| | |
|---|---|
| Status | Open |
| Updated | 4 November 2026 |

## Questions that change the design

These eight answers change what is built. Everything else in this review
proceeds on stated assumptions.

| # | Question | Why it matters | Assumed until answered |
|---|---|---|---|
| Q1 | **Which IdP, and does the license include Okta API Access Management or Okta for AI Agents (or Ping custom resources or Identity for AI)?** | Decides whether Keycloak is needed as the authorization server, and whether chain-sts has a near-term replacement | Base tier only; Keycloak broker plus chain-sts |
| Q2 | **GitLab: self-managed (which version) or GitLab.com, and which tier?** | Service accounts on Free need 18.11; webhook signing needs 19.1; external status checks need Ultimate; project access tokens on GitLab.com need Premium | Premium-class licensing, recent self-managed version |
| Q3 | **Who carries 24x7 on-call for Keycloak and chain-sts?** | Tier-0 identity without on-call is a stop condition | The existing platform rotation |
| Q4 | **What data classes may be sent to Bedrock, stored in Langfuse, and processed outside the home region (global endpoints)?** | Sets content capture, retention, endpoint choice (global vs +10% regional) and whether Langfuse Enterprise is needed early | Internal code and documents allowed; no restricted data; global endpoints allowed |
| Q5 | **How many developers, what is current Kiro usage and spend, and are OpenAI models on Bedrock approved?** | Sizes inference and the harness decision; Codex is useful only with OpenAI models | 200 developers; OpenAI models not yet approved |
| Q6 | **Existing ClickHouse: sharded? version? timezone? And what does the ClickHouse agreement say about Langfuse?** | Langfuse needs single-shard, 25.12+, UTC; Enterprise is sold additive to a ClickHouse commercial plan | Dedicated single-shard cluster for Langfuse; no Enterprise entitlement |
| Q7 | **Is Istio running in the target clusters, ambient or sidecar?** | Decides whether "only the gateway may connect" is Istio policy or NetworkPolicy | NetworkPolicy; Istio where already present |
| Q8 | **Are macOS runners and a test Mac available to the platform team?** | Xcode native-agent gateway routing and the Xcode MCP server need validation on a Mac | One Mac available in phase 1 |

## Decision register

| ID | Decision | Options | Evidence that closes it | Proposed owner | Needed by |
|---|---|---|---|---|---|
| D-01 | Decision owner, budget, review dates | | Named person and budget | Engineering leadership | Phase 0 |
| D-02 | IdP integration | Keycloak broker (proposed); IdP as authorization server | Q1; the demo's section 1.5 conditions | Identity, platform, security | Phase 0 |
| D-03 | Owner of Keycloak, chain-sts and the reconciliation job | Platform team; identity team | Q3 | Identity, platform | Phase 0 |
| D-04 | Deactivation-to-refusal objective | A number (proposed 20 minutes) | Security requirement; REV-1 measurement | Security | Phase 0 |
| D-05 | Supported harnesses | Claude Code (proposed); plus Codex; Kiro future | Q5; phase 1 fidelity and cost per accepted task | Engineering leadership, platform | Phase 0, revisited after phase 1 |
| D-06 | Data classes and retention for prompts and outputs | | Q4 | Security, data governance | Phase 0 |
| D-07 | Bedrock endpoints and regions | Global (proposed); regional | Q4 | Security, platform | Phase 0 |
| D-08 | Langfuse storage | Dedicated single-shard ClickHouse (proposed); existing cluster for POC | Q6 | Data platform, platform | Phase 0 |
| D-09 | Whether a person may call an agent's route directly with their own token | Allow (as in the demo); require every agent call through a client app | Which clients need direct calls | Platform, security | Phase 2 |
| D-10 | Who approves delegation policy (which agent may act on which target) | Tool owner plus security for writes (proposed) | | Security | Phase 2 |
| D-11 | DR objective for tier-0 services | Rebuild in 4 hours (proposed); warm standby | Business objectives of the first agents | Platform, business owners | Phase 2 |
| D-12 | Tenant unit and multi-team people | Team as tenant; `teams` as an array claim | IGA and service catalog inventory | Identity, platform | Phase 2 |
| D-13 | Reference framework | ADK (proposed); Strands if the spike shows clear gains | Two-day spike | Platform | Phase 2 start |
| D-14 | Workflow runner for CI-shaped workflows | GitLab pipelines plus contract (proposed); Conductor | Workflow pilot | Platform, pilot team | End of phase 2 |
| D-15 | Dynatrace monitoring of added nodes | Full-Stack; Infrastructure-only; existing coverage | Dynatrace agreement and rates | Observability | Phase 1 |
| D-16 | Global rate limits | Per-replica local limits (proposed); Envoy rate-limit service with Valkey; Enterprise | Phase 1 traffic data | Platform | End of phase 1 |
| D-17 | Catalog front end | Generated index (proposed); Agentregistry OSS behind OIDC; Enterprise | Agentregistry authentication and immutability | Platform | Phase 3 |

## Vendor facts to confirm in writing

| Vendor | Question |
|---|---|
| ClickHouse | Does any current or proposed agreement include Langfuse Enterprise? Can Enterprise run on self-managed ClickHouse OSS? Can its non-disableable telemetry be blocked at egress? |
| Okta | API Access Management and Okta for AI Agents entitlements; the 250 ID-JAG per user per resource app monthly cap; RFC 8707 on token exchange; Kubernetes service-account tokens as client assertions |
| Ping | Which product is licensed (PingOne, PingFederate, Advanced Identity Cloud); Identity for AI SKU; nested `act` in PingOne core |
| Solo.io | Prices and license units for Enterprise agentgateway and agentregistry; what "global rate limiting is Enterprise-only" means given the OSS external rate-limit option; STS `act` nesting and JWKS |
| AWS | Which Claude models are served on Bedrock Mantle in the chosen regions; AgentCore V2 new-session latency on an existing runtime; snapshot-safe crypto reseeding (documentation conflict) |
| Anthropic | Claude Code feature behavior through a Messages-format gateway in front of Bedrock Mantle |
| Apple | Supported way to point Xcode's native Claude Agent and Codex at a gateway |

## Assumptions this review corrected

| Assumption in the brief or earlier notes | Finding |
|---|---|
| kagent's ADK support makes ADK the natural framework for kagent | kagent 1.x's engine is Go ADK; Python ADK runs only through a command override, without skills or MCP token passthrough |
| kagent and Substrate run on EKS because they run on Kubernetes | Substrate likely needs EKS 1.37 or later, privileged worker pods, and nested virtualization for microVMs; actors cannot use IAM roles for Bedrock |
| Agentregistry organizes and versions artifacts | 0.4.0 stores pointers, defaults to `latest`, allows replacing a tag, and ships without authentication |
| Langfuse can use the existing ClickHouse | Only if single-shard, 25.12+, UTC; not recommended for production |
| A ClickHouse contract may cover Langfuse Enterprise | Langfuse states Enterprise is additive to a ClickHouse commercial plan; nothing public says a support contract includes it |
| Keycloak can replace the custom STS | Keycloak delegation is preview, single-hop, and token exchange does not support `resource` |
| Routing a harness through the gateway preserves features | Agentgateway's Converse translation drops blocks Claude Code uses; Mantle or passthrough is required |
| Conductor provides durable, deterministic workflows | Step-boundary file checkpoints, no credential refresh, remote MCP only on two providers |
| Xcode works with any gateway | Xcode chat accepts only Chat Completions providers; native agents use separate configuration |
| AgentCore Runtime V2 starts new sessions in about 2 seconds | True for cold starts of echo agents; a new session on an existing runtime measured slower than V1 in the one published test; V2 runs in five regions |
| Kiro concerns may be historical | Gateway routing is still unsupported (documented); telemetry is daily metrics; Sonnet 5.x weighting still above list-price ratio |

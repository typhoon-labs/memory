# Build, reuse, buy or defer

| | |
|---|---|
| Status | Proposal |
| Updated | 4 November 2026 |

**Reuse** means it exists in the organization today. **Adopt** means new
open source, run by the platform. **Build** means organization-specific code
the platform owns. **Buy** means a commercial license. **Defer** means not
built until a named workload needs it.

| Area | Decision | Choice | Credible alternatives | Revisit when |
|---|---|---|---|---|
| Model provider | Reuse | Amazon Bedrock, global endpoints, through the gateway only | Direct Anthropic API through the gateway (same client format) | A required model or feature is not on Bedrock |
| Model, MCP and agent gateway | Adopt | Agentgateway OSS 1.7.x, Kubernetes mode, pinned, upgraded monthly | LiteLLM proxy (stronger cost tooling, weaker MCP and A2A); Envoy AI Gateway (Envoy-native, lags MCP spec); Kong AI Gateway (if Kong is already standard) | Monthly upgrades cost more than about 0.2 FTE, or a needed feature is Enterprise-only |
| Gateway Enterprise features | Defer, then buy if triggered | | Solo Enterprise for agentgateway: built-in global rate limits, budget CRD with alerts, STS delegation, OBO claim propagation, consent, LTS | Per-replica limits prove inaccurate; LTS needed; Solo STS passes the identity conformance suite |
| People | Reuse | Okta or Ping, licensed tier | | |
| Platform authorization server | Adopt | Keycloak 26.8.1 as IdP broker (realm as code, HA PostgreSQL) | Okta custom authorization servers (API Access Management add-on); Ping with custom resources | The add-on is licensed, there is one IdP, and nobody can staff Keycloak around the clock (`docs/production-design.md`, section 1.5) |
| Delegation exchange | Build (keep) | chain-sts, hardened: narrowing, explicit type, KMS signer, replay cache | Keycloak delegation (preview, single hop); Okta for AI Agents; Ping Identity for AI; Solo STS; AgentCore Identity | A product passes the conformance suite in [Identity profile](04-identity-profile.md) |
| Hosted execution | Reuse | Deployments, Jobs and GitLab CI jobs on EKS | | |
| Declarative agents | Defer | kagent, behind the gate in [Runtimes](12-runtimes.md) | Python template with a configuration file | kagent 1.0 GA and identity through the gateway works |
| Session runtime with snapshots, sandboxes | Defer | | Agent Substrate; agent-sandbox with gVisor RuntimeClass; AgentCore Runtime | A named workload needs per-session isolation or scale-to-zero sessions |
| AgentCore | Defer (exception only) | | | A workload meets the bar in [Runtimes](12-runtimes.md#when-agentcore-is-justified) |
| Reference framework | Adopt | Google ADK (Python) behind the shared package | Strands Agents (two-day spike first); LangGraph; Pydantic AI | The spike shows Strands is clearly simpler on MCP headers and A2A |
| Shared package | Build | `platform-agent-core` + ADK adapter: context, STS, clients, models, telemetry, storage, limits | Each team wires its own (inconsistent) | |
| Project templates | Adopt and build | Copier templates in GitLab | Cookiecutter (no updates); cruft (unmaintained since December 2024) | |
| Charts | Build | Base application chart and agent integration chart, separate releases | Umbrella chart | |
| Artifact store | Reuse | GitLab (source) and ECR (OCI, by digest, signed) | | |
| Catalog | Build (thin) | Generated index from catalog files in GitLab | Agentregistry OSS 0.4.0 as a read-only UI behind OIDC; Agentregistry Enterprise (auth, approvals, audit) | Agentregistry ships authentication and immutable versions, or Enterprise is bought for the gateway anyway |
| Org CLI | Build (thin) | Login, search, install, new, update, check, test; wraps `oras`, `cosign`, Copier, `glab`, harness CLIs | Agentdesktop (0.5.0, pre-1.0) for login and harness settings | Agentdesktop reaches 1.0 and removes CLI work |
| Workflow definition | Build (contract) | Typed YAML contract; GitLab pipelines and the Python template as runners | Conductor 0.1.x (pilot); ADK graph workflows | Conductor passes the pilot and solves credential refresh |
| Durable execution | Defer | | DBOS (library on PostgreSQL); Temporal; Restate; Step Functions | A workflow runs for hours with human waits |
| Coding harness | Reuse and standardize | Claude Code through the gateway; Codex if OpenAI models on Bedrock are approved | Kiro (no gateway routing) | Kiro supports custom endpoints, or measured cost per accepted task favors it decisively |
| Harness configuration | Reuse | Managed settings files through MDM, written by the org CLI | Agentdesktop | As above |
| Telemetry pipeline | Reuse | Existing OTel collector, two tiers, four streams | | |
| Operational backend | Reuse | Dynatrace | | |
| Agent tracing, evaluation, prompts | Adopt | Langfuse OSS 4.x on dedicated single-shard ClickHouse | Dynatrace AI Observability evaluations; Langfuse Cloud | A data class needs retention, audit or project roles (buy EE) |
| Langfuse Enterprise | Defer, then buy if triggered | | Langfuse EE with ClickHouse BYOC or Cloud | Triggers in [Observability](14-observability.md#when-to-buy-langfuse-enterprise) |
| Audit store | Build (thin) | Collector pipeline to S3 Object Lock and the SIEM | | |
| Usage ledger | Build (thin) | Gateway access logs to a table in the existing ClickHouse; monthly reconciliation with CUR | Gateway's own PostgreSQL analytics | |
| PostgreSQL | Adopt | CloudNativePG 1.30, Barman Cloud plugin backups | Amazon RDS or Aurora (less operating work, more cost) | The team prefers managed databases for tier-0 stores |
| Cache and counters | Adopt | Valkey 9.x | ElastiCache for Valkey | |
| Long-term agent memory | Defer | | ADK memory services, pgvector | A use case defines retention, deletion and permission rules |
| Vector index for helpdesk | Defer | Query-time search of each source with the user's identity | pgvector or OpenSearch with ACL metadata | Measured retrieval gaps |
| MR reviewer | Reuse and improve | Existing reviewer, moved behind the gateway, split into analyze and publish jobs | A persistent service | Reviews must run without pipelines |
| GitLab AI features (Duo) | Not needed | | | |

## What this leaves the platform to build

Only these are organization-specific code: chain-sts hardening (about 1,750
lines exist), the shared package and its ADK adapter, two charts, two
templates, the org CLI, the catalog generator, the conformance suites, and
collector pipelines. Everything else is configuration of reused or adopted
components.

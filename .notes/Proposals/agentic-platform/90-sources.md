# Sources

| | |
|---|---|
| Updated | 4 November 2026. Every source below was read on that date unless another date is given |

## Standards and specifications

| Source | Version or date |
|---|---|
| [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html) OAuth 2.0 Token Exchange (section 4.1 on `act`, 4.4 on `may_act`) | January 2020 |
| [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html) Resource Indicators | February 2020 |
| [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html) Authorization Server Metadata | June 2018 |
| [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html) JWT Profile for Access Tokens | October 2021 |
| [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) JWT Best Current Practices; [rfc8725bis](https://datatracker.ietf.org/doc/draft-ietf-oauth-rfc8725bis/) | February 2020; draft -10 |
| [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) OAuth 2.0 Security Best Current Practice | January 2025 |
| [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) Protected Resource Metadata; [RFC 9207](https://datatracker.ietf.org/doc/html/rfc9207) Issuer Identification | 2025; 2022 |
| [rfc7523bis](https://datatracker.ietf.org/doc/draft-ietf-oauth-rfc7523bis/) JWT client authentication | draft -11 |
| [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) | Revision 2026-07-28 |
| [MCP Enterprise-Managed Authorization](https://modelcontextprotocol.io/extensions/auth/enterprise-managed-authorization) | Stable 2026-07-28 |
| IETF drafts: [Identity Chaining](https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-chaining/) -17, [Transaction Tokens](https://datatracker.ietf.org/doc/draft-ietf-oauth-transaction-tokens/) -11, [ID-JAG](https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-assertion-authz-grant/) -06, [CIMD](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) -03 | As of 4 November 2026 |
| [OTel GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai) | Status "Development"; no tagged release |

## Identity products

| Source | Version or date |
|---|---|
| [Keycloak token exchange](https://www.keycloak.org/securing-apps/token-exchange), [features](https://www.keycloak.org/server/features), [MCP authorization server](https://www.keycloak.org/securing-apps/mcp-authz-server), [JWT authorization grant](https://www.keycloak.org/securing-apps/jwt-authorization-grant), [federated client authentication](https://www.keycloak.org/2026/01/federated-client-authentication) | 26.8.1 docs |
| [Keycloak 26.8.1 release](https://github.com/keycloak/keycloak/releases/tag/26.8.1) (CVE-2026-97846) | 13 October 2026 |
| [Okta token exchange](https://developer.okta.com/docs/guides/set-up-token-exchange/main/), [AI agent token exchange](https://developer.okta.com/docs/guides/ai-agent-token-exchange/authserver/main/), [Cross App Access](https://developer.okta.com/docs/guides/xaa-agent-to-app/main/), [org vs custom authorization server](https://support.okta.com/help/s/article/when-to-use-the-org-authorization-server-vs-a-custom-authorization-server-in-okta) | Current |
| [Ping Identity for AI release notes](https://developer.pingidentity.com/identity-for-ai/release-notes/idai-whats-new.html), [PingOne token exchange delegation](https://docs.pingidentity.com/pingone/use_cases/p1_oauth_2_token_exchange_delegation.md), [PingFederate 13.1](https://docs.pingidentity.com/pingfederate/13.1/release_notes/pf_release_notes_131.html) | Current |
| [EKS Pod Identity](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html), [service accounts](https://docs.aws.amazon.com/eks/latest/userguide/service-accounts.html) | Current |

## Gateway, registry and runtimes

| Source | Version or date |
|---|---|
| [Agentgateway releases](https://github.com/agentgateway/agentgateway/releases), [Bedrock provider](https://agentgateway.dev/docs/kubernetes/latest/integrations/llm/providers/bedrock/), [cost attribution](https://agentgateway.dev/docs/kubernetes/latest/documentation/llm/cost-controls/attribution/), issues #2798, #3184, #3523, #3616, #3708, #4098, #4143 | 1.7.0, 27 October 2026 |
| [Solo OSS vs Enterprise for agentgateway](https://docs.solo.io/agentgateway/kubernetes/latest/documentation/about/overview/) | 2026.10.x |
| [Agentgateway joins AAIF](https://aaif.io/blog/agentgateway-joins-aaif-as-an-open-gateway-for-agentic-ai-infrastructure) | 4 June 2026 |
| [Agentregistry v0.4.0](https://github.com/agentregistry-dev/agentregistry/releases/tag/v0.4.0), [docs](https://aregistry.ai/docs/about/about/), [Solo OSS vs Enterprise](https://docs.solo.io/agentregistry/latest/about/oss-enterprise/) | 3 August 2026 |
| [kagent](https://github.com/kagent-dev/kagent) at `e3b8079`, [kagent docs source](https://github.com/kagent-dev/website) at `1362909`, including [Amazon Bedrock](https://github.com/kagent-dev/website/blob/main/docs-site/content/kagent/1.x/setup/model-providers/amazon-bedrock.md) | 1.0.0-rc1, 3 November 2026 |
| [Agent Substrate](https://github.com/agent-substrate/substrate) at `17fa858` | 1.0.0-rc.2, 4 November 2026 |
| [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox) | 1.0.9 |
| [AgentCore developer guide](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/) (runtime how it works, V2 optimization, lifecycle, OAuth, VPC, observability, regions, limits) | Current |
| [AgentCore Runtime V2 announcement](https://aws.amazon.com/about-aws/whats-new/2026/09/new-agentcore-runtime-generally-available/) and AWS ML blog | 18 September 2026 |
| [AgentCore pricing](https://aws.amazon.com/bedrock/agentcore/pricing/) | Undated page |
| [Classmethod: AgentCore Runtime V2 tried](https://dev.classmethod.jp/en/articles/amazon-bedrock-agentcore-runtime-v2-tried/) | 19 September 2026 |

## Observability and data

| Source | Version or date |
|---|---|
| [Langfuse self-host pricing](https://langfuse.com/pricing-self-host), [license key](https://langfuse.com/self-hosting/license-key), [ClickHouse requirements](https://langfuse.com/self-hosting/deployment/infrastructure/clickhouse), [OpenTelemetry integration](https://langfuse.com/integrations/native/opentelemetry), [RBAC](https://langfuse.com/docs/administration/rbac) | 4.74.0 |
| [Langfuse acquisition announcement](https://langfuse.com/blog/announcing-acquisition), [ClickHouse acquires Langfuse](https://clickhouse.com/blog/clickhouse-acquires-langfuse-open-source-llm-observability) | 16 January 2026 |
| [ClickHouse Support Services Policy](https://clickhouse.com/legal/support-services-policy) | Effective 16 October 2026 |
| Dynatrace AI Observability and OTLP ingest docs; [rate card](https://www.dynatrace.com/pricing/rate-card/) | Docs 28 September 2026; rate card undated |
| [CloudNativePG releases](https://github.com/cloudnative-pg/cloudnative-pg/releases), [Barman Cloud plugin migration](https://cloudnative-pg.io/plugin-barman-cloud/docs/migration/) | 1.30.1, 23 September 2026 |
| [Valkey](https://github.com/valkey-io/valkey/releases), [Karpenter](https://github.com/aws/karpenter-provider-aws/releases), [Kyverno](https://github.com/kyverno/kyverno/releases) | 9.1.3; 1.15.1; 1.19.2 |
| AWS Price List API, offer `AmazonBedrockFoundationModels`, us-east-1 | Published 12 October 2026 |

## Harnesses, frameworks and workflow

| Source | Version or date |
|---|---|
| [Claude Code: LLM gateways](https://code.claude.com/docs/en/llm-gateway), Bedrock, model configuration, monitoring, GitLab CI/CD | 2.1.318 |
| Codex: [configuration](https://learn.chatgpt.com/docs/config-file/config-advanced), Amazon Bedrock, gateway compatibility, managed configuration | 0.166.0 |
| [Kiro pricing](https://kiro.dev/pricing), [models](https://kiro.dev/docs/models/available-models), [changelog](https://kiro.dev/changelog), [firewalls and proxies](https://kiro.dev/docs/privacy-and-security/firewalls), issues [#8939](https://github.com/kirodotdev/Kiro/issues/8939), [#10636](https://github.com/kirodotdev/Kiro/issues/10636) | IDE 1.4.62, CLI 3.0.0 |
| Apple: [Setting up coding intelligence](https://developer.apple.com/documentation/xcode/setting-up-coding-intelligence) (read through its documentation data), [Giving external agents access to Xcode](https://developer.apple.com/documentation/xcode/giving-external-agents-access-to-xcode), Xcode release notes | Xcode 27.2 |
| [Agentdesktop](https://github.com/agentdesktop-dev/agentdesktop) | 0.5.0, 23 October 2026 |
| [Agent Skills](https://agentskills.io), [Agent Plugins](https://vercel.com/blog/introducing-agent-plugins), [MCP Registry](https://github.com/modelcontextprotocol/registry) | Current |
| [microsoft/conductor](https://github.com/microsoft/conductor) at `f794e00` | 0.1.44, 1 November 2026 |
| [Google ADK](https://adk.dev) and PyPI `google-adk`, `google-adk-community` | 2.13.0; 0.5.0 |
| [Strands Agents](https://strandsagents.com), LangGraph, [Pydantic AI durable execution](https://pydantic.dev/docs/ai/integrations/durable_execution/overview/), Claude Agent SDK | 1.63.0; 1.2.19; 2.65.0; 0.2.178 |
| Temporal, Restate, DBOS | 1.32.2; 1.8.1; 3.4.0 |
| [Copier](https://copier.readthedocs.io), Cookiecutter, cruft | 9.19.1; 2.7.1; 2.16.0 |
| GitLab REST API: merge requests, discussions, draft notes, commit status, external status checks, CI job token, service accounts, webhooks | docs.gitlab.com, current |

## The demo

`/mnt/data/rocket/Projects/Work/Architecture/agentgateway-demo`, last commit
`cbc3ffb` (3 November 2026): `README.md`, `CONTRIBUTING.md`,
`docs/system-architecture.md`, `docs/production-design.md`,
`docs/contracts.md`, `docs/measurements.md`, the chain-sts and delivery-mcp
source, `agent-platform/` and `agent-deployments/`. Screenshots taken from
the running kind cluster on 4 November 2026.

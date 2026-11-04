# Agent platform: Glossary and sources

| | |
|---|---|
| Status | Reference |
| Owner | Platform architecture |
| Audience | Everyone |
| Updated | 4 November 2026 |

> **In short**
> - Terms used across these pages, in plain language.
> - The main sources, with the version or date checked. The full list is in the review.

## Glossary

| Term | Meaning |
|---|---|
| **Agent** | A program that uses an AI model to decide which tools to call to reach a goal |
| **Agentgateway** | The open-source gateway every model, tool and agent call goes through. A Linux Foundation (AAIF) project |
| **Agentregistry** | An open-source catalog of agents, tools and skills. Used, if at all, as a read-only listing |
| **A2A** | Agent-to-agent protocol: how one agent calls another |
| **Actor, current actor** | In a delegated token, the agent acting for the person. Only the newest one counts for access decisions |
| **AgentCore** | AWS's managed agent runtime and services. An exception here, not the default |
| **Agent Substrate** | The session runtime under kagent 1.x: snapshots each session and resumes it on a worker |
| **Approval binding** | An approval that covers the exact change and resource version, enforced by the tool that executes it |
| **Bedrock, Mantle** | AWS's model service; Mantle is its endpoint for the native Anthropic and OpenAI formats |
| **chain-sts** | Our small delegation service: gives an agent a short token naming the person and the agent, for one tool |
| **Conformance tests** | Automated tests every agent or identity product must pass; the platform's real rules |
| **Delegation** | An agent acting for a person, with both named. The opposite of impersonation |
| **GitOps** | Deploying by merging a change to a Git repository that a controller applies |
| **Harness** | A coding tool that runs an AI agent for a developer: Claude Code, Codex, Kiro, Xcode's agents |
| **kagent** | Open-source Kubernetes framework for declarative agents. Optional here |
| **Keycloak** | Open-source identity server; brokers Okta or Ping and issues platform tokens |
| **Langfuse** | Open-source tool for agent traces, evaluations and prompt versions |
| **MCP** | Model Context Protocol: how agents and coding tools call tools |
| **MCP server** | A tool exposed over MCP, owned by the team that owns the underlying system |
| **Release record** | The exact configuration of a deployment: image, charts, model, prompts, skills, permissions, evaluation result |
| **Resource indicator** | The `resource` parameter that names the one target a token is for (RFC 8707) |
| **Skill** | Written guidance (SKILL.md) an agent may load. Guides; does not enforce |
| **Token exchange** | Trading one token for another, narrower one (RFC 8693) |
| **Two-chart model** | A base chart for any app and a separate agent integration chart for agent apps |
| **Workload key** | A gateway key for a workload that cannot carry a person's token. A last resort: usage is not attributed to a person |

## Main sources

| Source | Version or date |
|---|---|
| Agentgateway releases and documentation (agentgateway.dev); Solo.io open-source vs Enterprise comparison | 1.7.0, 27 October 2026 |
| Keycloak token exchange and server features documentation | 26.8.1, 13 October 2026 |
| MCP authorization specification (modelcontextprotocol.io) | Revision 2026-07-28 |
| RFC 8693, 8707, 8414, 9068, 8725, 9700, 9728 | |
| kagent repository and documentation; Agent Substrate repository | 1.0.0-rc1; 1.0.0-rc.2 |
| AWS AgentCore developer guide, announcement and pricing; Classmethod's AgentCore Runtime V2 article | September to November 2026 |
| Langfuse self-hosting, pricing and RBAC documentation; ClickHouse acquisition announcements and support policy | 4.74.0; January and October 2026 |
| AWS Price List API, Bedrock foundation models, us-east-1 | Published 12 October 2026 |
| Claude Code, Codex, Kiro and Apple Xcode documentation | Versions on the technology page |
| microsoft/conductor repository; Google ADK; Copier | 0.1.44; 2.13.0; 9.19.1 |
| GitLab REST API documentation | Current |
| The agentgateway demo repository and a demo run | Commit `cbc3ffb`; run on 4 November 2026 |

> **Go deeper**
> [Sources](../90-sources.md) in the review lists every source with links.

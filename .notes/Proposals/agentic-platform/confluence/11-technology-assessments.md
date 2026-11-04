# Agent platform: Technology assessments

| | |
|---|---|
| Status | Reference. Checked against current documentation and code on 4 November 2026 |
| Owner | Platform architecture |
| Audience | Architects, platform engineers |
| Updated | 4 November 2026 |

> **In short**
> - Adopt: Agentgateway, Keycloak, Langfuse OSS, CloudNativePG, Valkey, Copier; keep and harden chain-sts.
> - Standardize: Claude Code through the gateway; Google ADK behind a shared package (after a short Strands comparison).
> - Defer or pilot only: kagent, Agent Substrate, AgentCore, Agentregistry as system of record, Conductor, Agentdesktop.

## Summary

| Component | Verdict | Version checked | Maturity | Main risk |
|---|---|---|---|---|
| Agentgateway | **Adopt** (open source) | 1.7.0 | Released monthly; Linux Foundation (AAIF) project | Behavior changes most months; one Bedrock path drops features |
| Keycloak | **Adopt** as broker and platform sign-in | 26.8.1 | Mature | Becomes a critical service we run |
| chain-sts | **Keep and harden** | 0.2.1 (ours) | Demo code, about 1,750 lines | Our own security code; replaceable by test |
| Agentregistry | **Defer** as system of record | 0.4.0 | Pre-1.0 | No authentication by default; overwritable versions |
| kagent | **Optional**, behind a gate | 1.0.0-rc1 | Release candidate | No AWS roles for Bedrock; console allows edits by default |
| Agent Substrate | **Defer** | 1.0.0-rc.2 | Release candidate | New operating model; sessions lost with their node |
| AWS AgentCore Runtime V2 | **Exception only** | V2 (September 2026) | Generally available, 5 regions | A second operating model to build and run |
| Langfuse | **Adopt** open source | 4.74.0 | Mature; owned by ClickHouse since January 2026 | Governance features (retention, audit, project roles) are Enterprise |
| Dynatrace | **Keep** for operations | Current | Existing | Ingest cost if prompt content is sent |
| Google ADK (Python) | **Adopt** as reference, behind a shared package | 2.13.0 | Fast releases | Some defaults tied to Google Cloud |
| Microsoft Conductor | **Pilot once** | 0.1.44 | Beta, one main maintainer | No credential refresh; not durable |
| Claude Code | **Standardize** | 2.1.318 | Mature | Needs the right Bedrock path through the gateway |
| Codex | **Second option** | 0.166.0 | Mature | OpenAI models only |
| Kiro | **Keep, measure** | IDE 1.4.62, CLI 3.0.0 | Mature | Cannot route through a gateway |
| Xcode coding agents | **Validate** | 27.2 | New | Gateway routing unconfirmed |
| Agentdesktop | **Evaluate later** | 0.5.0 | Pre-1.0 | Overlaps our CLI; another Solo.io dependency |
| CloudNativePG, Valkey | **Adopt** | 1.30.1, 9.1.3 | Mature | Restore must be tested, not assumed |
| Copier | **Adopt** for templates | 9.19.1 | Mature | |

## Details

<details>
<summary>Agentgateway</summary>

- Open source covers what we need first: sign-in checks for several issuers,
  per-tool rules, approved models, local rate limits, usage and cost per
  person, OTel, MCP sign-in metadata.
- Enterprise adds a built-in global rate limiter, budget alerts, its own
  delegation service, a consent screen and long-term support. Buy only if a
  trigger is met.
- For Claude models, use Bedrock's native Messages path (Mantle). The other
  path translates requests and drops document blocks, server tools and beta
  flags that Claude Code uses.
- Known issues to plan around: no key refetch on an unknown signing key (5
  minute delay); a USD budget is not enforced for a model without a price.
</details>

<details>
<summary>Keycloak and chain-sts</summary>

- Keycloak brokers Okta or Ping and issues tokens for platform audiences,
  which a base-tier Okta cannot. It accepts Kubernetes service-account tokens
  as client credentials.
- Its own delegation is a preview, single-step, and its token exchange does
  not support targeting one resource. So chain-sts stays, narrowly.
- chain-sts must add explicit token typing, narrowing of roles and scopes, a
  replay check, and a KMS signing key before production.
</details>

<details>
<summary>kagent and Agent Substrate</summary>

- kagent 1.x is a rewrite: no in-place upgrade from 0.x. Agents pair a
  template with a harness; sessions run as Substrate actors.
- Actors are not pods: no per-agent AWS role, so Bedrock only with a static
  API key, or through our gateway.
- Sessions are snapshotted every turn and lost if their node dies mid-turn;
  workers need elevated privileges; likely EKS 1.37 or later.
- The console allows any signed-in user to edit agents by default, and its
  chats go around an external gateway.
- Revisit at general availability, if a workload needs declarative agents.
</details>

<details>
<summary>AWS AgentCore Runtime V2</summary>

- One microVM per session, restored from a snapshot: about 2 s cold starts
  for any image size in AWS's test of a simple agent.
- In the one published independent test, a new session on an already running
  runtime was slower than before (1.9 s against 0.6 s, single run).
- Only 5 regions; arm64 only; at most 2 vCPU and 8 GB.
- Snapshot restore repeats values generated at start-up (random numbers, IDs,
  timestamps); code must be written for it.
- Justified only for a named workload that needs per-session isolation or
  bursty scale to zero.
</details>

<details>
<summary>Langfuse and ClickHouse</summary>

- Open source includes tracing, evaluations, datasets, prompts and SSO.
  Enterprise adds project roles, SCIM, retention, audit logs and protected
  prompt labels.
- Enterprise pricing is custom and "additive to your ClickHouse commercial
  plan". Nothing public says a ClickHouse support contract includes it.
- Needs single-shard ClickHouse 25.12 or later in UTC: a dedicated cluster for
  production.
- Applications must add a few attributes so traces are readable; the
  gateway's spans alone are not enough.
</details>

<details>
<summary>Frameworks and workflows</summary>

- Google ADK works on AWS behind the gateway; avoid its Google Cloud services
  (sessions, memory, storage). S3 artifact storage comes from our shared
  package.
- Strands Agents (AWS) may be simpler; a two-day comparison decides.
- Microsoft Conductor has typed inputs and outputs and bounded steps, but no
  credential refresh, remote tools only through two providers, and file-based
  checkpoints. Pilot it on one workflow.
- Durable workflow engines (Temporal, DBOS) wait until a workflow runs for
  hours with human waits.
</details>

<details>
<summary>Coding tools and Xcode</summary>

- Claude Code supports our gateway, managed settings that lock it to the
  gateway, skills, plugins, MCP and full telemetry.
- Codex supports gateways that offer the OpenAI Responses API, OpenAI models
  only.
- Kiro bills credits only, cannot use a custom endpoint, and reports daily
  totals. Its Sonnet 5.x credit weighting is about 50% above the list-price
  ratio.
- Xcode's chat accepts custom providers in the Chat Completions format;
  Xcode's agents use their own configuration folders. Both need a test on a
  Mac.
</details>

> **Go deeper**
> In the review: [Gateway and registry](../11-gateway-and-registry.md), [Runtimes](../12-runtimes.md), [Observability](../14-observability.md), [Frameworks and charts](../15-frameworks-and-charts.md), [Developer harnesses](../16-developer-harnesses.md), [Workflow automation](../05-workflow-automation.md).

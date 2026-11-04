Act as a platform architect and critical technical reviewer. Help me design an enterprise agentic platform on AWS.

This is an exploratory architecture exercise. Challenge assumptions, verify capabilities against current primary sources, and explain tradeoffs before recommending a design. Distinguish documented capabilities, observed behavior, proposals, and unresolved questions.

Start with a recommendation based on the available context. Ask only questions that materially affect the design, and continue with explicit assumptions where reasonable.

## Objectives and organizational context

We want to:

- Enable rapid development of agents, MCP servers, and repeatable agentic workflows.
- Centralize identity, authorization, model access, usage attribution, and observability.
- Support familiar developer coding harnesses.
- Prefer OSS projects and portable interfaces.
- Minimize total ownership cost, including licensing, infrastructure, engineering, maintenance, training, and on-call.
- Provide one supported development path while allowing independently maintained alternatives.
- Keep commercial upgrade paths available without assuming products are interchangeable simply because they implement the same protocols.

Our environment:

- Amazon Bedrock is our existing and preferred model provider.
- Kubernetes/EKS is our preferred execution platform.
- Our developers and platform engineers are familiar with building, deploying, debugging, and maintaining Kubernetes applications.
- We want to reuse those skills, our infrastructure, and Reserved Instance/Spot economics.
- We use GitLab Enterprise without its paid AI capabilities.
- Our GitLab runners execute in EKS.
- We already have a custom merge-request reviewer.
- We use an OTel collector and Dynatrace.
- We already use ClickHouse for other applications.
- Our developers include iOS engineers using Xcode.
- We currently use agent skills to describe workflows, but implementation and execution can be inconsistent.

Treat developer familiarity and operational consistency as explicit architectural criteria.

## Existing capability demo

Inspect this repository:

`~/Projects/Work/Architecture/agentgateway-demo`

Read its repository instructions, architecture documentation, and relevant implementation.

The demo illustrates capabilities; it is not a mandated architecture or proof of production readiness. Identify useful patterns, limitations, and differences between its documented design and implementation.

Do not modify files, deploy infrastructure, install dependencies, or change external systems during this review.

## Proposed platform areas

### 1. Identity, authorization, and delegation

Evaluate:

- An external enterprise IdP such as Okta or Ping using existing or minimal licensed capabilities.
- Keycloak as an identity broker and platform authorization server.
- A narrowly scoped custom STS for agent delegation where existing capabilities are insufficient.
- Verified user identity, current actor identity, and delegation history for audit.
- Resource-specific tokens, least privilege, and prevention of unauthorized delegation.
- Eventual replacement of custom STS functionality with a commercial offering.

Do not assume a custom STS reproduces every capability of premium identity or agent-governance products.

Compare current Keycloak functionality, custom implementation, and relevant commercial alternatives against concrete requirements.

Define a supported interoperability profile, including applicable portions of:

- RFC 8693 token exchange and delegation semantics.
- RFC 8707 resource indicators.
- RFC 8414 authorization server metadata.
- RFC 9068 JWT access-token profile, if adopted.
- RFC 8725 JWT security guidance.
- RFC 9700 OAuth security guidance.
- The applicable MCP authorization specification.

Distinguish required standards, optional profiles, and implementation-specific policies. Review the permitted use of current versus historical actor claims.

Address:

- User, workload, automation, and delegated identities.
- Canonical identity across issuers.
- Kubernetes service-account authentication versus AWS credentials.
- Role changes, offboarding, expiration, revocation, and session termination.
- Key rotation, caching, clock skew, and issuer outages.
- Long-running tasks whose original credentials expire.
- Downstream business authorization and approval enforcement.

Define executable interoperability tests for any future STS replacement.

### 2. Agentgateway

Evaluate Agentgateway for:

- Approved model, agent, and MCP access.
- Authentication and coarse authorization.
- Attribution to users, teams, workloads, applications, workflows, and models.
- Budgets, rate limits, concurrency controls, and runaway-task limits.
- Cost accounting and reconciliation with provider billing.
- Gateway bypass prevention.
- Protocol compatibility, streaming, and provider-specific features.

Clearly distinguish OSS and commercial capabilities.

Explain which controls belong in the gateway, mesh, identity services, applications, and tools. Avoid overlapping policy systems without a reason.

### 3. Agentregistry and artifact distribution

Our current central GitLab repository contains shared skills and agents from different teams, but discovery is cluttered and artifact versioning is inconsistent.

Evaluate Agentregistry for organizing and distributing:

- Agents.
- MCP servers.
- Skills.
- Shared prompts.
- Plugins and workflow artifacts where supported.

Keep GitLab as the source of truth. Define:

- Ownership and support status.
- Immutable releases and version/digest pinning.
- Provenance, review, and compatibility metadata.
- Required tools and permissions.
- Evaluation evidence.
- Update, rollback, deprecation, and retirement processes.
- Installation into supported local harnesses.

Do not assume the registry natively supports every artifact type or harness. Verify capabilities and identify necessary adapters.

Keep installed artifacts and deployed applications operational during registry outages where practical.

Explore a thin organization-specific CLI for login, discovery, installation, project generation, configuration checks, and conformance testing. Reuse existing CLIs/APIs rather than rebuilding them.

### 4. Hosted execution and runtime selection

Treat these as the primary execution candidates:

1. Conventional Kubernetes applications.
2. kagent and Agent Substrate.

Verify kagent’s current:

- Declarative agent support.
- Python/Go runtimes and ADK integrations.
- STS behavior.
- Hosted coding-harness support.
- Sandbox options and maturity.
- Networking, persistence, suspension/resumption, and recovery behavior.

Distinguish gVisor, microVM support, and Kata-related implementation details. Validate EKS requirements rather than assuming container portability guarantees compatibility.

Assess where kagent introduces unfamiliar operational behavior despite running on Kubernetes.

### 5. AgentCore as an optional exception

We prefer OSS and EKS rather than adopting AgentCore as the default runtime. However, retain the option to use specific AgentCore capabilities for justified workloads, potentially behind Agentgateway.

Evaluate:

- Gateway-to-AgentCore integration.
- User/delegated identity preservation versus AWS invocation authentication.
- Outbound model/tool routing and enforcement.
- Network access, telemetry, persistence, and portability.
- Runtime v1/v2 behavior and current regional availability.
- Deployment readiness, new-session latency, resumed-session latency, and end-to-end latency.
- Snapshot-safe initialization, credential refresh, unique identifiers, mutable configuration, and connection recovery.

Review this article and verify its conclusions against current AWS documentation:

https://dev.classmethod.jp/en/articles/amazon-bedrock-agentcore-runtime-v2-tried/

Treat published measurements as evidence about their tested conditions, not guarantees.

Supporting AgentCore would require additional scaffolding, pipelines, adapters, tests, runbooks, training, and maintenance. Include those costs.

Do not equate gateway connectivity or container portability with operational interchangeability. Recommend AgentCore only where a concrete workload justifies a second operating model. Avoid building its scaffolding speculatively.

### 6. Kubernetes infrastructure and storage

Evaluate appropriate use of:

- EKS.
- Istio.
- Karpenter.
- Kyverno.
- CloudNativePG.
- Redis or Valkey.
- Existing ClickHouse infrastructure.
- S3/object storage.

Define responsibilities and failure domains.

For EKS economics:

- Distinguish committed capacity from incremental cost.
- Consider utilization and opportunity cost rather than treating existing capacity as free.
- Use Spot where interruption recovery is acceptable.
- Identify services requiring stable capacity.
- Test checkpointing, retry, idempotency, node disruption, and runtime recovery.

For shared data services, evaluate credentials, tenant isolation, capacity contention, eviction, maintenance, backups, restore testing, and blast radius.

Distinguish conversation history, durable workflow state, artifacts, caches, and long-term memory. Avoid assuming one shared store or universal memory abstraction fits all applications.

### 7. Observability, audit, and accounting

Use our OTel collector as the integration point.

Evaluate:

- Sampled operational telemetry to Dynatrace.
- Detailed agent tracing, evaluations, and prompt management in Langfuse.
- Instrumentation across local harnesses, gateways, agents, tools, workflows, and hosted runtimes.
- Trace correlation and identity attribution.
- Sampling placement, buffering, delivery failures, redaction, retention, and access controls.

Separate:

1. Operational tracing.
2. Security and action audit records.
3. Usage and billing accounting.
4. Agent quality/evaluation records.

Do not assume gateway traffic alone provides complete workflow visibility, or that OTel export guarantees compatibility with Langfuse’s data model.

Verify Langfuse OSS limitations, including RBAC, API-key scope, management APIs, retention controls, and audit features. Evaluate workable OSS tenancy arrangements and Enterprise upgrade paths.

Verify ClickHouse/Langfuse commercial terms. Do not assume an existing or future ClickHouse support contract automatically includes Langfuse Enterprise.

### 8. Rapid development and supported frameworks

Provide three development paths:

1. Declarative kagent agents for simple use cases.
2. A supported Python application template for more complex agents and MCP servers.
3. Independently maintained implementations that satisfy the platform contract.

Evaluate Python ADK as the initial supported framework and reference implementation. Assess AWS suitability rather than assuming it requires GCP. Compare alternatives only where they could materially improve the decision.

Avoid maintaining many first-class framework integrations.

Consider a small shared package with separate framework adapters for:

- Identity and tenant context.
- STS exchange and correctly isolated token caching.
- Authenticated MCP/A2A clients.
- Model gateway configuration.
- Telemetry and redaction.
- Session/storage integration.
- Timeouts, cancellation, and bounded retries.

Keep application business logic out of the shared package.

Generate projects through GitLab pipelines and versioned templates using Cookiecutter or another justified approach. Address updates and migrations for existing projects, not only initial scaffolding.

### 9. Required two-chart deployment model

Our generated Kubernetes applications should use two separately versioned Helm chart packages.

**Base application chart**

- Supports agentic and non-agentic applications.
- Owns conventional application deployment resources.
- Remains independent of evolving agent-platform CRDs.

**Agent integration chart**

- Adds the resources and bindings required for agentic workflows.
- Isolates dependencies on evolving platform APIs.
- Can evolve without forcing unrelated changes to the base chart.

Regular applications use only the base chart. Agentic applications compose both where appropriate.

Evaluate:

- Separate Helm releases versus umbrella packaging.
- Independent upgrades, rollback, installation order, and cleanup.
- Explicit resource ownership.
- A minimal versioned interface between the charts.
- Compatibility across charts, controllers, and CRDs.
- Central ownership of CRD definitions and shared controllers.
- Adoption by existing applications.
- Cases where kagent/Substrate owns execution and a conventional Deployment is unnecessary.
- Distribution of integration-chart upgrades through GitLab tooling.

Preserve the boundary between stable application deployment and evolving agent integrations.

### 10. Developer harnesses

We currently use Kiro and have concerns about:

- Credit-based economics relative to API token pricing.
- Model choice and availability.
- Custom inference endpoints and gateway routing.
- Observability.
- Stability and consistency across surfaces.
- Portable instructions and workflow artifacts.

Revalidate these concerns against current versions. Distinguish internal observations from documented limitations and historical behavior.

Prefer familiar harnesses supporting portable project instructions, skills, MCP, configurable gateways, and useful telemetry. Evaluate a small set of candidates, including Codex and Claude Code, with Agentdesktop as a possible configuration-management tool.

Distinguish API billing from subscription authentication and pricing. Compare cost per accepted task, including retries and developer intervention.

Verify actual local/editor workflows, particularly for Xcode. Do not assume CLI support provides equivalent native integration.

### 11. Standardized workflow automation

We currently express workflows through agent skills, but implementation and execution can be inconsistent.

Evaluate Microsoft Conductor:

https://github.com/microsoft/conductor

Explore explicit, versioned workflows with:

- Typed inputs and outputs.
- Defined dependencies and branching.
- Deterministic script/tool steps.
- Bounded model-driven steps.
- Parallel execution where useful.
- Timeouts, cancellation, and failure paths.
- Human approvals.
- Validation, testing, and telemetry.

Distinguish skills, orchestration, tools, platform enforcement, and durable execution.

Verify Conductor’s compatibility with:

- Bedrock through Agentgateway.
- Remote MCP and STS.
- Credential refresh.
- GitLab runners and local execution.
- OTel.
- Provider-specific capability differences.
- Checkpointing and interruption recovery.

Assess additional SDK/framework maintenance burden. Do not assume deterministic routing guarantees deterministic outputs, durable recovery, or safe retries.

Compare Conductor with a straightforward GitLab pipeline or application implementation. Consider a durable workflow engine only where demonstrated requirements justify it.

Pilot one inconsistent existing skill workflow before recommending organization-wide adoption.

## Priority use cases

Use these to test the architecture rather than reviewing components in isolation.

### GitLab MR reviewer

Explore incremental improvement of our existing reviewer through shared model access, identity, telemetry, evaluations, and deployment tooling.

Compare runner-based jobs with a persistent service. Address:

- Incremental and stale reviews.
- Commit-specific results.
- Duplicate findings/comments.
- Cancellation and retries.
- Untrusted repository content.
- Separation of analysis from comment publishing.
- Narrow GitLab credentials.
- Actionable findings, false positives, developer acceptance, and cost.

Do not assume GitLab’s paid AI features are required. Verify the APIs and license entitlements actually needed.

### Developer helpdesk

Explore permission-aware answers and tools for:

- Service ownership and runbooks.
- Documentation and repository discovery.
- CI failures.
- Deployment status.
- Onboarding and access-request guidance.
- Evidence-backed escalation.

Start read-only. Address source authority, freshness, citations, conflicting documentation, deletions, and permission changes.

### Platform engineering assistant

Explore Kubernetes diagnosis, release investigation, incident summaries, and bounded remediation using tools similar to the demo.

Separate investigation from writes. Define precise approvals tied to action parameters and resource versions, enforced by the executing tool.

### iOS development with Xcode

Explore code changes, build/test diagnosis, MR preparation, and review.

Distinguish work suitable for EKS from work requiring macOS, Apple tooling, signing credentials, simulators, or physical devices. Verify integration options and execution boundaries.

### Additional use cases

Suggest a small number grounded in our environment. Explain why shared platform capabilities improve each over an existing tool or standalone script.

## Cross-cutting requirements

Address:

- Platform, application, tool, and data ownership.
- Support boundaries and on-call.
- Tenant and environment isolation.
- Permission-aware knowledge retrieval.
- Prompt injection through code, documents, logs, and tool responses.
- Artifact provenance and release reproducibility.
- Model lifecycle and controlled configuration changes.
- Durable task identifiers, retries, cancellation, deadlines, and recovery.
- Approval expiration and revalidation before execution.
- Service objectives, degraded operation, backup/restore, and disaster recovery.
- Dependency and CRD upgrade strategy.
- Cost attribution, quotas, and runaway execution.
- Adoption, support burden, and measurable business value.

Define framework-independent conformance tests. SDK adoption, templates, and prompt instructions are helpful defaults, not enforcement.

Record the complete deployed configuration: application image, chart versions, framework/shared package versions, model configuration, prompts, skills, workflow definitions, permissions, and evaluation results.

## Requested output

Produce a practical architecture review containing:

1. **Recommendation and assumption corrections**, with evidence and uncertainty.
2. **Architecture diagram and responsibility boundaries.**
3. **Build/reuse/buy/defer decisions**, including credible alternatives.
4. **Developer lifecycle**, from local development and scaffolding through deployment, debugging, upgrades, and retirement.
5. **Identity/interoperability profile and executable conformance requirements.**
6. **Workflow automation recommendation**, including Conductor’s fit and limitations.
7. **Use-case assessments and pilot ordering.**
8. **Operating model**, ownership, service objectives, isolation, and recovery.
9. **Cost model** with explicit assumptions and sensitivity to utilization, inference, telemetry, and staffing.
10. **Phased implementation plan with measurable acceptance criteria.**
11. **Open decisions and focused questions requiring organizational input.**

Use current official documentation, upstream code, and relevant standards. Cite material claims, identify versions, and date commercial information. Do not infer contractual entitlements from marketing language.

Keep the design proportional to demonstrated needs. Recommend the minimum useful platform first, while making future expansion and replacement practical.
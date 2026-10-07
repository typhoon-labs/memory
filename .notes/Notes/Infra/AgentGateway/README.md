# EKS agent platform architecture exploration

Status: Draft option under evaluation. Updated 5 October 2026. No pilot results recorded.

These notes explore a platform built around Agentgateway and our existing EKS infrastructure. The goal is to make approved tools and models easy to consume, let service teams publish capabilities independently, and provide hosted agent execution where it is useful. Lower total cost, easier debugging, and reduced maintenance are hypotheses to measure.

This is a clean-sheet design. It shares document organization with the [AgentCore option](../AgentCore/README.md) so reviewers can compare requirements and evidence. Its component placement, repositories, and delivery process are independent proposals. The [comparison basis](../README.md) lists the requirement values, pilot workload, experiments and scorecard that both options must share. Neither option has been selected by these notes.

The directory is named for Agentgateway, the proposed connectivity layer. The notes call the option as a whole the EKS agent platform, because discovery, hosted execution and delivery are part of it too.

## Developer workflows

| Workflow | Developer changes | Platform provides |
|---|---|---|
| Consume tools or models from an existing client | Client connection settings and access request where necessary | Supported endpoints, Okta integration, permissions and diagnostics |
| Publish a service capability | Existing service repository, MCP adapter or service guidance | Packaging, discovery, gateway integration and optional hosting |
| Run a hosted agent | Agent implementation or native declarative configuration | Supported execution profile, identity, telemetry and deployment conventions |

Hosted execution is not required for the first two workflows. A service can publish only skills and prompts, or register an existing remote tool service. Agent teams decide when to adopt published content.

## Reading guide

| Document | What it helps us decide |
|---|---|
| [Architecture option](architecture-option.md) | Workflows, capability placement, component choices and alternatives |
| [Repository structure](repository-structure.md) | Source ownership, environment selection and deployment authority |
| [Foundation and services](foundation-and-services.md) | Existing cluster dependencies, capacity, persistence and identity infrastructure |
| [Identity and authorization](identity-and-authorization.md) | User/workload identity, model access, delegation, tool permissions and bypass prevention |
| [Workload deployment](workload-deployment.md) | Existing clients, MCP hosting, conventional containers and kagent/Substrate |
| [Skills and prompts](skills-and-prompts.md) | Independent publication, integrity, adoption and retirement |
| [Release and promotion](release-and-promotion.md) | Minimal delivery process, proportional checks and rollback |
| [Evaluations and operations](evaluations-and-operations.md) | Debugging, OTel, optional Langfuse, quality checks and incidents |
| [Costs](costs.md) | Incremental and allocated cost, capacity and operating effort |
| [Worked examples](worked-examples.md) | Complete proposed developer and service-owner journeys |
| [Validation plan](validation-plan.md) | Requirements, pilot bounds, experiments and scorecard evidence |
| [Comparison basis](../README.md) | What this option and AgentCore must hold identical to be compared |

## Existing environment

The supplied environment includes EKS, Istio, Kyverno, Karpenter, CloudNativePG, OpenTelemetry with New Relic or Dynatrace, Helm/Helmfile, Terraform/OpenTofu/Terragrunt, Okta, GitLab.com Ultimate for source control and CI with self-hosted runners in the EKS cluster, and ECR for images and Helm charts. Reuse these capabilities before introducing replacements. Their actual versions, topology, available capacity, licensing and configuration have not been inspected in this exploration.

The supplied list does not name the secret delivery mechanism, the network policy engine or the model providers, and does not say whether New Relic or Dynatrace is the operational backend. The design depends on each of them; [foundation and services](foundation-and-services.md) lists what the inventory must record.

Agentgateway is the proposed connectivity layer. Agentregistry is a candidate discovery service. kagent with Agent Substrate is a candidate hosted runtime. Langfuse is optional for prompt and evaluation workflows. The [validation plan](validation-plan.md) determines whether these additions justify their integration and operating cost.

## Terms

| Term | Meaning in these notes |
|---|---|
| Selection | The artifact digest and configuration that environment configuration names for one workload in one environment. A selection merge request (MR) changes it; promotion selects the same artifact in the next environment. |
| Binding | Environment-specific configuration that connects a component to an endpoint, identity, tool, model or data store. |
| Candidate | A release-specific copy of a workload or route, deployed beside the active one to test a higher-impact change before activation. |
| Profile | A reviewed default configuration for a supported runtime or gateway pattern. It is an example to copy, not a new API. |
| Static consumer | A client or agent whose endpoints and content are resolved when it is configured or released, so it does not call the catalog per request. |
| Tenant | The boundary that data and permissions must not cross. The notes do not yet fix whether that is an internal team, a customer organization or both; it is a requirement to agree in the [validation plan](validation-plan.md). |
| Harness, AgentTemplate, Agent, Revision, Session | kagent 1.x resources. A Harness defines how an agent is allowed to run and an AgentTemplate what it does; an Agent pairs one of each; a Revision is the compiled, immutable output of an Agent; a Session is a running conversation with one Agent. |
| Actor, worker | Agent Substrate terms. An actor is the sandboxed unit of compute that runs a session's conversation loop; workers, grouped in pools, host actors. |

## Documentation conventions

Proposed repository names are `agent-platform` and `agent-deployments`; the latter may instead be directories in an existing cluster configuration repository. No repositories or infrastructure are created by these notes.

Examples describe intended internal workflows, not verified deployment commands or schemas. Sources establish component capabilities only within their documented versions; a source link does not prove compatibility between components. Record exact versions and observed behavior during the pilot, then add executable examples and operating runbooks. Create an architecture decision record when evidence supports selection, deferral or rejection.

A caveat that applies to several notes is stated once and linked from the others: kagent generations in [workload deployment](workload-deployment.md#execution-choices), production writers in [configuration authority](repository-structure.md#configuration-authority), and bypass controls in [foundation and services](foundation-and-services.md#bypass-enforcement-candidates).

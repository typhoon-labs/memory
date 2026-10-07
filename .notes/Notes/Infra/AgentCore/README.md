# AgentCore architecture exploration

Status: Draft option under evaluation. Updated 5 October 2026.

These notes explore an AWS AgentCore platform managed through Terraform and Terragrunt. The purpose is to decide whether its security, release model, operating cost, and team ownership fit our requirements. This is one architecture option; documenting it does not select it for implementation.

The proposed approach separates reusable platform implementation, deployed configuration, and component releases. Component teams can publish agents, MCP servers, or only skills and prompts. A service team publishing content does not need to deploy an agent or MCP server.

## Reading guide

| Document | What it helps us decide |
|---|---|
| [Architecture option](architecture-option.md) | Platform boundaries, identity, release ownership, and tradeoffs |
| [Repository structure](repository-structure.md) | Repository responsibilities and standalone content publishing |
| [Foundation and platform services](foundation-and-services.md) | Accounts, state, network, encryption, IAM, and shared resource ownership |
| [Identity and authorization](identity-and-authorization.md) | Connection authentication, delegated access, claims, policies, and isolation |
| [Workload deployment](workload-deployment.md) | Module contracts, harness/runtime choices, gateways, memory, and candidate lifecycle |
| [Skills and prompts](skills-and-prompts.md) | Service-only publication, package contracts, integrity, adoption, and retirement |
| [Release promotion and rollback](release-and-promotion.md) | Evidence, mutable-field ownership, activation, retries, and failure recovery |
| [Evaluations and operations](evaluations-and-operations.md) | Telemetry export, release gates, monitoring, costs, drift, upgrades, and incidents |
| [Costs](costs.md) | Price inventory, per-session cost model, illustrative totals, and what is not priced |
| [Worked examples](worked-examples.md) | Concrete publishing, adoption, MCP, failed-candidate, rollback, and upgrade flows |
| [Validation plan](validation-plan.md) | Open questions, experiments, and evidence needed to select this option |
| [Comparison basis](../README.md) | What this option and the [EKS agent platform option](../AgentGateway/README.md) must hold identical to be compared |

## Working agreements

The repository names are agreed for this exploration:

- `agentcore-platform` holds reusable infrastructure and platform implementation.
- `agentcore-deployments` declares deployed resources and release selections by account and environment.

Source control and CI are GitLab.com Ultimate: changes are proposed as merge requests and pipelines run in GitLab CI/CD on self-hosted runners in the existing EKS cluster. Container images go to ECR. The GitLab package registry may hold packages that only pipelines read; artifacts that AWS principals read stay in S3 or ECR, as set out in [foundation and services](foundation-and-services.md#platform-services-and-resource-ownership). Ultimate includes the Code Owner, protected environment and deployment approval features these notes rely on.

The stated observability direction is OpenTelemetry with New Relic or Dynatrace as the primary backend. Vendor selection and export topology remain open; AWS telemetry needed for managed services and AgentCore evaluations is addressed in [evaluations and operations](evaluations-and-operations.md).

The remaining choices are proposals. Account topology, runtime versus harness, gateway boundaries, identity propagation, provider versions, and approval mechanisms remain subject to evaluation.

## Documentation approach

Keep the main option readable by architecture reviewers and service owners. The detailed notes explain implementation boundaries and proposed contracts; worked examples connect them into end-to-end flows. The validation plan records what still needs demonstration. Label proposed behavior separately from documented service capabilities and demonstrated behavior.

Once experiments produce evidence, record results and update the option. Write an architecture decision record only when we actually choose, reject, or defer an option. The module and YAML examples here are proposed internal contracts, not executable implementations. Tested provider blocks and final deployment runbooks should follow the pilot.

## Questions for the next discussion

1. Is the primary need hosting agents, governing tools, distributing service guidance, or all three?
2. Which existing service and consumer can provide a realistic pilot?
3. Which operations require the end user's delegated permissions?
4. What must remain unchanged when a candidate fails, and what rollback time is acceptable?
5. Which alternatives should we compare against the same requirements?

The initial design supplied for discussion, which is not included in this directory, described a broader platform with shared registries, evaluators, gateways, and publishing modules. These notes retain that direction while treating its stronger guarantees as hypotheses to test.

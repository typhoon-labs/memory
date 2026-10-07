# EKS agent platform skills and prompts

Status: Proposed content workflow. Updated 5 October 2026. [Notes index and terms](README.md)

A service team can publish guidance for its API without running an agent or MCP server. Keep content in the service repository when ownership aligns. The platform provides packaging and optional discovery; consumers decide when to adopt a version.

## Package contract

| Content | Publisher declares | Consumer checks |
|---|---|---|
| Skill instructions/references | Task, required capabilities and supported API versions | Fit with its tools, permissions and runtime |
| Prompt template | Variables, size/sensitivity constraints and expected output | Rendering and full-agent behavior |
| Optional scripts | Execution requirements and code provenance | Permitted execution and dependency review |
| Package metadata | Owner, immutable reference, hashes and compatibility | Integrity and exact dependency selection |

Use the smallest packaging format supported by selected consumers. ECR (as OCI artifacts) or S3 may hold bytes, and the GitLab package registry may hold bundles that a consumer's pipeline bakes into its image; Agentregistry may hold discoverable metadata. Establish which component stores versus references content. Do not require a custom manifest schema when upstream metadata and artifact digests suffice.

Scripts are code dependencies and run with the consumer's effective credentials. Review them as code and allow consumers to reject script-bearing bundles. Guidance cannot grant tool permissions or create an authenticated API connection.

## Publication process

1. Update guidance and compatibility information in the service repo.
2. Validate links, prompt variables, instructions and scripts against fixtures.
3. Publish an immutable version with source provenance and content identity.
4. Publish/update catalog metadata through the assigned workflow if a catalog is adopted.
5. Let consumers select the version and run their own checks.

Content-only publication creates no agent, gateway, database or worker. If catalog publication fails after upload, retry metadata publication without rebuilding or changing the bytes. Keep incomplete packages unavailable for adoption.

Agentregistry supports discovery of skills and prompts alongside agents and MCP services. Validate its exact package formats, authentication and lifecycle with our consumers before standardizing them. [Agentregistry](https://github.com/agentregistry-dev/agentregistry)

## Consumer adoption

Pin versions/digests in component source. Resolve mutable tags or Git branches before release, and record the selected immutable identity. A catalog update can notify an owner or propose an update merge request (MR); it does not silently change running agents.

Consumers may bake content into an image or load pinned artifacts through supported runtime mechanisms. Prove integrity checks, startup failure behavior and content caching for the chosen path. If runtime fetching is used, a deployment reference alone does not ensure bytes remain unchanged.

Choose one authority for deployed prompts. Langfuse can be an authoring/evaluation workspace if adopted, but a mutable prompt label must not silently override a source-controlled production selection. Define a publish/snapshot step or a verified immutable prompt-version contract.

## Compatibility and evaluations

Publisher tests establish that service instructions match API behavior. Consumer tests establish task outcomes, tool selection and interaction with other instructions. Neither replaces downstream authorization.

Treat changed variables, output expectations, required tools, API versions and execution assumptions as compatibility changes. Inject user/service data as data, not instructions. Include invalid input, missing permissions and unavailable services in representative scenarios.

## Retirement and incident response

Keep supported versions while consumers reference them. Identify consumers before removing an API/content version. Catalog withdrawal stops new discovery only; downloaded content may remain usable, and withdrawal revokes no credentials (see [acceptance and revocation](identity-and-authorization.md#acceptance-and-revocation)). For unsafe guidance, stop new adoption, identify deployed consumers and use explicit access/execution controls where needed, then publish a corrected immutable version.

Artifact cleanup examines deployment pins and agreed rollback/audit retention. Security revocation may supersede ordinary retention for executable content, but must follow the incident procedure and account for currently running sessions.

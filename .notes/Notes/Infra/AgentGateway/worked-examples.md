# EKS agent platform worked examples

Status: Illustrative proposed workflows. Updated 5 October 2026. [Notes index and terms](README.md)

These examples connect source ownership, artifact publication, deployment and debugging. Component names and versions are hypothetical. No commands, deployments or test outcomes have been demonstrated. Convert the selected examples into verified instructions during the pilot.

## A developer consumes a payments lookup tool

The developer uses an existing supported client. They find the payments capability in the catalog or initial documentation, configure its gateway endpoint and authenticate with Okta. The user has lookup permission but no refund permission.

The client discovers permitted tools and calls a lookup for a test payment. The gateway verifies the user and tool entitlement; the service enforces tenant ownership. A denied refund attempt produces an actionable access result and an auditable outcome. Trace correlation shows the permitted call through the tool and service.

For model access the same client points at the gateway's model endpoint with a gateway-issued or Okta-derived credential. A request for an approved model succeeds and is attributed to the user; a request for an unapproved model, or a direct call to the provider, is refused. The developer never holds the provider's key.

No agent workload, session database or worker pool is created for this developer. Client OAuth compatibility, model credential handling, tool visibility and actual denial are experiments, not assumed outcomes. If the catalog is unavailable, the existing configured endpoint remains usable under the proposed static-consumer design.

## Payments publishes an MCP capability

1. The service team adds a small MCP adapter under `payments-service/mcp/`, or reuses a suitable existing integration.
2. Local tests exercise the protocol and service fixtures, including tenant denial and unavailable-backend behavior.
3. CI publishes the server image by digest.
4. For a new hosted server, a dev deployment merge request (MR) selects the image and approved identity/resources. For an already hosted integration, only its reviewed gateway binding may be needed.
5. Tests invoke through the dev gateway using permitted and denied users.
6. The verified artifact/binding is promoted through existing delivery. Catalog metadata advertises the usable endpoint and owner after verification.

The component team owns schema and backend behavior; the platform owns shared gateway restrictions. A compatible implementation change uses a normal rollout. A new refund capability additionally requires permission review and transaction/idempotency checks.

## Payments publishes only guidance

The team updates `agent-assets/skills/use-payments-api/` and a prompt template in its service repo. CI validates references, variables, API compatibility and any scripts, then publishes bundle `1.4.0` with immutable content identity. The catalog links its capabilities and required permissions.

Publication creates no compute. A consuming agent remains on `1.3.0` until its owner updates the pin and evaluates the composed behavior. If metadata publication fails, retry that operation; current consumers and released bytes remain unchanged. If consumer evaluation fails, the service publication can remain available for other compatible consumers.

## An incident assistant is hosted

The agent team starts from a supported conventional or kagent template. It selects read-only Kubernetes/service tools through the approved gateway, a permitted model and bounded execution settings. It does not receive cluster-admin permission merely because it investigates incidents.

The team develops locally against dev endpoints, runs incident scenarios and publishes a versioned image or native configuration package. A deployment MR selects it in dev with platform-owned execution infrastructure and component-owned behavior. Verification includes a useful investigation, a denied write, telemetry continuity and state behavior.

Promote the same artifacts with environment-specific identities and endpoints. For kagent, use the chosen generation's native model; conventional execution remains a separate supported implementation. Neither path is assumed to satisfy arbitrary-code isolation without additional testing.

## A release fails checks

Incident assistant `2.1.0` fails a scenario because new guidance requests an unavailable tool. CI blocks its normal deployment-selection update. The running `2.0.0` remains selected; the corrected source produces a new immutable artifact and new results.

If this was a higher-impact change requiring isolated candidate resources, failure leaves the candidate unactivated and retains diagnostic evidence. Check that candidate configuration did not mutate a shared active tool/policy/state dependency. A successful endpoint isolation alone is insufficient if shared behavior changed.

## A breaking tool version is introduced

Payments changes tool inputs incompatibly. It keeps the existing endpoint/contract available and exposes a reviewed versioned binding for new consumers. Consumers update their tool selection and run compatibility checks before promotion. Existing sessions and clients must be observed during switch and retirement.

Do not split MCP traffic per request and infer session compatibility. Retire the old version after references, sessions and the rollback window permit it. The service team supplies migration guidance and tracks affected consumers.

## An operator diagnoses and recovers a release

A deployed incident assistant reports tool failures. The operator follows request correlation to distinguish policy denial, gateway reachability, model throttling and backend errors. If a release regression is responsible, they select the previous compatible artifact/configuration through the normal pipeline, prioritized as a [routine rollback](release-and-promotion.md#failure-and-rollback), and verify a task and denial case.

State compatibility and session handling follow the tested runtime procedure. External writes are investigated separately; rollback does not reverse them. If the cause is a shared auth/policy change, the platform incident owner handles that boundary rather than rolling back every agent blindly.

## A shared controller is upgraded

The platform team proposes pinned chart/controller/CRD changes and lists affected gateways, agents and sessions. Tests include policy semantics, actual invocations, session recovery and representative clients. Migration or parallel resources are used where required by the selected versions.

Component releases remain independent of this change. Restore/rollback capability must account for persisted schemas and controller-generated state; a previous chart version alone is not an established recovery plan.

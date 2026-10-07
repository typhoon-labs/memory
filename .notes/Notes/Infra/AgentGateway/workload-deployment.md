# EKS agent platform workload deployment

Status: Proposed supported paths and developer process. Updated 5 October 2026. [Notes index and terms](README.md)

Offer tool/model access before requiring hosted execution. A developer can use an existing client against approved endpoints; a service can publish guidance or expose an existing server. Compute deployment is required only when a component needs a hosted process.

## Supported paths

| Path | Developer owns | Platform supplies |
|---|---|---|
| Existing client | Client configuration and selected tools | Endpoints, identity integration, permissions and diagnostics |
| Existing remote MCP server | Service and protocol contract | Gateway binding and approved access |
| New hosted MCP server | Adapter/server image and tests | Application deployment conventions and gateway exposure |
| Conventional hosted agent | Framework/code, checkpoints and scenarios | EKS workload profile, identity and telemetry |
| kagent agent | Native agent behavior/configuration | Supported Harness, runtime dependencies and operational profile |
| Background work | Job logic and idempotent tool operations | Existing worker/job delivery and bounded capacity |

Existing REST APIs need an explicit adapter or supported transformation before MCP clients can call them as tools. Registering a URL or publishing a skill does not establish protocol compatibility. Avoid introducing a second hosted service when an existing integration already meets the requirement.

## Developer entry points

For tool consumption, discover a supported endpoint, authenticate, request permissions where needed and exercise one example call. Document compatible clients and failure diagnostics. Catalog availability should not be a per-call dependency for statically configured consumers.

For publishing, develop in the service repo against fixtures. CI tests and publishes an immutable image/package. A deployment update is needed only for hosted compute or changed gateway configuration. Verify through the dev endpoint, then promote the artifact using the [delivery process](release-and-promotion.md).

For hosted agents, start with a supported template, select tools/model and run local scenarios. Publish the image or immutable native configuration package, propose the dev selection, verify deployed behavior and promote. Developers should not design node pools or shared databases for each agent.

## Execution choices

Conventional Deployments suit trusted applications serving requests with externally persisted session state. Jobs or workers suit bounded asynchronous work. Set request concurrency, tool/model timeouts, maximum iterations/tokens and graceful shutdown in the application/runtime; a gateway request timeout alone does not stop all downstream execution.

For kagent, prefer its native configuration rather than a new universal agent API. kagent 1.0 is documented as alpha and replaces 0.x's Deployment-based `Agent` resource with Harness, AgentTemplate, Agent and Session resources running on Agent Substrate. Use one pinned generation in the pilot and do not mix resource examples across generations. The other notes refer here for this caveat. [kagent concepts](https://kagent.dev/docs/kagent/1.x/about/core-concepts/)

Bring-your-own images must satisfy the runtime's contract; arbitrary agent images do not work unchanged. The 1.x documentation requires the container to serve the A2A service over gRPC on port 80 and to answer `GET /readyz` on port 8081, with the Harness overriding the image entrypoint. It states that the `kagent-langgraph` and `kagent-crewai` adapters do not qualify yet because they do not include a gRPC server, and warns that a broken port mapping can present as a healthy agent. Check the representative pilot agent against this contract before planning to run the same image on both execution paths. [BYO requirements](https://kagent.dev/docs/kagent/1.x/agents/bring-your-own-agent/)

Substrate is a candidate for isolated session execution and idle snapshot/restore. Its tuning documentation states that kagent compiles every actor to the gVisor sandbox class and that microVM worker pools accept no kagent actors, so the isolation available through kagent today is gVisor. Decide whether that meets the execution-trust requirement before testing density. The same page calls for explicit worker requests and limits on production pools, and for a real bucket, non-default credentials and a backup policy for snapshots. Verify worker permissions, node compatibility and real resource consumption. [Substrate tuning](https://kagent.dev/docs/kagent/1.x/operations/tune-agent-substrate/)

## Workload configuration

Keep native resources or Helm values inspectable. Required information includes owner, environment, artifact digest, runtime/profile, resources, workload identity, tool/model bindings, telemetry and any persistence requirements. Keep credentials referenced through the chosen secret mechanism. Put behavior with component source and environment-specific bindings in deployment configuration.

Shared Harnesses and model/tool configurations can affect several agents. Review affected consumers and record their resolved references. Native compilation/readiness is not proof that invocation, authorization and persistence work; acceptance includes an actual task and denial case.

## State and recovery

Define whether sessions survive rollout, remain pinned to an old version or must drain. Database schemas and snapshots need compatibility rules across runtime revisions. Application checkpoints are separate from long-term memory extraction/retrieval and from external side effects.

If an agent writes to an API and crashes before recording success, retries may duplicate the operation. Use stable operation identifiers and backend idempotency/reconciliation. Add durable workflow infrastructure only when multi-step recovery or approval waits exceed the chosen runtime/application capabilities.

## Scaling and cleanup

Scale workload replicas/workers with supported signals and maximum concurrency. Karpenter supplies node capacity after scheduling demand; it does not independently determine agent/session replica counts. Keep warm capacity where latency requires it and measure its idle cost.

Retirement checks consumer references, active sessions, rollback retention and state disposition. Removing a route is not deletion of stored user data. Cleanup must not remove artifacts, tool versions or policies still used elsewhere.

# AgentCore workload deployment design

Status: Proposed module contracts and lifecycle. Updated 5 October 2026.

Agents and hosted MCP servers deploy through `agentcore-deployments` using versioned platform modules. Service-only skills and prompts use the separate [asset publishing workflow](skills-and-prompts.md). All configuration examples here describe internal contracts; they are not tested provider resource blocks.

## Workload implementations

| Implementation | Suitable use | Principal concern |
|---|---|---|
| Harness agent | Managed loop meets model, tool, skill and memory needs | Configuration versioning, supported auth and prompt composition |
| Custom runtime agent | Custom orchestration, frameworks or server behavior | Image lifecycle, instrumentation and protocol compliance |
| Hosted MCP runtime | Team owns executable tool-server code | Schema compatibility, sessions, target auth and tool policy |
| Existing/private MCP integration | Server already operates elsewhere | Connectivity, credential flow and upstream release ownership |
| Generated tool integration | Existing API/Lambda can be exposed through supported targets | Schema publication and downstream authorization |

Keep harness and runtime implementations separate with compatible output contracts. Migration between them changes execution and release behavior and needs evaluation rather than a simple mode toggle.

## Proposed module inputs

| Input group | Contents | Validation |
|---|---|---|
| Identity | Name, environment, owner, domain, data classification | Naming constraints and required metadata |
| Release | Manifest URI and digest; resolved artifacts | Hashes and approval evidence |
| Execution | Harness config or runtime image digest; protocol | Exactly one supported implementation |
| Auth | Inbound method and issuer/role bindings | Compatible with caller path |
| Network | Subnets, groups and approved egress profile | Required dependencies reachable |
| Tools | Published targets and consumed gateway bindings | Schema/version compatibility |
| Memory | Existing memory binding or workload memory settings | Ownership, actor mapping, retention |
| Content | Exact skills/prompts and composition rules | Compatibility and integrity |
| Evaluation | Evaluator/dataset references and online settings | Prerequisites, permissions and cost |

Avoid passing a directory path in one repository that only exists in another repository's checkout. Package policy templates, schemas and content as release artifacts, or explicitly materialize them in CI before planning. Record their hashes in the release manifest.

Expected outputs include runtime/harness reference, selected endpoint binding, workload identity where available, target IDs, memory ID, log/trace bindings, evaluation configuration references, and publication references. Keep credentials out of outputs.

## Runtime and harness configuration

Custom runtimes use image digests and a validated HTTP, MCP or A2A protocol implementation. CI checks architecture compatibility, startup behavior, health, instrumentation, timeouts, concurrency and shutdown behavior. Image scanning and dependency policy are component release checks.

Harness releases pin configuration, system instructions, model configuration, skills and approved tools. AWS documents per-invocation overrides for skills and for iteration, timeout and token limits; invoke-time skills are appended to the harness defaults and win when names collide. Determine which other invocation overrides can change release behavior, and how production callers are prevented from using them. A production client should not freely override model, prompts, skills or tool access in a way that invalidates approval evidence. [AWS harness skills](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-skills.html), [AWS harness limits](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-operations.html)

Both implementations need explicit model permissions, time/token/iteration limits, bounded retries, approved outbound access and observability. Provider-managed versions do not automatically establish whole-release isolation; changes to auth, memory or shared dependencies must be checked independently.

## Gateway boundaries

Use a domain tool gateway for aggregated MCP capabilities. Use HTTP routing for agent/runtime entry points where required. Inference gateways are an optional later boundary for model access and attribution, not a prerequisite for the pilot.

| Integration | Proposed ownership |
|---|---|
| Gateway, auth and baseline policy | Platform/domain deployment unit |
| Server target and its schema | Tool team deployment unit |
| Tool-specific policy | Tool team, with platform review where shared impact exists |
| Consumer's selected gateway/version | Agent release and deployment configuration |

Adding a target can alter discovery visible to current consumers. Candidate target schemas and policies should therefore be evaluated through an isolated candidate gateway unless compatibility and visibility guarantees are demonstrated.

AWS target routing rules require HTTP targets, and weighted splits use weights from 1 to 99. Do not model aggregated MCP promotion as a generic weighted rule. [AWS gateway routing rules](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-rules.html)

## Candidate and active resources

An illustrative deployment selection is:

```yaml
platform:
  version: 0.3.0
  source_commit: "<commit-sha>"
active_release:
  manifest_uri: s3://release-artifacts/finance-assistant/1.2.0/manifest.json
  manifest_sha256: "<sha256>"
  bindings:
    tool_gateway: payments-approved-v1
    memory: finance-assistant-memory
candidate_release:
  manifest_uri: s3://release-artifacts/finance-assistant/1.3.0/manifest.json
  manifest_sha256: "<sha256>"
  bindings:
    tool_gateway: payments-approved-v1
    memory: finance-assistant-candidate-memory   # Isolation substitute
```

This format requires a resolver/validation layer before Terraform. The manifest describes release content; bindings identify environment resources. Evaluations attest to both. A candidate necessarily differs from the active release in the bindings substituted for isolation, such as test memory. Declare those substitutions in the candidate's bindings so that evidence records them and approval covers the mapping to the active bindings. Any other binding change after tests requires renewed evidence. Whether results gathered against a substitute are sufficient for the active binding is an open decision in the [validation plan](validation-plan.md).

For MCP releases, the candidate and active gateway bindings can coexist. Consumers change their binding as a release change. The gateway that was evaluated is the one consumers adopt: gateway policies name the gateway ARN, so a gateway redeployed after approval would carry policies that were never tested. Retain the previous gateway and server for consumers that have not adopted the new version. Define session drain behavior before retirement.

For HTTP releases, consider static endpoint switching initially. Add weighted routing only after session affinity, retry behavior, route compatibility and evaluation attribution are demonstrated. Terraform plan approval is required for the activation change.

## Memory and execution sandboxes

Default memory ownership is per workload. Declare event retention, long-term record lifecycle, extraction strategy, actor/tenant organization, deletion requirements and migration compatibility separately. AWS supports namespace organization with actor and session variables; this organization is not a complete authorization boundary. [AWS memory namespaces](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/specify-long-term-memory-organization.html)

Shared domain memory requires an explicit owner and access contract. Candidate runs should use isolated test memory unless a test proves shared writes cannot affect active behavior.

Code interpreter and browser are optional capabilities with explicit role, network and session boundaries. Sharing resource definitions must not imply sharing authenticated browser state across unrelated users. Define recording sensitivity, credential handling, egress, retention and per-session permissions before enabling them.

## Resource retirement

Retire only after deployment references, consumer pins, sessions and rollback windows permit it. Deleting a workload includes target removal, policy cleanup, catalog lifecycle, artifact retention, and memory disposition. Stateful resources require explicit migration/deletion review. Protection flags are supplementary controls and do not replace a retirement procedure.

A failed candidate can be quarantined for diagnosis and later removed. Candidate cleanup must not delete shared policies, active dependencies, or artifacts still referenced by another release.

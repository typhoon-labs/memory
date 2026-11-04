# Hosted execution: conventional Kubernetes, kagent, Agent Substrate and AgentCore

| | |
|---|---|
| Status | Proposal, with verified capabilities |
| Updated | 4 November 2026 |
| Versions checked | kagent **1.0.0-rc1** (30 October 2026; stable line 0.10.4). Agent Substrate **1.0.0-rc.2** (4 November 2026; kagent rc1 pins rc1). kubernetes-sigs/agent-sandbox 1.0.9. AgentCore Runtime **V2** (announced 18 September 2026). Sources: kagent and kagent-dev/website repositories at 3 November 2026, agent-substrate/substrate at 4 November 2026, AWS AgentCore developer guide, What's New and pricing pages read 4 November 2026 |

## Verdict

| Runtime | Use for | Status |
|---|---|---|
| **Conventional Kubernetes** (Deployment, Job, GitLab CI job) | Every agent, MCP server and workflow by default | Adopt now. Uses existing skills, charts, GitOps, Karpenter, Spot and on-call |
| **kagent declarative agents** | Simple, read-only agents defined as configuration, once they can carry user identity or a workload identity through the gateway | Optional, behind a gate. Revisit at kagent 1.0 GA |
| **Agent Substrate** (kagent 1.x's session runtime) | Many idle conversational sessions, or sandboxed coding agents, when a named workload needs them | Deferred. Pre-GA with an operating model the teams do not have |
| **AgentCore Runtime** | A named workload whose isolation or burst profile justifies a second operating model | Exception. Build nothing for it until that workload exists |

## Conventional Kubernetes is the default

A Python agent is a web service that waits on HTTP calls. Everything the
organization knows about running web services applies: Deployments,
readiness probes, HPA, PodDisruptionBudgets, logs, `kubectl debug`, Helm
rollback. A batch agent is a Job or a GitLab CI job. Long-running work is a
workflow with checkpoints in PostgreSQL ([Workflow automation](05-workflow-automation.md)).

What a conventional deployment does not give, and how the platform covers it:

| Gap | Covered by |
|---|---|
| Per-session isolation for untrusted code execution | Not needed by any priority use case. When one appears, a sandbox per task (Job with gVisor RuntimeClass, or AgentCore) is evaluated then |
| Scale to zero for idle sessions | Session state in PostgreSQL; replicas are stateless; HPA on concurrency. Idle sessions cost a database row, not a pod |
| Model and tool credentials | The gateway holds them; the pod holds only its service account |

## kagent 1.x: what it is now

kagent changed shape between 0.x and 1.x. Most published material describes
0.x.

| Question | Finding (documented upstream unless marked) |
|---|---|
| Maturity | 1.0.0-rc1 on 30 October 2026, after 17 alphas in five weeks. The 1.x docs still say "1.0 alpha". CNCF Sandbox |
| Upgrade from 0.x | **No in-place upgrade:** new API group `api.kagent.dev`, version `v1alpha3`, new PostgreSQL database, no downgrade, no history carried over. Later 1.x minors promise upgrades |
| Declarative model | `Agent` pairs an `AgentTemplate` (model, prompt, tools) with a `Harness` (runtime, image, worker pool). `ModelConfig`, `RemoteMCPServer`, `SandboxTemplate`, `EgressPolicy`. Sessions are rows in PostgreSQL, not Kubernetes objects |
| Harnesses | `kagent` (Go engine on ADK-Go), `claude` (Claude Code CLI in an actor), `codex` (Codex App Server), `byo` (must serve A2A over gRPC and implement the TaskStore contract). Python ADK runs only through a command override, without skills or MCP token passthrough. LangGraph, CrewAI and OpenAI Agents adapters "do not satisfy the contract" |
| MCP | `RemoteMCPServer` only. kmcp and the `MCPServer` CRD were removed: MCP servers run outside kagent |
| Skills | OCI (digest-pinned), Git (pinned commit), S3. Plugins supported |
| Bedrock | Native provider with a **Bedrock API key only**. "Attaching an AWS IAM role to the agent, such as with EKS IAM Roles for Service Accounts, is not currently supported: an agent runs as a Substrate Actor rather than as a pod that kagent controls" ([kagent docs](https://github.com/kagent-dev/website/blob/main/docs-site/content/kagent/1.x/setup/model-providers/amazon-bedrock.md)). Through an OpenAI-compatible gateway it works with `actorJwt` or a static key |
| Token exchange | kagent ships RFC 8693 *client* code that exchanges the caller's token at an external STS. It mints nothing. Delegation needs an actor token from a ServiceAccount, and Substrate actors are not pods, so **it probably falls back to impersonation without `act`** (inferred from the code; to validate) |
| Console and API security | Default authentication `insecure`; default authorizer allows every action; the controller's service account can create Agents, Harnesses, Secrets and ConfigMaps. **Observed in the demo:** any signed-in user can edit or delete an agent, and a chat started in the console reaches the agent without passing the gateway |
| HA | Controller leader election; multi-replica gateway coordination listed as not implemented |

### Agent Substrate: the unfamiliar part

**Observed in the demo:** 16 suspended actors, golden snapshots per template,
a gVisor worker pool of two pods ([screenshot](20-demo-review.md#kagent-and-agent-substrate-kubernetes-but-not-deployments)).

| Behavior | Ordinary Deployment | Substrate |
|---|---|---|
| What runs an agent | A pod you can `kubectl get` | An actor in Substrate's PostgreSQL, multiplexed onto worker pods (up to 1,000 actors each). `kubectl ate`, outside Kubernetes RBAC |
| Between requests | Process keeps running | Every turn ends in suspend; kagent restores only `/data` (VOLUMES fidelity). Running processes and `/tmp` are gone |
| Config change | Rollout | Sessions keep their compiled revision for life; edits do not reach live sessions; API key changes need an egress-gateway restart |
| Node loss or Spot interruption | Pod rescheduled; request retried by caller | A mid-turn actor goes to `CRASHED`; kagent never reverts it, so **"the Session ends with the node."** kagent advises against Spot unless a lost turn is acceptable |
| Capacity exhaustion | Pending pods, visible | Generic timeouts; visible only in `at_capacity` metrics |
| Privileges | Restricted pod security | Workers need `SYS_ADMIN`, seccomp and AppArmor unconfined, run as root; egress terminates TLS with a gateway CA |
| Snapshot storage | None | S3 bucket shared by all actors, no per-actor scoping; a node that dies before the async upload (about 5 minutes) loses the snapshot |
| Kubernetes version | Any supported | **EKS 1.37 or later** (ClusterTrustBundle and PodCertificateRequest GA only in 1.37; EKS does not enable beta APIs). Inferred from Substrate's requirements; to validate on EKS |
| Upgrades | Helm | Substrate must move in lockstep with kagent; rc.1 to rc.2 breaks gVisor memory snapshots |

These are not defects. They are what scale-to-zero sessions cost. A team
that does not need thousands of idle sessions should not pay that cost in
on-call learning.

### Sandboxing on EKS, precisely

| Technology | Isolation | On EKS | Used by |
|---|---|---|---|
| gVisor (`runsc`) | User-space kernel intercepts system calls; shared host kernel | Via Substrate: inside worker pods, no custom AMI, but privileged namespace. Via RuntimeClass: install `runsc` with AL2023 `NodeConfig` user data or a custom AMI; no AWS documentation | Substrate (`gvisor` class); agent-sandbox |
| Kata Containers | Pod in a KVM guest (QEMU, Cloud Hypervisor, Firecracker) | Needs `/dev/kvm`: `.metal` instances, or nested virtualization on supported Intel families (C7i, C8i, M7i, M8i, R7i, R8i and others; not Graviton). Karpenter 1.13 or later: `EC2NodeClass.spec.cpuOptions.nestedVirtualization` | Substrate's `microvm` class runs Kata with Cloud Hypervisor inside an unprivileged pod with a KVM device plugin, **not** through a RuntimeClass and not with Firecracker |
| Firecracker | Minimal KVM VMM | Same `/dev/kvm` requirement | Not used by kagent; used by AWS Lambda and AgentCore |
| Fargate | VM per pod | No DaemonSets, privileged pods, custom runtimes or Spot | Cannot run Substrate |
| kubernetes-sigs/agent-sandbox | `Sandbox`, `SandboxTemplate`, `SandboxClaim`, `SandboxWarmPool` (v1beta1) over a RuntimeClass | Needs a RuntimeClass installed on nodes | **Not used by kagent 1.x.** kagent's own `SandboxTemplate` shares only the name |

"Container portability" does not carry across these: a container that runs on
a standard node may fail under gVisor (unsupported system calls), and
microVM workers need instance families the existing NodePools may not have.

### The gate before kagent hosts anything

Run kagent for a workload only when all of these hold:

1. kagent and Substrate are GA, or the workload is explicitly non-production.
2. The agent's model and tool calls carry a user token, a chain-sts token or
   a workload identity through Agentgateway. A Bedrock API key in a Secret
   does not qualify.
3. The console and API are behind OIDC with an authorizer that limits edits,
   or are not exposed; agents change only through GitOps.
4. The workload accepts the session-loss behavior above, or runs on
   On-Demand nodes in a dedicated NodePool with node replacement controlled.
5. The platform team has rehearsed actor-level debugging and snapshot-store
   recovery.

The demo's diagnosis agent met none of 2 and 3, which is why 99% of its
tokens show no user ([demo review](20-demo-review.md)).

## AgentCore Runtime as an exception

### What Runtime V2 is

| Fact | Source |
|---|---|
| Opt-in per runtime with `platformVersion=V2`; V1 remains the default. Announced 18 September 2026 as generally available | AWS What's New, 18 September 2026; developer guide, "How it works" |
| V2 snapshots the initialized microVM at the first healthy `/ping` and restores it for new sessions | Developer guide |
| arm64 microVMs, at most 2 vCPU and 8 GB; x86 and larger sizes "coming soon" | Developer guide, limits |
| **V2 regions: us-east-1, us-east-2, us-west-2, eu-west-1, ap-northeast-1 only.** V1 in 22 regions | Developer guide, regions |
| Session idle timeout 15 minutes by default (60 to 28,800 s); maximum lifetime 8 hours; one microVM per session | Developer guide, lifecycle |
| Price: V2 $0.1276 per vCPU-hour and $0.0169 per GB-hour; V1 $0.0895 and $0.00945. CPU billed only when active in V1; V2 reclaims idle memory after 120 s | Pricing page, read 4 November 2026, no date shown |

### The Classmethod article, checked

The article ([DevelopersIO, 19 September 2026](https://dev.classmethod.jp/en/articles/amazon-bedrock-agentcore-runtime-v2-tried/))
ran one Flask container on arm64 in ap-northeast-1, three image sizes (46,
335 and 859 MB), single runs, no model or tool calls, no VPC mode.

| Article conclusion | AWS documentation | Verdict |
|---|---|---|
| First invoke about 2 s on V2 regardless of image size (V1: 3.4 to 13.6 s) | AWS blog: P75 about 2 s for 200 MB to 2 GB images, V1 5.4 s rising to nearly 30 s; 5,000 cold invokes of an echo agent, client in another region | Consistent. Both are echo agents |
| Create or update takes minutes on V2 (188 to 204 s vs about 5 s) | "Several minutes"; calls before READY return `ConflictException` | Consistent. Deployments must poll |
| **A new session on an existing runtime was slower on V2: 1.9 s vs 0.6 s** | Not covered. AWS says a session landing on an already-initialized environment starts in under 100 ms, which implies reserved compute | **Unresolved and important** for interactive use. One run, one region |
| Module-level random values and timestamps repeat across sessions | AWS goes further: OpenSSL-based randomness (including Node `crypto.randomUUID`) may repeat **even inside the handler**; `time.monotonic()` does not advance across a restore; hostname is `localhost` and PID is 1 | Supported; risk understated |
| Warm calls are the same | No AWS V2 warm-path numbers | Not contradicted (n=5) |

Treat both sets of numbers as properties of an echo agent under their test
conditions. A real agent's latency is dominated by model calls of 1 to 20
seconds (**observed in the demo**: 12.8 s for a four-call diagnosis).

### Snapshot-safe code (V2)

| Rule | Why |
|---|---|
| Generate IDs, nonces and random values per request from `os.urandom`, `secrets` or `uuid4`; avoid OpenSSL RNG paths | Values from the snapshot repeat across sessions |
| Read wall-clock time per request; never measure elapsed time from a module-level reference | Restore does not advance the snapshot's clock |
| Create AWS SDK clients and fetch credentials in the handler, with a fresh `boto3.Session()` | Module-scope clients miss per-session context keys; credentials captured at snapshot expire |
| Do not cache mutable configuration (tool catalogs, feature flags) at init | Changes never reach restored sessions |
| Expect the first call after restore to reconnect | Sockets do not survive a restore |

### Identity behind Agentgateway

| Inbound mode | What the agent code sees | Usable for delegated user identity? |
|---|---|---|
| IAM (SigV4) | The gateway's IAM role. A user ID header can be added with `InvokeAgentRuntimeForUser`, but AWS states the value is **not verified** | No, only an assertion |
| JWT authorizer (OIDC discovery, audiences, clients, scopes, claims) | The validated token, if `Authorization` is on the header allowlist; plus a workload access token | Yes: the gateway passes a chain-sts or Keycloak token issued for the runtime's audience |

Two consequences. AgentCore's anti-bypass check
(`allowedWorkloadConfiguration`) recognizes only AgentCore Gateway, so with
Agentgateway in front the runtime needs a resource policy restricted by VPC
endpoint plus audience and claim restrictions. And AgentCore does not bind a
session to a user: the gateway must mint session IDs (at least 33
characters) and bind them to `sub`.

Outbound control works only in **VPC mode** with no NAT, security groups
that allow only the Agentgateway internal load balancer and required VPC
endpoints, and agent code configured with the gateway's base URL. PUBLIC
mode cannot be controlled. Telemetry can go to the existing collector with
`DISABLE_ADOT_OBSERVABILITY=true` and OTLP variables; platform metrics stay
in CloudWatch.

### What a second operating model costs

| Item | Work |
|---|---|
| Build | arm64 images (multi-arch builds); snapshot-safe template; `/ping` and `/invocations` adapter; OTel switch |
| Infrastructure as code | Runtime, endpoints, VPC subnets in supported AZ IDs, VPC endpoints (ECR, S3, Logs, Bedrock, AgentCore, STS), resource policies, execution roles, private Keycloak reachability (HTTPS, public CA or ALB) |
| Pipeline | `UpdateAgentRuntime`, poll for READY (minutes), promote by repointing endpoints; session storage wiped on version update |
| Gateway | One Agentgateway backend per runtime ARN; header allowlist; `traceparent`; session-ID minting and binding |
| Tests | Two-session uniqueness of IDs and nonces; credential expiry after idle; reconnect after restore; latency for new, warm and post-idle sessions; quota limits (25 new sessions per second); egress-deny and bypass tests |
| Runbooks and training | Quota increases, 409 and 424 errors, stuck `HealthyBusy`, JWKS rotation, version rollback, ENI exhaustion, cost anomalies, telemetry split between CloudWatch and Dynatrace |
| Second policy plane | AgentCore Policy and Guardrails apply only to AgentCore Gateway traffic. If used, two policy systems; if not, AgentCore is only compute |

A reasonable estimate is 4 to 8 engineer-weeks to build this properly and 0.1
to 0.2 FTE to keep it current (inferred; see [Cost model](08-cost-model.md)).

### When AgentCore is justified

Choose it for a **named workload** with at least one of:

- Untrusted or user-supplied code execution that needs hardware isolation
  per session, where gVisor on EKS is judged insufficient.
- Bursty sessions with a low duty cycle where per-second billing clearly
  beats EKS capacity at measured utilization.
- A need for AgentCore Code Interpreter or Browser that the team would
  otherwise build.

Reject it when the workload needs x86, more than 2 vCPU or 8 GB, a region
outside the V2 list, streams beyond 60 minutes, or a new-session latency under
about 2 seconds without pre-warming. None of the priority use cases in this
review meets the bar today ([Use cases](06-use-cases.md)).

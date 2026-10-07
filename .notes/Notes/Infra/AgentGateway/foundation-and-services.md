# EKS agent platform foundation and services

Status: Proposed reuse and infrastructure boundaries. Updated 5 October 2026. [Notes index and terms](README.md)

The foundation starts with the EKS platform already operated by the organization. The first task is to inventory its configuration and available capacity, then add only the resources required by the selected workflows. These notes do not assume the existing environment has spare capacity or a particular security configuration.

## Existing infrastructure and additions

| Existing capability | Proposed reuse | Verify before depending on it |
|---|---|---|
| EKS | Agentgateway and optional hosted workloads | Kubernetes version, capacity, tenancy and lifecycle |
| Istio | Established service networking | Mode, controller ownership and supported traffic paths |
| Kyverno | Admission restrictions | Enforced rules and permitted exceptions |
| Karpenter | Node provisioning | Compatible pools, disruption behavior and capacity limits |
| CloudNativePG | Supported PostgreSQL dependencies | Database privileges, extensions, HA, backup and connection limits |
| OTel | Telemetry collection/export | Authentication, queues, signal coverage and vendor ingestion |
| Helmfile | Component/environment selection | Chart pinning, dependency order, diff and recovery |
| Terraform/OpenTofu/Terragrunt | Required AWS additions | Existing state ownership and version compatibility |
| Okta | Corporate authentication | Authorization servers, clients, grants, claims and licensing |
| GitLab.com Ultimate | Source control, merge request review and CI/CD pipelines on self-hosted runners in the EKS cluster | The runner namespace and node pool, what job pods can reach and assume, how images are built without privileged pods, and federated identity to AWS and the cluster |
| ECR | Container images and Helm charts as OCI artifacts; content bundles can use it too | Tag immutability, lifecycle rules, scanning and cross-account pull permissions |

The supplied environment list does not name the following. The delivery, identity and bypass designs depend on them, so the inventory records them first.

| Dependency not yet identified | Needed for | Record in the inventory |
|---|---|---|
| Object storage | Packages, artifacts and runtime snapshots | Buckets, encryption, access model and lifecycle rules |
| Secret delivery mechanism | Provider keys, database and vendor credentials | Product, rotation behavior and workload integration |
| Network policy enforcement | Bypass prevention and egress restriction | Policy engine, default-deny posture and who can change policy |
| Operational telemetry backend | Debugging and release verification | New Relic or Dynatrace; the notes do not yet say which |
| Model providers | Model access through the gateway | Providers, accounts and regions, private connectivity and credential type |

Images and Helm charts go to ECR. Charts are OCI artifacts there and can be pinned by digest, and content bundles can be stored the same way. The GitLab package registry is proposed for packages that only pipelines read, such as internal libraries and bundles baked into an image at build time; jobs authenticate with their job token, so no stored credential is needed. Two conditions apply. GitLab accepts a republished version by default, so turn off duplicates, add package protection rules and still verify a recorded hash. Anything a running pod or the cluster pulls stays in ECR or S3, where workload IAM applies; a GitLab pull would put a long-lived token in the cluster and make GitLab.com a start-up dependency. [GitLab generic packages](https://docs.gitlab.com/user/packages/generic_packages/)

The GitLab runners are self-hosted in the existing EKS cluster, the same infrastructure this option builds on. Job pods run merge request code inside that network, so give the runner namespace the same network policy and node separation as untrusted workloads and include it in the bypass checks below. If environments have separate clusters, record which one hosts the runners and how its jobs reach the others.

Reuse the organization's current environment/account model. Stronger execution or data isolation may justify separate nodes or clusters; decide from workload trust and impact. Namespace separation alone does not establish isolation for arbitrary code.

## Networking and controllers

Choose one controller for each GatewayClass/resource scope. A standalone Agentgateway controller and an Istio-managed Agentgateway are different integration choices; do not apply their policy examples interchangeably.

Istio's documented Agentgateway integration configures the proxy through Gateway API resources. Traditional Istio APIs, including AuthorizationPolicy, RequestAuthentication and PeerAuthentication, are not applied to that proxy. Inspect the supported policy surface and enforce each intended boundary explicitly. Istio labels the integration experimental and intended for evaluation only, and documents it in its ambient mode guide; weigh that status against the standalone controller before choosing. [Istio Agentgateway integration](https://istio.io/latest/docs/ambient/usage/agentgateway/)

| Path | Proposed treatment |
|---|---|
| User client to gateway | TLS and supported Okta authentication |
| Client or agent to model endpoint | Gateway-issued or Okta-derived credential; approved models only |
| Gateway to MCP/backend | Explicit backend identity and TLS/mesh configuration |
| Gateway to model provider | Provider credential held by the gateway; private connectivity or restricted egress where available |
| Agent to approved tools/models | Governed endpoint or explicitly equivalent approved path |
| Workload to AWS | Scoped workload IAM using supported EKS identity mechanism |
| Workload to internal API | Existing private networking plus service authorization |
| Collector to vendor | Supported authenticated OTLP export |

Document DNS, connection limits, streaming timeouts and private endpoint requirements from the actual call graph. Gateway routing configuration is not proof that a workload cannot connect directly to a backend or external provider. Establish enforcement using the cluster's supported network controls and verify denied paths.

### Bypass enforcement candidates

No control is selected. These are the candidates to evaluate against the inventory; each needs a denied-path result in the [validation plan](validation-plan.md).

| Bypass path | Candidate controls | Denied-path check |
|---|---|---|
| A workload calls an MCP or backend service directly | Kubernetes NetworkPolicy from the cluster's policy engine; the backend accepts only the gateway's workload identity, through mesh authorization at the backend or a credential only the gateway holds | A direct call from an agent namespace is refused while the gateway's call succeeds |
| A workload calls a model provider directly | The provider credential exists only at the gateway; egress from workload namespaces is limited to approved destinations; provider-side policy limits which identity or network path may invoke models | A workload without a provider key and one with a smuggled key are both denied |
| A client reaches a hosted runtime API around its entry point | The runtime API is not exposed outside the cluster; the entry point authenticates and binds the user to the session | Unauthenticated and wrong-user requests fail at every exposed address |
| A team attaches a more specific gateway policy that weakens a platform rule | RBAC on route, backend and policy resources; Kyverno rules on permitted fields | The attempted override is rejected at admission or has no effect |

Istio's traditional policy APIs do not apply to the Agentgateway proxy itself, but may still protect backend workloads in the mesh. Mesh egress settings are not a boundary where a workload can avoid its proxy; pair them with network policy. Policy precedence at the gateway is covered in [identity and authorization](identity-and-authorization.md#gateway-policy-ownership).

## Workload and secret identity

Assign workload identities by permission boundary. Agents do not inherit a broad platform execution role. Hosted tool services hold only the credentials needed by their backend integrations. Shared proxy credentials must be scoped so one route cannot invoke unintended resources.

Use the organization's existing secret delivery mechanism where supported; choose one if none exists. Manifests contain references rather than tokens. Verify compatibility with chart/runtime credential loading and rotation. Inspect Terraform state, rendered manifests, Helm release data, CI logs and debug outputs for accidental secret copies. A Kubernetes Secret or a sensitive Terraform variable does not establish absence from other stores.

## Persistence

CloudNativePG can provide supported PostgreSQL databases, with separate credentials and migration ownership for registry, runtime and application state. Do not put all services in one database merely because they use PostgreSQL. Evaluate connection pools, noisy-neighbor effects and backup consistency.

S3 stores immutable packages, artifacts and runtime snapshots where supported. Define encryption, tenant access, retention and restore procedures. Runtime snapshots, SQL session metadata and external side effects form different recovery boundaries; restoring only one may not restore a usable conversation.

Langfuse's current self-hosted stack includes PostgreSQL, ClickHouse, Redis/Valkey, blob storage and web/worker services. Its adoption therefore adds dependencies beyond CloudNativePG. Record capacity and ownership before enabling it. [Langfuse sizing](https://langfuse.com/self-hosting/configuration/scaling)

## Capacity and availability

Keep a reliable baseline for gateway/controllers and persistent services. Test node/AZ disruption and dependency outages; multiple replicas or availability zones alone do not establish end-to-end availability.

Shared token budgets depend on Agentgateway's global rate limiting, which needs a separately deployed rate-limit server. If budgets are adopted, that server joins the baseline: give it an owner, and decide and test whether model traffic is refused or allowed while it is unavailable. [Agentgateway budget controls](https://agentgateway.dev/docs/kubernetes/latest/documentation/llm/cost-controls/budget-limits/)

Workload scaling creates pod or worker demand; Karpenter supplies node capacity. CPU alone may underrepresent agents waiting on model/tool I/O. Select scaling signals from concurrent work, queue depth or supported runtime metrics, and bound maximum concurrency and node spend.

Use dedicated node pools where compatibility or trust requires them. Evaluate Spot for retryable work only after interruption behavior is proven. Set requests/limits and graceful shutdown; for Substrate validate worker placement and resources rather than assuming actor demand maps automatically to node provisioning. kagent accepts only gVisor worker pools (see [workload deployment](workload-deployment.md#execution-choices)), so confirm that existing node images and Kyverno rules permit those workers before sizing a pool.

## Foundation acceptance

Before production, demonstrate access boundaries, secret rotation, database/object restore, gateway failure handling and node replacement. Each has an experiment in the [validation plan](validation-plan.md); record operational owners, supported versions and recovery targets there.

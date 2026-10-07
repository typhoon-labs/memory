# AgentCore foundation and platform services

Status: Proposed design under evaluation. Updated 5 October 2026.

This document describes infrastructure shared by agents, MCP servers, and content publishers. The intended boundary is that platform resources provide reusable controls while component deployment units own their specific resources. Provider schemas, regional availability, and cross-account behavior still require the experiments in the [validation plan](validation-plan.md).

## Account topology and configuration

The working proposal uses a shared-services account and separate dev, stage, and prod accounts. The shared account owns approved catalog publications and durable release artifacts. Environment accounts own workload execution, gateways, policies, local evaluators, logs, and candidate catalog records. Begin in one region; additional regions require explicit replication, residency, and recovery decisions.

| Configuration file | Contents | Excludes |
|---|---|---|
| `account.hcl` | Account ID, deploy-role ARN, backend bindings | Secret values |
| `environment.hcl` | Environment defaults, approvals, retention classes | Resource implementation logic |
| `region.hcl` | Region, regional service bindings, endpoint choices | Implicit global replication |
| Component `deployment.yaml` | Active/candidate manifests and environment bindings | Mutable artifact content |
| `publication.yaml` | Catalog destinations and immutable asset references | Consumer adoption decisions |

Provider aliases must explicitly select the destination account for shared publications. Passing an ARN is not a substitute for proving cross-account create/update permissions and API support. If publication from workload accounts is unsupported or unnecessarily broad, use a shared-account publication unit and role.

## Bootstrap and Terraform state

Bootstrap creates the backend and initial deployment trust before normal stacks depend on them. Use a documented temporary local-state procedure, migrate state into the new backend, verify the migration, and securely remove local state copies. Keep the bootstrap configuration in `agentcore-deployments`; the execution role and reviewer for this initial step require an explicit operating procedure.

Use one backend bucket per account with SSE-KMS, versioning, access logging appropriate to the security requirements, and one state key per unit. Enable native S3 lockfiles with the selected Terraform version. HashiCorp documents `use_lockfile` and the distinct lock-object permissions. [Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)

Example state key: `us-east-1/agents/finance-assistant/runtime/terraform.tfstate`. Explicitly define whether candidate and active resources share this state or use separate release units. State separation does not make a multi-unit promotion atomic.

Do not apply an undifferentiated retention policy to state and lock objects. Lock release requires deletion of lock objects. Evaluate immutable retention for historical state versions separately. Saved plans, bootstrap files, and CI artifacts need the same sensitivity treatment as state.

Terragrunt dependencies carry bindings between units. Prefer narrow outputs such as ARNs, IDs, and authorizer references; do not expose entire state snapshots or secret-bearing objects. If SSM Parameter Store is used for external consumers, define its publisher, reader permissions, update ordering, and consistency expectations.

## Network paths

Propose private subnets across at least two availability zones for VPC-connected execution. Determine endpoints from the actual call graph rather than a fixed universal list.

| Path | Proposed treatment | Validation required |
|---|---|---|
| Runtime to internal service | Private routing and explicit security groups | DNS, reachability, timeout behavior |
| Runtime to AWS APIs | Supported VPC endpoints where justified | Data/control-plane coverage and endpoint policies |
| Gateway to private MCP service | Supported private target connectivity, potentially VPC Lattice | Exact target mode, account boundary, TLS and auth |
| Runtime to SaaS or external models | Controlled outbound access | NAT/proxy support, allow-list and credential flow |
| Harness to skill artifacts | `s3:GetObject` on approved prefixes and `s3:ListBucket` limited to them by condition | Bucket policy, prefix condition and KMS grants |
| Browser to websites | Separate approved network profile | Recording, external access and session isolation |

Candidate endpoint dependencies include AgentCore, model invocation, ECR, logs, STS, Secrets Manager, and S3. Verify names and availability in the chosen region. VPC-connected execution does not by itself establish private-only inbound access or permitted outbound destinations.

## Encryption and credentials

Choose key boundaries according to sensitivity, isolation, rotation, and service support. Candidate classes include memory, artifact storage, logs, credential vault, and platform configuration. A key per capability is an option, not a universal data-classification model.

Each service-specific key policy must be validated with the actual principal and supported conditions. Cross-account S3 readers need both bucket access and decrypt permissions. Track resources whose key changes require replacement, especially stateful resources. Key deletion windows and retirement must accommodate retained artifacts and rollback releases.

Prefer verified write-only provider fields or a controlled secret provisioning mechanism. Marking a Terraform value sensitive only changes display behavior; establish whether actual credentials enter state and plans. An out-of-band rotation plus ignored configuration changes is not evidence of secret exclusion.

## IAM ownership

| Role | Proposed scope |
|---|---|
| CI plan role | Read the relevant infrastructure and state; lock access where needed |
| CI apply role | Mutate resources only in its account and approved deployment scope |
| CI runner pod and node identity | Pull job images and write cache and logs; no deployment permissions |
| Artifact publisher | Write a service-owned artifact namespace; no workload activation |
| Runtime execution role | Invoke approved tools/models and read exact dependencies |
| Gateway role | Access only its configured upstream services |
| Evaluation role | Read selected traces and execute approved evaluation dependencies |
| Registry publication role | Manage designated publications, without consumer deployment rights |

Use GitLab CI/CD ID tokens (OIDC) with role trust restricted to the intended project, protected ref and environment. The default `sub` claim carries only the project path and ref, so jobs for dev, stage and prod on the same branch of `agentcore-deployments` present the same subject. Add `ref_protected`, `environment_protected` and `deployment_tier` to the project's `sub` claim components, or split environments across projects, before treating an apply role as environment-scoped. On GitLab.com, AWS also accepts `project_id`, `namespace_id`, `ref_protected`, `pipeline_source` and `runner_environment` as condition keys, so a role can require the immutable project ID, a protected ref and a self-hosted runner. No accepted key carries the environment name or the pipeline definition, so environment scoping still depends on the `sub` claim. [GitLab ID tokens](https://docs.gitlab.com/ci/secrets/id_token_authentication/), [GitLab OIDC with AWS](https://docs.gitlab.com/ci/cloud_services/aws/)

The runners are self-hosted in the existing EKS cluster. Whatever a job pod's service account or node role can do, every job on that runner can do, so give those identities no deployment permissions and let jobs reach AWS only through ID-token roles. Mark the runners used for apply and activation jobs as protected, so they accept jobs only from protected branches and tags, and keep merge request pipelines on separate runners. [GitLab runner configuration](https://docs.gitlab.com/ci/runners/configure_runners/)

A permission boundary must define allowed permissions and explicit restrictions; a deny-only boundary can leave no usable permissions. Test boundaries against real deployment and execution paths.

## Platform services and resource ownership

| Capability | Terraform owner | Lifecycle concern |
|---|---|---|
| Gateway and baseline policy engine | Platform unit | Changes may affect many consumers |
| Target and workload policy | Component or release unit | Must not replace active behavior during candidate testing |
| Registry | Platform unit | Auth and deletion affect all publications |
| Versioned publication record | Publication unit | Preserve previous approved versions |
| Artifact store | Foundation/shared-services unit | Retention and reader permissions |
| Evidence store | Foundation/shared-services unit | Write-once records, retention and reader permissions |
| Local evaluators and tracing prerequisites | Platform observability/evaluation units | Versioning, cost and prerequisite readiness |
| Memory | Workload or explicitly named domain unit | Retention, identity isolation and migration |

Release manifests, content bundles and evidence stay in S3, and images in ECR, because AWS principals read them with IAM and KMS grants and the harness loads skills from S3 paths. The GitLab package registry suits packages that only pipelines read, such as internal build libraries, since jobs authenticate with their job token. GitLab accepts a republished version by default, so turn off duplicates, add package protection rules and still verify recorded hashes. [GitLab generic packages](https://docs.gitlab.com/user/packages/generic_packages/)

Prefer the AWS provider where its pinned release supports the required schema. Use AWS Cloud Control only for verified gaps. Maintain a resource/provider compatibility inventory with exact versions, replacement-sensitive fields, import support, and a successful apply result. This draft does not assert a fixed resource count or that all examples are supported by a selected provider.

## Environment behavior

Dev and stage should enforce authorization for acceptance testing. Temporary policy observation mode is a diagnostic step with an owner and exit condition. Select evaluation sampling from traffic and risk rather than assuming fixed percentages. Prod activation and approved catalog publication require the chosen review process.

Retain previous releases by explicit reference. Artifact garbage collection must examine deployments, publications, evidence, and rollback windows before deletion; keeping an arbitrary number of recent images is insufficient.

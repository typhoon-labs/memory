# EKS agent platform repository structure

Status: Proposed repository responsibilities. Updated 5 October 2026. [Notes index and terms](README.md)

Two logical shared homes provide reusable implementation and environment selection. Prefer existing infrastructure and cluster configuration repositories where their ownership fits. Source code, tool contracts, prompts and skills remain with the teams that own their behavior. The trees below are proposed layouts, not created repositories.

## Reusable platform implementation

```text
agent-platform/
├── charts/
│   ├── agent/                 # Conventional application conventions
│   └── mcp-server/            # Hosted tool service conventions
├── profiles/
│   ├── kagent/                # Supported runtime configurations
│   └── gateway/               # Common gateway patterns
├── policies/
│   ├── kyverno/
│   └── agentgateway/
├── templates/                 # GitLab CI/CD components (reusable pipelines)
├── starters/
│   ├── agent/
│   ├── mcp-server/
│   └── service-assets/
├── tests/                     # Platform integration and compatibility
└── docs/
```

Use upstream charts directly when practical. Local charts implement organizational application conventions, not wrappers around every upstream chart. A profile is a reviewed example/default configuration, not a new API. Generation from a starter should produce native resources or Helm values that developers can inspect. GitLab requires CI/CD components in a top-level `templates/` directory, so the starters use a different name. [GitLab CI/CD components](https://docs.gitlab.com/ci/components/)

Pin platform commits, CI/CD component references, charts and images; charts and images are in ECR and can be pinned by digest. Maintain a tested compatibility inventory here once experiments begin. Pinning a chart alone does not necessarily pin every image it deploys; inspect rendered output.

## Environment configuration

```text
agent-deployments/             # Or these directories in existing cluster config
├── clusters/
│   ├── dev/
│   │   ├── helmfile.yaml
│   │   ├── platform/          # agentgateway, optional registry/runtime
│   │   ├── domains/
│   │   │   └── payments/      # Routes and permitted tool access
│   │   └── workloads/
│   │       ├── payments-mcp/
│   │       └── incident-assistant/
│   ├── stage/
│   └── prod/
├── access/                    # Reviewed entitlement configuration
├── checks/
└── CODEOWNERS
```

Workload directories contain Helm values or native kagent resource selections according to the supported runtime. Define how any raw resources are packaged/applied through the existing pipeline so they have one owner. Do not invent a universal `deployment.yaml` requiring a custom compiler.

Terraform/OpenTofu/Terragrunt changes stay in the established AWS infrastructure repository. That repository owns assigned IAM, S3, DNS and additional cluster infrastructure. Outputs supply narrow bindings; secret values are not committed or passed as ordinary values.

## Component repositories

```text
payments-service/
├── src/
├── mcp/                       # Adapter when the service needs one
├── agent-assets/
│   ├── skills/
│   └── prompts/
├── tests/
│   ├── contracts/
│   └── authorization/
└── .gitlab-ci.yml             # Includes pinned platform components

incident-assistant/
├── src/                       # Omit for a purely declarative agent
├── config/                    # Native runtime configuration
├── prompts/
├── skills/
├── evals/
│   ├── scenarios/
│   └── expectations/
├── tests/
└── .gitlab-ci.yml
```

Create a separate MCP or asset repository only when independent ownership or release cadence warrants it. Existing REST services can publish guidance without creating an MCP server. Consumer adoption remains an agent/client change.

## Configuration authority

| Item | Authority | Restriction |
|---|---|---|
| Component behavior and contracts | Component source repository | CI cannot expand deployment permissions implicitly |
| Released bytes | ECR, S3 or the GitLab package registry | Released references resolve to immutable content |
| Production version and placement | Environment configuration | Registry/CLI does not independently change these objects |
| Catalog metadata | Publication workflow | Metadata is not production deployment state |
| Declared Kubernetes resources | Assigned Helm release or existing delivery mechanism | No overlapping Terraform/CLI writer |
| Generated children and status | Selected controller | Pipeline does not patch controller-owned fields |
| AWS infrastructure | Existing Terraform/OpenTofu units | One state owner per resource |
| Business authorization | Downstream service | Gateway permission cannot override it |

Agentregistry's deployment integration is worth evaluating, but adopting it as production authority would require changing this table and removing conflicting Helm ownership. Local development may use its CLI independently in a dedicated sandbox. [Registry integration](https://aregistry.ai/docs/agents/deploy/kagent/)

## Review and CI permissions

Component publishers write their own artifact namespace and propose environment updates. Environment-scoped deployment roles apply only approved configuration. Platform owners review shared components, identity and policy changes; service owners review their integrations. Directory ownership is supplemented by actual RBAC/IAM restrictions.

Three GitLab behaviors bear on these boundaries. `CODEOWNERS` approval is enforced only on protected branches where that setting is enabled. With dev, stage and prod in one project and branch, the default CI/CD ID token subject is the same for every environment, so a role is environment-scoped only once the `sub` claim components or separate projects distinguish them. The runners are self-hosted in the EKS cluster, so a job pod's service account and node role are available to every job on that runner; keep deployment rights on ID-token roles and protected runners, not on the runner itself. The [AgentCore foundation note](../AgentCore/foundation-and-services.md#iam-ownership) gives the detail. [GitLab Code Owners](https://docs.gitlab.com/user/project/codeowners/)

A normal release changes component source and its deployment selection. CI results, artifact digests, configuration commits and rendered manifests provide the initial release record. Add additional durable evidence infrastructure only when retention or audit requirements exceed the existing systems.

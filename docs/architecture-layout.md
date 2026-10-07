# Architecture, section 11: repositories and configuration authority

Copied on 2026-10-06 from section 11 of `Docs/AgentGateway/architecture.md`,
the architecture document this demo illustrates. That document is kept next
to this repository, not in it, and is the one to trust if the two differ. It
is here because this repository's layout follows section 11.1, and the README
cites it.

In this repository `agent-platform/`, `agent-deployments/` and each directory
under `components/` stand in for the separate repositories the section
describes. `local/`, `demo/` and `scripts/` exist only for the demo, and so
does `docs/` apart from the contracts.

Where this repository differs from section 11.1:

- **No top-level `agent-deployments/access/`.** What the demo has to say
  about access is all the dev cluster's own (which issuer it trusts, who may
  call each of its routes), so it is inside `clusters/dev/`: `identity.yaml`,
  `domains/<domain>/` and, for the model route,
  `platform/30-model-route/access.yaml`. The demo found nothing that every
  cluster would share.
- **Only what the demo uses is here.** `agent-platform/` has `charts/agent/`,
  `profiles/`, `policies/` and `tests/`, and no `charts/mcp-server/`,
  `packages/`, `templates/`, `starters/` or `docs/`: the one tool server built
  here, `delivery-mcp`, is deployed with `charts/agent/`.
  `agent-deployments/` has `clusters/dev/` alone, and no `stage/`, `prod/`,
  `checks/` or `CODEOWNERS`.
- **`agent-platform/policies/network/` is added.** The network boundaries of
  the agents, the tool servers and Agent Substrate are reusable policy, next
  to `kyverno/` and `agentgateway/`.

## 11. Repositories and configuration authority

Two shared homes hold reusable implementation and environment selection. Source code, tool contracts, prompts and skills stay with the teams that own their behavior. The names are proposals; no repository exists.

### 11.1 Layout

```text
agent-platform/                # Reusable platform implementation
├── charts/
│   ├── agent/                 # Conventional application conventions
│   └── mcp-server/            # Hosted tool service conventions
├── profiles/
│   ├── kagent/                # Supported runtime configurations
│   └── gateway/               # Common gateway patterns
├── policies/
│   ├── kyverno/
│   └── agentgateway/
├── packages/                  # Shared libraries; proposed in the application notes
├── templates/                 # GitLab CI/CD components
├── starters/                  # agent, mcp-server, service-assets
├── tests/                     # Platform integration and compatibility
└── docs/

agent-deployments/             # Or these directories in existing cluster config
├── clusters/
│   ├── dev/
│   │   ├── helmfile.yaml
│   │   ├── platform/          # agentgateway, optional registry and runtime
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

A component repository carries only what it needs:

```text
payments-service/              incident-assistant/
├── src/                       ├── src/          # Omit for a declarative agent
├── mcp/                       ├── config/       # Native runtime configuration
├── agent-assets/              ├── prompts/
│   ├── skills/                ├── skills/
│   └── prompts/               ├── evals/
├── tests/                     │   ├── scenarios/
│   ├── contracts/             │   └── expectations/
│   └── authorization/         ├── tests/
└── .gitlab-ci.yml             └── .gitlab-ci.yml
```

Use upstream charts directly where practical. Local charts implement our application conventions; they are not wrappers around every upstream chart. Terraform, OpenTofu and Terragrunt changes stay in the established AWS infrastructure repository.

### 11.2 Who writes what

(The original shows a diagram here, "Configuration authority: one writer per
object", which is not copied.)

### 11.3 Configuration authority

| Item | Authority | Restriction |
|---|---|---|
| Component behavior and contracts | Component source repository | CI cannot expand deployment permissions implicitly |
| Released bytes | ECR, S3 or the GitLab package registry | A released reference resolves to immutable content |
| Production version and placement | Environment configuration | The registry or a CLI does not independently change these objects |
| Catalog metadata | Publication workflow | Metadata is not production deployment state |
| Declared Kubernetes resources | The assigned Helm release or existing delivery mechanism | No overlapping Terraform or CLI writer |
| Generated children and status | The selected controller | The pipeline does not patch controller-owned fields |
| AWS infrastructure | Existing Terraform or OpenTofu units | One state owner per resource |
| Business authorization | Downstream service | Gateway permission cannot override it |

### 11.4 Review and CI permissions

Component publishers write their own artifact namespace and propose environment updates. Environment-scoped deployment roles apply only approved configuration. Platform owners review shared components, identity and policy changes; service owners review their integrations.

Three GitLab behaviors bear on these boundaries:

- `CODEOWNERS` approval is enforced only on protected branches where that setting is enabled.
- With dev, stage and prod in one project and branch, the default CI/CD ID token subject is the same for every environment. A role is environment-scoped only once the `sub` claim components or separate projects distinguish them.
- A job pod's service account and node role are available to every job on that runner. Keep deployment rights on ID-token roles and protected runners.

Directory ownership is supplemented by actual RBAC and IAM restrictions. Pin platform commits, CI/CD component references, charts and images. Pinning a chart does not pin every image it deploys, so inspect the rendered output.

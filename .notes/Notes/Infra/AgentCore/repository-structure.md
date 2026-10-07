# AgentCore repositories and asset publishing

Status: Proposed structure for the architecture option. Updated 5 October 2026.

The agreed repository names are `agentcore-platform` and `agentcore-deployments`. This note proposes their contents and explains how independently owned agents, MCP servers, and service assets participate. The trees describe responsibilities; they are not repositories created by these notes.

## Platform repository

```text
agentcore-platform/
├── modules/
│   ├── state-backend/
│   ├── network/
│   ├── encryption/
│   ├── identity/
│   ├── gateway/
│   ├── policy-engine/
│   ├── registry/
│   ├── artifact-store/
│   ├── evidence-store/
│   ├── observability/
│   ├── evaluator/
│   ├── harness-workload/
│   ├── runtime-workload/
│   ├── mcp-workload/
│   └── asset-publication/
├── units/                       # Thin Terragrunt wrappers
├── stacks/                      # Reusable compositions
├── functions/                   # Interceptors and review helpers
├── policies/baseline/
├── schemas/
├── scripts/                     # Resolver and validation helpers
├── templates/                   # GitLab CI/CD components (reusable pipelines)
├── starters/                    # Agent, MCP, and asset starters
├── tests/
└── docs/
```

Terraform modules contain reusable resource logic. Terragrunt units and stacks connect modules. Platform functions and CI/CD components begin here and can move to separate repositories when ownership or release cadence justifies the split. Workload-specific code and content stay with their owning teams. GitLab requires CI/CD components in a top-level `templates/` directory, so the starters use a different name. [GitLab CI/CD components](https://docs.gitlab.com/ci/components/)

Publish tested platform versions and pin them in deployment configuration. Commit and artifact digests should provide immutable references even when human-readable version tags are used.

## Deployment repository

```text
agentcore-deployments/
├── root.hcl
├── access/roles.yaml
├── bootstrap/                   # Backend and initial deploy-role setup
├── accounts/
│   ├── shared-services/
│   │   ├── account.hcl
│   │   └── us-east-1/
│   │       ├── region.hcl
│   │       ├── foundation/
│   │       ├── artifact-store/
│   │       ├── registries/
│   │       └── publications/payments/
│   │           ├── terragrunt.hcl
│   │           └── publication.yaml
│   ├── dev/
│   │   ├── account.hcl
│   │   ├── environment.hcl
│   │   └── us-east-1/
│   │       ├── region.hcl
│   │       ├── foundation/
│   │       ├── platform/
│   │       ├── publications/    # Candidate catalog records
│   │       ├── agents/finance-assistant/
│   │       │   ├── terragrunt.stack.hcl
│   │       │   └── deployment.yaml
│   │       └── mcp-servers/payments/
│   │           ├── terragrunt.stack.hcl
│   │           └── deployment.yaml
│   ├── stage/                   # Same environment layout
│   └── prod/                    # Same environment layout
├── .gitlab-ci.yml               # Includes pinned platform components
├── docs/
└── CODEOWNERS
```

This is the proposed sole source of Terraform deployment configuration, including bootstrap. Define the bootstrap sequence before relying on a backend or deploy role created by the platform itself.

Account configuration holds account IDs and deployment role references. Environment configuration holds stage-specific settings. Regional configuration holds regional bindings. Keep secret values out of these files.

Platform owners review shared resource changes. Component owners review their deployment selections. Define review rules for changes that touch both, including workload policies attached to shared engines.

## Component repository types

| Repository type | Suggested name | Publishes | Requires compute deployment |
|---|---|---|---|
| Agent | `finance-assistant-agent` | Harness configuration or runtime artifact plus release manifest | Yes |
| MCP server | `payments-mcp` | Server artifact, schemas, policies, and release manifest | Yes, for a hosted server |
| Service content | `payments-agent-assets` | Skills, prompts, compatibility metadata, and publication manifest | No |

A service may publish content without an agent or MCP server. Its API can remain an existing REST service. Consumers need an approved way to call that API and appropriate credentials; content does not supply either automatically.

If content follows the API's ownership and release process, keep it under `agent-assets/` in the API repository. Create a separate asset repository when content has an independent release cadence or ownership boundary. An optional `agentcore-shared-assets` repository can hold organization-wide content when there is an actual shared owner.

## Standalone service assets

```text
payments-agent-assets/
├── assets.yaml
├── skills/
│   └── use-payments-api/
│       ├── SKILL.md
│       ├── references/api-guide.md
│       └── scripts/             # Optional helpers
├── prompts/
│   └── explain-payment/
│       ├── prompt.yaml
│       └── template.txt
├── evals/
├── tests/
└── .gitlab-ci.yml               # Includes the publication component
```

The proposed `assets.yaml` declares names, versions, supported API versions, required tools or client capabilities, prompt variables, and sensitivity restrictions. These are internal contracts to define, not AgentCore configuration schemas.

Service CI uploads an immutable artifact layout and manifest. The publication pipeline then opens a deployment merge request (MR), and the `asset-publication` module creates catalog records and metadata references. It does not create runtimes, gateways, or agents. CI owns artifact upload; Terraform owns publication records; neither independently adopts the content in a consumer.

Packaging, integrity, registry record types and the publication steps are specified in [skills and prompts](skills-and-prompts.md).

## Consumer adoption

A consumer selects exact content versions in its source configuration. Its release build resolves those selections to hashed artifacts and includes them in its release manifest. A new publication can trigger an update MR, but adoption requires consumer evaluation and deployment approval. Skill loading and prompt composition are specified in [skills and prompts](skills-and-prompts.md#consumer-adoption-and-prompt-composition).

## Configuration vocabulary

| Term | Proposed meaning |
|---|---|
| Release manifest | Immutable component artifact describing exact code, content, and compatibility references |
| Publication manifest | Immutable `manifest.json` built by publisher CI, listing artifact locations, per-file hashes and provenance for one asset bundle version |
| Deployment configuration | Environment-specific resource bindings and active/candidate release selections |
| Publication configuration | Selection of asset versions registered in a particular catalog |
| Evaluation evidence | Results bound to a release hash, configuration revision, dataset, evaluator, and test context |

Keep evaluation evidence and approval events in a durable evidence store, proposed as a platform-owned unit in the shared-services account that pipelines can write to but not overwrite. Store references in deployment reviews. Do not treat a mutable CI status or a catalog record's current status as the complete historical release record.

## Agent and MCP source layouts

```text
finance-assistant-agent/
├── agent.yaml
├── harness/                     # Managed configuration if selected
├── src/                         # Custom implementation if selected
├── prompts/
├── skills/
├── policies/
├── evals/
│   ├── dataset.jsonl
│   └── thresholds.yaml
├── tests/
└── .gitlab-ci.yml               # Includes the release component

payments-mcp/
├── mcp.yaml
├── src/
├── Dockerfile
├── schemas/
├── policies/
├── evals/
├── tests/
│   ├── authorization/
│   ├── tenant-isolation/
│   └── idempotency/
└── .gitlab-ci.yml               # Includes the release component
```

Use only the implementation directories a component needs. Service-owned schemas should remain close to the authoritative API/tool implementation. Release artifacts carry the schema and policy content needed by deployment CI; deployment does not depend on an unpinned checkout of another source repository.

## Resource and review boundaries

| Change | Configuration owner | Required review role |
|---|---|---|
| Module/provider upgrade | Platform repo and deployment pin | Platform owner plus affected component owners |
| Gateway/auth/baseline policy | Platform deployment unit | Platform and identity/security owners |
| Component runtime, target or workload policy | Component deployment unit | Component owner; platform owner for shared impact |
| Agent content dependency | Agent source release and deployment selection | Agent owner |
| Service publication | Publication unit | Service owner and selected catalog curator |
| Shared role/entitlement mapping | Deployment access configuration | Identity and affected domain owners |

CODEOWNERS and CI authorization should reflect these boundaries. GitLab enforces Code Owner approval only on protected branches where that setting is enabled. Folder ownership alone does not restrict what an overly broad deployment role can mutate. Review generated permission differences and affected consumers in addition to resource plans. [GitLab Code Owners](https://docs.gitlab.com/user/project/codeowners/)

## Dependency and state conventions

Keep each unit's state address stable across repo reorganizations; renaming folders may require explicit backend migration. Do not move state implicitly because a source repository or directory was renamed. Dependencies form a directed graph and should expose narrow resource bindings.

Store artifact references in versioned component manifests; store account-specific ARNs and resource bindings in deployments. A resolver validates both before generating module inputs. It is proposed as platform-owned code under `scripts/` in `agentcore-platform`, versioned with the platform pin, because what it generates is what reviewers see in the plan. Shared resources have one owner, and multiple workload units reference that owner without duplicating resource declarations.

Filtered plans must include affected dependency units and shared-resource impacts. Component releases and platform upgrades should produce different review scopes. Pin CI/CD components to immutable commits and version their input contracts.

## Reusable pipeline contracts

Proposed reusable pipelines, published as GitLab CI/CD components, include component build/release, service asset publication, deployment validation/plan, candidate apply/evaluation, activation, and retention cleanup. Inputs identify component, release manifest/hash, target environment and approved unit scope. Outputs identify artifacts, plans and evidence references.

Publisher pipelines can upload artifacts and propose MRs but cannot activate production workloads. A GitLab CI/CD job token cannot create a merge request, so proposing one in `agentcore-deployments` needs a named credential that can neither merge nor deploy, such as a project access token or a downstream pipeline in the deployment repository. Deployment pipelines use account/environment-scoped roles. Approval checks occur before activation and confirm the currently expected active release. The complete protocol is described in [release promotion](release-and-promotion.md). [GitLab job token](https://docs.gitlab.com/ci/jobs/ci_job_token/)

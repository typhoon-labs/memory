# Application structure and reuse

Status: Proposed application conventions. Updated 5 October 2026. No package, starter or application has been built.

These notes propose how TypeScript and Python components are built so that teams reuse shared work, change only the parts they need and still receive upstream updates. Behavior is shared as versioned packages and a base application image. A thin starter supplies repository plumbing. A team customizes at one of four levels and takes each upstream change as a merge request (MR) it chooses to merge.

The conventions sit above the platform. They apply to both options in the [comparison basis](../Infra/README.md) and select neither. Between the two options only bindings and the deployment selection differ.

## Reading guide

| Document | What it helps us decide |
|---|---|
| This page | Customization levels, where shared work lives, decisions with their rejected alternatives, the package contract and what changes under each platform option |
| [Worked examples](worked-examples.md) | What a team does at each level, and how an upstream change reaches it |
| [Validation plan](validation-plan.md) | Values to agree, open decisions, order of work and experiments |

## Customization levels

A team goes only as deep as its use case needs. The levels name paths the infrastructure notes already define; the layouts in the last column are the component repositories in both options' repository notes. [EKS](../Infra/AgentGateway/repository-structure.md#component-repositories), [AgentCore](../Infra/AgentCore/repository-structure.md#agent-and-mcp-source-layouts)

| Level | Team writes | Image | Matching layout |
|---|---|---|---|
| 0. Configure | Prompts, skills, scenarios and the choice of model and tools | Built by the pipeline from the base application image; no code or Dockerfile in the repository | An agent repository without `src/` |
| 1. Publish a capability | An MCP adapter or a guidance bundle in the service repository | Only for a hosted MCP server | `payments-service/mcp/` and `agent-assets/` |
| 2. Compose | A thin application that imports the packages and adds hooks, routes, agents or a session store | Its own | An agent repository with `src/` |
| 3. Replace a piece | Its own implementation of one package behind the same protocol, such as a different UI | Its own | None; outside the starters |

Level 0 produces an artifact like any other release. The pipeline bakes pinned content onto the base image, runs the scenarios and publishes one digest, so the bytes that were evaluated are the bytes that run.

Level 1 does not touch the assistant's code. A tool published as an MCP server deploys on its own schedule, is authorized at the gateway, serves any consumer and can be written in either language.

Moving from level 0 to level 2 adds `src/` and a Dockerfile to the same repository. If several teams reach level 3 for the same piece, the package boundary is in the wrong place.

## Where shared work lives

Each kind of shared work has one home and reaches a component as a pinned reference. Only the last row copies files.

| Shared work | Home | Component pins | Update arrives as |
|---|---|---|---|
| Pipeline logic | GitLab CI/CD components in the platform repository's `templates/` | Component reference | Version bump MR |
| Deployment conventions | `charts/agent` and `charts/mcp-server` (EKS); workload modules (AgentCore) | Chart or module version in environment configuration | Selection MR |
| Runtime behavior | Packages in the GitLab package registry | Lockfile | Version bump MR |
| Base application image | ECR | Digest | Digest bump MR |
| Repository plumbing | `starters/`, rendered with Copier | Template tag in `.copier-answers.yml` | `copier update` MR |

Packages are a new item for the platform repository; neither option's proposed tree has a directory for them. They fit the registry rule both options state: the GitLab package registry holds what only pipelines read, with duplicates turned off and hashes verified. [EKS](../Infra/AgentGateway/foundation-and-services.md#existing-infrastructure-and-additions), [AgentCore](../Infra/AgentCore/foundation-and-services.md#platform-services-and-resource-ownership)

Keep logic out of the starter. A generated entry point is about ten lines that call the library, and the generated `.gitlab-ci.yml` only includes pinned components. Copier re-applies template changes to an existing repository as a merge, so a starter that holds only plumbing rarely conflicts. It requires a Git-tagged template, a Git destination and an answers file that is never edited by hand. [Copier updating](https://copier.readthedocs.io/en/stable/updating/)

## Decisions and rejected alternatives

| Decision | Proposed | Rejected | Reason |
|---|---|---|---|
| How behavior is shared | Versioned packages and a base application image | A template repository that teams fork or copy | A copy holds logic, and every later fix must be merged into it. A pinned reference takes a fix as a version bump |
| What the starter holds | Repository plumbing only, with an update path | A full application skeleton, or a copy-once generator | A skeleton is copied logic again. A copy-once generator leaves plumbing with no way to receive changes |
| Team code in the base image | None. Code in the request path means the team builds its own image | A plugin loader that fetches team packages at start | The image that was evaluated would not be the code that runs, loaded code runs with the assistant's credentials, and a loader is an interface to maintain. [EKS](../Infra/AgentGateway/release-and-promotion.md#default-flow), [AgentCore](../Infra/AgentCore/architecture-option.md#design-principles) |
| Custom tools | An MCP server behind the gateway | In-process tool plugins | An in-process tool is tied to one assistant's release, language and credentials. [EKS](../Infra/AgentGateway/workload-deployment.md#supported-paths), [AgentCore](../Infra/AgentCore/workload-deployment.md#workload-implementations) |
| System prompt and skills | Pinned content in the assistant's repository, baked into its image | A Helm value or deployment field | Behavior belongs with component source and is evaluated before release; environment configuration holds only bindings. [EKS](../Infra/AgentGateway/workload-deployment.md#workload-configuration), [AgentCore](../Infra/AgentCore/release-and-promotion.md#release-identity) |
| Assistants per deployment | One release per assistant | One deployment serving many assistant configurations | A single workload identity would hold every assistant's tool permissions, and one rollback would move them all. [EKS](../Infra/AgentGateway/foundation-and-services.md#workload-and-secret-identity), [AgentCore](../Infra/AgentCore/foundation-and-services.md#iam-ownership) |
| How upstream changes arrive | An MR that the owning team merges | A floating tag or an automatic rollout | A running consumer must not change without its own checks. [EKS](../Infra/AgentGateway/skills-and-prompts.md#consumer-adoption), [AgentCore](../Infra/AgentCore/skills-and-prompts.md#consumer-adoption-and-prompt-composition) |
| Message rendering in the UI | A fixed set of typed message parts in the stock UI | Runtime UI extension such as module federation | No second team has asked for it, and a team's own UI build at level 2 or 3 covers the need without a new interface |
| UI to server protocol | Adopt a published protocol | Define our own | Level 3 needs a seam that other clients can also speak. None is chosen; see the [validation plan](validation-plan.md#open-decisions) |
| Where platform rules are enforced | The gateway, admission and network | The shared library | A level 2 or 3 team can omit the library, so it is a convenience and not a control. [EKS](../Infra/AgentGateway/foundation-and-services.md#bypass-enforcement-candidates), [AgentCore](../Infra/AgentCore/identity-and-authorization.md#isolation-and-bypass-prevention) |
| Languages | Chosen per component; protocols are the contract between them | A matching library in both languages from the start | Delivery effort is scored by custom code written. [Scorecard](../Infra/README.md#scorecard) |
| How the library is designed | Extracted from the first hosted application | Designed before any application exists | Its scope is unknown until one application has met the obligations listed below |

Where the selected runtime's native declarative agent meets the need (a kagent AgentTemplate or an AgentCore harness), use it for level 0 and do not write a configuration schema of our own.

## Package contract

Packages, charts, CI/CD components, starter tags and the base image follow the same rules.

| Rule | Proposal |
|---|---|
| Versions | Semantic versions; consumers pin an exact version or digest |
| Immutability | A published version never changes. Turn off duplicates in the GitLab package registry and verify lockfile hashes |
| Breaking change | A changed exported interface; a changed default that alters behavior, such as a limit, timeout or authentication setting; newly required configuration; a raised minimum runtime version; a change to the message parts or configuration keys the base image accepts |
| Compatibility | Shown by tests, not inferred from a version number. Platform CI renders each starter and runs its generated tests against a candidate release before it is published |
| Support window | The previous major version receives security fixes for an agreed period while a component pins it. The period is not agreed |
| Security fixes | Offered as an ordinary MR. Accelerated adoption needs a named incident owner |
| Withdrawal | Only after listing the components that pin the version |

These follow what both options already require of published content: compatibility as tested claims, a transition period for superseded versions and reference-aware retirement. [EKS](../Infra/AgentGateway/skills-and-prompts.md#retirement-and-incident-response), [AgentCore](../Infra/AgentCore/skills-and-prompts.md#tests-and-breaking-changes)

## Under each platform option

The second column is the scope of the shared library: the obligations both options place on a hosted application. Nothing else belongs in it yet. The last two columns are bindings the library reads from configuration. The intent is that the same packages run under either option; the [validation plan](validation-plan.md#experiments-and-expected-evidence) tests that.

| Concern | Same under both | EKS option | AgentCore option |
|---|---|---|---|
| User identity | Verify the caller at the entry point; derive tenant and session from verified context, never from headers or prompt text | Okta at a gateway route, or verified by the entry point itself. [Runtime traffic](../Infra/AgentGateway/architecture-option.md#runtime-traffic) | Corporate JWT; one inbound method per runtime, and the caller binds sessions to users. [Authentication](../Infra/AgentCore/identity-and-authorization.md#authentication-by-connection) |
| Model access | Never hold a provider key; endpoint and credential come from bindings | Gateway model endpoint with a gateway-issued or Okta-derived credential. [Model access](../Infra/AgentGateway/identity-and-authorization.md#model-access) | Execution role and approved model list; an inference gateway is optional later. [Gateway boundaries](../Infra/AgentCore/workload-deployment.md#gateway-boundaries) |
| Tool access | MCP through the governed gateway; delegated context or a scoped machine credential; a stable operation identifier on every write | Agentgateway. [Connection matrix](../Infra/AgentGateway/identity-and-authorization.md#connection-matrix) | Domain tool gateway with a supported delegation flow. [Authentication](../Infra/AgentCore/identity-and-authorization.md#authentication-by-connection) |
| Execution bounds | Limits on concurrency, time, iterations and tokens; bounded retries; graceful shutdown | Set in the application. [Execution choices](../Infra/AgentGateway/workload-deployment.md#execution-choices) | Set in the runtime or harness release. [Runtime configuration](../Infra/AgentCore/workload-deployment.md#runtime-and-harness-configuration) |
| Session state | Held outside the process, with declared behavior across a rollout | CloudNativePG where supported. [State and recovery](../Infra/AgentGateway/workload-deployment.md#state-and-recovery) | AgentCore memory owned per workload. [Memory](../Infra/AgentCore/workload-deployment.md#memory-and-execution-sandboxes) |
| Telemetry | OTel instrumentation with release and environment attributes; trace context propagated to tools | Existing collector topology. [Telemetry topology](../Infra/AgentGateway/evaluations-and-operations.md#telemetry-topology) | OTLP over HTTP to a collector; harness telemetry goes to CloudWatch. [Observability](../Infra/AgentCore/evaluations-and-operations.md#opentelemetry-and-external-observability) |
| Runtime contract | Health endpoints and one entry protocol | A conventional Deployment, or kagent's contract of A2A over gRPC on port 80 with `GET /readyz` on 8081. [Execution choices](../Infra/AgentGateway/workload-deployment.md#execution-choices) | HTTP, MCP or A2A on a custom runtime. [Runtime configuration](../Infra/AgentCore/workload-deployment.md#runtime-and-harness-configuration) |
| Level 0 content | Pinned and integrity-checked | Baked onto the base image | Baked into a runtime image, or immutable S3 paths that a harness loads once per session. [Consumer adoption](../Infra/AgentCore/skills-and-prompts.md#consumer-adoption-and-prompt-composition) |
| Deployment selection | One selection per assistant per environment | Helm values under `agent-deployments`. [Environment configuration](../Infra/AgentGateway/repository-structure.md#environment-configuration) | `deployment.yaml` under `agentcore-deployments`, with active and candidate releases. [Candidates](../Infra/AgentCore/workload-deployment.md#candidate-and-active-resources) |

## Proposed layout

Names are hypothetical. Only the `packages/` directory is new to the platform tree.

```text
agent-platform/                # Or agentcore-platform
├── packages/
│   ├── node/                  # Shared library for TypeScript components
│   └── python/                # Added when a Python component needs it
└── starters/                  # Existing; rendered with Copier

chat-assistant/                # Component repository; owner not assigned
├── packages/
│   ├── server/                # Entry point, sessions, agent loop, hook points
│   └── ui/                    # Renders typed message parts
├── image/                     # Base application image for level 0
└── .gitlab-ci.yml

<generated component>/
├── .copier-answers.yml        # Template tag; changed only by Copier
├── .gitlab-ci.yml             # Includes pinned components; no job logic
├── Dockerfile                 # Level 2 only
├── src/                       # Level 2 only; entry point calls the library
├── prompts/
├── skills/
├── evals/
└── tests/
    └── authorization/         # One permitted and one denied case
```

The chat application is proposed in TypeScript so that the UI and server share types. MCP adapters follow the language of the owning service. The Python library waits for its first consumer.

## Documentation conventions

These notes hold decisions and their reasons. Once the starters and packages exist, instructions for developers belong in the platform repository's `docs/`, where they version with the code. Examples describe intended workflows, not verified commands. Record an architecture decision record when a decision here is made, deferred or rejected.

# Agentgateway and artifact distribution

| | |
|---|---|
| Status | Proposal, with verified capabilities |
| Updated | 4 November 2026 |
| Versions checked | Agentgateway OSS **1.7.0** (27 October 2026; the demo runs it). Solo Enterprise for agentgateway 2026.10.x. Agentregistry OSS **0.4.0** (3 August 2026; no release since). Sources: agentgateway.dev docs, docs.solo.io OSS-versus-Enterprise table, GitHub releases and issues, read 4 November 2026 |

## Verdict

- **Adopt Agentgateway OSS as the single control point** for model, MCP and
  A2A traffic, in Kubernetes mode, pinned to a minor version and upgraded on
  a schedule. Its OSS feature set covers the minimum platform. The
  Enterprise edition is a credible upgrade path for four specific gaps
  (below), not a prerequisite.
- **Do not make Agentregistry OSS a system of record.** Version 0.4.0 ships
  without authentication, allows replacing a tag, and runs one replica.
  GitLab and ECR hold the artifacts; a generated catalog indexes them.
  Agentregistry can be added later as a read-only discovery front end.

## Agentgateway: what is verified

Labels: **D** documented upstream, **O** observed in the demo, **I** inferred.

| Need | OSS 1.7.0 | Enterprise only | Evidence |
|---|---|---|---|
| Approved models only | CEL on the request body (`json(request.body).model in [...]`); model aliasing and virtual models | | D; O (`agent-platform/profiles/gateway/model-route/templates/backend.yaml:55-59`) |
| Bedrock | Runtime (Converse) GA; **Mantle** (native Anthropic Messages and OpenAI) since 1.6.0; native Runtime Messages experimental in 1.7.0. One region per backend. IRSA and Pod Identity through the AWS SDK chain, or `assumeRole` | | D ([Bedrock provider](https://agentgateway.dev/docs/kubernetes/latest/integrations/llm/providers/bedrock/)); demo: **no completion from Bedrock yet** |
| Client formats | OpenAI Chat Completions and Responses, Anthropic Messages (with `count_tokens`), embeddings | | D |
| JWT authentication | Multiple issuers matched by `iss` and `kid`; strict, optional, permissive | | D; O |
| MCP OAuth | Protected-resource metadata, authorization-server metadata rewrite, client registration proxy; guides for Keycloak and Okta | Consent screen, eager auth for desktop agents, OAuth scope restriction, elicitation | D; O (gap 3 open: issuer reachability) |
| Coarse authorization | CEL over claims, route, model, MCP tool name (filters `tools/list`), A2A | Built-in ext_authz with OPA/Rego | D; O |
| Token exchange | RFC 8693 and RFC 7523 *client* exchanges, ID-JAG, Entra on-behalf-of | Solo STS (impersonation, delegation, elicitation), on-behalf-of claim propagation | D |
| Request and token rate limits | Local (per replica), keyed by CEL. Global needs an external Envoy rate-limit service plus Redis or Valkey | Built-in global rate-limit server | D |
| Budgets | Per virtual key, USD or tokens, needs the gateway database | `EnterpriseAgentgatewayBudget` CRD with alerts | D |
| Concurrency | Listener-level `maxConcurrentRequests` and `maxConnections` only. **No per-user or per-workflow concurrency limit** | | D |
| Usage and cost | Per-request tokens (`llm.providerInputTokens` for the provider's figure), cost estimate from a model price catalog, `agentgateway_gen_ai_client_cost_usd_total`, LLM analytics UI | Cost management UI on ClickHouse | D; O (screenshots in [the demo review](20-demo-review.md)) |
| Billing reconciliation | Per-request STS `AssumeRole` with session name and tags from the JWT, so CloudTrail and cost allocation tags carry the principal; fails closed | | D ([attribution](https://agentgateway.dev/docs/kubernetes/latest/documentation/llm/cost-controls/attribution/)); latency at volume **to validate** |
| Telemetry | OTel spans with GenAI attributes (`gen_ai.operation.name`, provider, models, tokens), `mcp.method.name`, `jwt.sub`; CEL-enriched access logs over OTLP | | D; O |
| Guardrails | Regex, Bedrock Guardrails, webhooks, MCP CEL, remote guardrails | Purview DLP, conditional guards | D |
| Istio | OSS guides for ingress to ambient and egress waypoint. Upstream Istio's agentgateway support is experimental | East-west waypoint: alpha, needs Solo's Istio distribution | D |
| Stdio MCP servers | Standalone mode only; not in the Kubernetes CRDs | | D |

### Things that will bite

| Issue | Effect | Mitigation |
|---|---|---|
| **Monthly minors that change behavior** (1.5 enforced `iss`/`aud`; 1.7 rejects pre-upgrade MCP sessions). CRDs are `v1alpha1`. No backports beyond critical fixes | Upgrades are work, every month | Pin; upgrade monthly through a staging gateway with the conformance suite; buy LTS only if this becomes the dominant cost |
| **Claude Code through Converse loses features:** `document`, `search_result`, server tools and tool search are dropped, and the query string (`?beta=true`) is not forwarded | Silent quality loss for coding harnesses | Route Claude models with `endpointPreference: MantlePreferred` where Bedrock serves them on Mantle. IAM must then allow the `bedrock-mantle` service. Inline Bedrock guardrails force Runtime, so use gateway guardrails instead. **To validate in step 1** |
| Unknown `kid` does not trigger a JWKS refetch; the controller refetches every 5 minutes (#2798) | A key rotated in without pre-publication fails every request for up to 5 minutes | Publish the next key at least 10 minutes before use (Keycloak and chain-sts rotation runbooks) |
| A USD budget is not enforced for a model without a price entry (#4143) | Budget bypass with a new model | Allow only models that have a price entry: one list drives both |
| A rate-limit descriptor whose CEL fails allows the request (#3523) | Fail-open limits | `has()` guards and a fallback descriptor; a conformance test for it |
| `initialize` returns instructions of MCP targets the caller cannot use (#3708) | Information disclosure in multiplexed MCP | Do not multiplex MCP servers with different audiences behind one route |
| Buffered bodies past the memory budget OOM-kill instead of 429 (#3184) | One large request can restart a proxy | Request size limits; replicas across zones |
| **Observed in the demo:** a proxy that restarts while its PostgreSQL is down stays down | Gateway outage tied to database outage | Highly available PostgreSQL, or no database dependency on the data path |

### Where each control lives

One owner per decision. Two systems never make the same decision.

| Control | Gateway | Mesh or NetworkPolicy | Identity (Keycloak, chain-sts) | Application or workflow | Tool or service | AWS IAM |
|---|---|---|---|---|---|---|
| Who the caller is | Verifies | | Issues | | Re-verifies | |
| Which routes, agents, tools and models | **Decides** | | | | | |
| Which agent may act for a user, on which target | Enforces current actor | | **Decides** (exchange policy) | | Enforces current actor | |
| Business rules, ownership, approvals, state | | | | | **Decides** | |
| Who may open a connection to a backend | | **Decides** | | | | |
| Which AWS models the platform may invoke | | | | | | **Decides** (gateway role only) |
| Request and token rate limits, budgets | **Decides** | | | | | |
| Concurrency, deadlines, step and iteration limits per task | | | | **Decides** (shared package, conformance-tested) | | |
| Cost attribution | Records | | Supplies claims | Supplies workflow and task IDs | | Records (session tags) |

Runaway work is the gap. The gateway can cap tokens per principal per
window, but it cannot see that 400 calls belong to one stuck task. Task
deadlines, iteration caps and per-task budgets therefore live in the
application, are set by the shared package, and are tested by the
conformance suite ([Frameworks and charts](15-frameworks-and-charts.md)).
The gateway's per-principal limit is the backstop.

### Bypass prevention, by layer

| Bypass | Control | Test |
|---|---|---|
| A pod calls Bedrock directly | Only the gateway's role has `bedrock:InvokeModel*` and `bedrock-mantle:*`; an SCP or permission boundary denies them to every other role in the account; the Bedrock VPC endpoint policy allows only the gateway role | Call Bedrock from a test pod with a workload role: denied |
| A pod calls a public model API | Egress default-deny for workload namespaces; only the gateway may egress to model hosts | `curl` to the provider from a workload pod: blocked |
| A pod calls a tool or agent directly | NetworkPolicy or Istio `AuthorizationPolicy`: backends accept only the gateway's identity. The tool also enforces the current actor (the demo's tool did not) | Call the tool's Service from a workload pod: refused twice |
| A team ships a `Backend` pointing at a model host, or a route without policy | Kyverno rules, exempting only the platform deployer's identity (not labels) | Apply the manifest as a team: rejected |
| A developer uses personal AWS credentials for Bedrock | IAM: developer roles do not have Bedrock invoke. Harness configuration from the org CLI | Periodic CloudTrail query for `InvokeModel` by non-gateway principals |
| A coding harness uses a vendor subscription instead of the gateway | Policy, managed settings where the harness supports them, and the CLI's `check`. Not fully enforceable on a laptop | Usage by user in the gateway against seats issued |

### Budgets and limits for the minimum platform

1. **Per-principal token limits** with local rate limiting, keyed on
   `jwt.sub` for people and on the workload's client ID for automation. Local
   limits are per replica, so set them at limit ÷ replicas.
2. **Per-workload budgets** with virtual keys only where a workload cannot
   carry a user token (the demo's workload-key pattern).
3. **Global limits later:** run the Envoy rate-limit service with Valkey when
   per-replica accuracy is no longer good enough, or buy the Enterprise
   server. That decision needs real traffic data.
4. **Reconcile monthly:** gateway token totals against the Cost and Usage
   Report by model and by the `AssumeRole` session tags. Investigate a
   difference above 5%. The gateway's USD figure is an estimate.

## Artifact distribution

### What Agentregistry 0.4.0 does and does not do

| Question | Finding (documented upstream unless marked) |
|---|---|
| Artifact types | Agent, MCPServer, Skill, Prompt, Plugin, Model, plus Runtime and Deployment objects. **No workflows** |
| What it stores | Metadata and pointers in PostgreSQL. Not an artifact store. Skills and plugins point to Git (commit pinned by the controller) or OCI (plugins must use `@sha256`); prompts are inline |
| Versioning | Free-form tag, default `latest`; `apply` can replace an existing tag. No semver, no immutability except a resolved commit or digest |
| Metadata | Name, labels, annotations, tag, title, description. No owner, support status, provenance or compatibility fields; labels and annotations only |
| Harness install | `arctl configure claude-code \| cursor \| vscode \| kiro` writes only the registry's own MCP entry. No Codex. A read-only Claude Code plugin-marketplace endpoint and an MCP Registry v0.1 API for VS Code |
| Authentication | **OSS default omits authentication, and the authorizer allows everything.** Enterprise adds OIDC RBAC, approvals and audit logs (separate license) |
| HA | Helm default `replicaCount: 1`; HA not documented |
| Upgrade | 0.3 to 0.4 was a reinstall with a new database |
| Observed in the demo | Two MCP servers and four agents, all `latest`; no skills, because 0.4.0 took skills only from Git |

### Recommended model: GitLab is the source of truth, OCI is the package format

| Artifact | Built from | Package | Stored in | Installed by | Registry support |
|---|---|---|---|---|---|
| Hosted agent or MCP server | Its GitLab project | Container image + two Helm charts | ECR (OCI), by digest | GitOps (Helm) | Agentregistry Agent or MCPServer entry (pointer). Native |
| Remote MCP server for harnesses | Its GitLab project | Gateway route + client config snippet | Gateway | Org CLI writes harness MCP config | Native as `remote` MCPServer. Client config: **adapter** |
| Skill | `skills/<name>/` in a GitLab project | OCI artifact (`oras push`), one skill per artifact, signed | ECR, by digest | Org CLI copies into the harness's skills directory | kagent mounts OCI skills by digest. Harness install: **adapter** |
| Shared prompt | Prompt file in GitLab | OCI artifact, or Langfuse prompt with a protected label | ECR or Langfuse | Application at build time (pinned), not at run time | Inline Prompt entry. Native but mutable |
| Claude Code plugin | Plugin directory in GitLab | Git tag | GitLab | Claude Code marketplace pointing at a GitLab repo | Agentregistry marketplace endpoint, read-only |
| Workflow definition | Workflow file in the owning project | Part of that project's release | ECR or GitLab release | The workflow runner, pinned | **None.** Index entry only |
| Project template | Template repository | Git tag | GitLab | Copier, through the org CLI | None needed |

Every release is immutable: a Git tag, an OCI digest, a signature (cosign)
and a provenance attestation from the GitLab pipeline. The catalog entry
holds metadata; the artifact holds content.

### Catalog metadata (one file per artifact, validated in CI)

```yaml
apiVersion: platform.example.com/v1
kind: CatalogEntry
metadata:
  name: k8s-diagnosis-runbook          # unique per kind
  kind: skill                          # agent | mcp-server | skill | prompt | plugin | workflow | template
spec:
  owner: team-platform                 # a GitLab group; must exist
  support: supported                   # supported | community | experimental | deprecated | retired
  version: 1.4.0                       # semver; release tag is v1.4.0
  digest: sha256:...                   # filled by the release pipeline, never by hand
  source: https://gitlab.example.com/platform/skills/-/tree/v1.4.0/k8s-diagnosis
  provenance:
    signature: cosign                  # verified by the CLI before install
    attestation: slsa-provenance-v1
    reviewedIn: "platform/skills!1234" # the merge request that approved this release
  compatibility:
    harnesses: [claude-code, codex, kagent]
    platformContract: ">=1.2 <2"
    models: [claude-sonnet]            # families it was evaluated with
  requires:
    tools: [observability-mcp:get_logs, delivery-mcp:get_incident]
    routes: [/mcp/observability, /mcp/delivery]
    roles: [developer]
  evaluation:
    suite: evals/k8s-diagnosis         # in the source project
    lastRun: 2026-10-30
    result: https://langfuse.example.com/...  # dataset run
  lifecycle:
    deprecatedAfter: null
    replacedBy: null
```

### Lifecycle

| Event | What happens | Who |
|---|---|---|
| Release | Tag in GitLab; pipeline builds, signs, attests, pushes by digest; updates the catalog index; runs the artifact's evaluations | Owner merges; pipeline does the rest |
| Update | `platform outdated` lists newer versions against the project's lock file; `platform update <name>` re-pins | Consumer |
| Rollback | Re-pin the previous digest; for hosted apps, revert the GitOps change | Consumer or owner |
| Deprecation | `support: deprecated` with `replacedBy` and a date; the CLI warns on install and on `check` | Owner |
| Retirement | Removed from the index; artifact kept for reproducibility; gateway routes removed after the date | Owner, platform |
| Ownership lapse | A catalog entry whose owner group is empty or archived fails CI; entries without a passing evaluation for 180 days move to `community` | Platform (automated) |

### Registry outage

Nothing in the request path depends on the catalog. Hosted applications pull
images by digest from ECR; installed skills and MCP configuration are files
on the developer's machine; the gateway has its own configuration. A catalog
outage stops search and new installs only. The org CLI caches the index and
can install from a digest directly.

## The org CLI (thin, reusing what exists)

| Command | Does | Reuses |
|---|---|---|
| `platform login` | Device-flow sign-in at Keycloak; writes the gateway base URL and a token helper into each installed harness's settings | Keycloak; each harness's own config files and token helpers |
| `platform search`, `info` | Reads the catalog index (cached) | Static JSON index in GitLab Pages or S3 |
| `platform install <artifact>@<version>` | Verifies signature, pulls by digest, writes to the harness's location through a per-harness adapter, records it in a lock file | `oras`, `cosign`, `claude mcp add`, `codex mcp add` |
| `platform new <template>` | Creates a project from a versioned template | Copier |
| `platform update` | Template update plus artifact re-pin, as one merge request | Copier `update`, `glab` |
| `platform check` | Harness points at the gateway; telemetry configured; artifacts pinned and not deprecated; charts compatible | Conformance checks shared with CI |
| `platform test <endpoint>` | Runs the framework-independent conformance suite against a deployed agent or MCP server | pytest suite in a container |

Write it as a small Go or Python CLI with one adapter per harness. It
should hold no logic the pipeline does not also run: `check` and `test` call
the same suite CI runs.

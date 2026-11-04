# Operating model

| | |
|---|---|
| Status | Proposal. Objective values are starting points for agreement, not commitments |
| Updated | 4 November 2026 |

## Service tiers and on-call

| Tier | Services | On-call | Why |
|---|---|---|---|
| 0 | Agentgateway, Keycloak and its database, chain-sts | Platform rotation, 24x7, paged | Every governed call depends on them, and they fail closed |
| 1 | Audit and usage pipelines, gateway database, CloudNativePG for tier 0 | Platform rotation, paged in business hours, ticket out of hours | Loss of records is a compliance problem, not an outage |
| 2 | Langfuse, catalog, org CLI, templates | Business hours | Outside the request path |
| Team | Each agent, MCP server and workflow | The owning team's rotation | The platform does not carry team pagers |

Support boundaries:

- **Paths 1 and 2** (declarative, Python template): the platform supports the
  template, shared package, charts, gateway, identity and observability.
  Teams own their code, prompts and evaluations.
- **Path 3** (independent implementations): the platform supports everything
  up to the contract (gateway, identity, charts, conformance suite) and
  nothing inside the application.
- Office hours twice a week; a support channel with a one-business-day
  response for tier 2 questions.

## Service objectives (proposed)

| Objective | Starting value | Measured by |
|---|---|---|
| Gateway route availability | 99.9% monthly (excluding upstream provider errors) | Synthetic probes per route class; gateway 5xx not caused by upstream |
| Gateway added latency | p99 under 50 ms (excluding upstream time) | Gateway metrics: total minus upstream |
| Keycloak token endpoint availability | 99.9% monthly | Synthetic client-credentials grant every minute |
| chain-sts availability and latency | 99.9%; p99 under 100 ms | Synthetic exchange every minute |
| Deactivation to refusal | 20 minutes or less | Monthly leaver drill (REV-1) |
| Audit stream completeness | 100%; any loss alerts within 15 minutes | Sequence numbers per producer; collector queue metrics |
| Usage ledger freshness | Within 24 hours; reconciled monthly within 5% of CUR | Ledger job; FinOps report |
| Langfuse ingestion lag | p95 under 5 minutes (best effort) | Queue depth metric |
| Template and package support | Current and previous minor | Release notes |

## Degraded operation

| Failure | Designed behavior | Users see |
|---|---|---|
| Bedrock throttling or regional issue | Global cross-region inference spreads load across regions; the gateway returns a typed 429 or 503 and the shared package retries within the task's deadline. (Gateway-level failover between backends is **to validate**: one region per Bedrock backend is documented) | Slower or failed model calls; agents report "model unavailable" |
| Keycloak down | Issued tokens work until expiry; sign-in and refresh fail | New sessions fail after up to 15 minutes |
| chain-sts down | Delegated calls fail closed with a typed error; no fallback to the caller's token | Agents that act for users stop; their own-identity work continues |
| Gateway database down | Data path continues; analytics stop; **a restarting proxy must still start** (the demo's proxy did not) | Nothing, if the start dependency is removed |
| Valkey down | Global rate limits follow per-route policy (fail open for reads, closed for writes); caches cold | Possibly slower |
| Collector tier 2 down | Tier 1 buffers; audit and usage queues persist to disk and alert | Nothing |
| Langfuse down | Exporters drop after their queue fills; agents continue | No new traces or evaluations |
| Catalog down | Installs from cache or by digest | Search unavailable |
| Approval store down | Writes refuse ("cannot verify approval"); reads continue | Changes wait |

## Isolation

| Boundary | Mechanism |
|---|---|
| **Environments** (dev, staging, production) | Separate gateways, Keycloak realms, chain-sts keys, Bedrock IAM roles and Langfuse organizations. Production in its own cluster where that is current practice. No token from one environment is valid in another (`iss` and `aud` differ) |
| **Teams** (the tenant unit) | Namespace per team; gateway routes and budgets per team; Langfuse organization per team; Valkey ACL user and PostgreSQL role per application; S3 prefix and KMS key per data class |
| **Agents** | Service account per agent; delegation policy per agent and target; NetworkPolicy so only the gateway reaches it |
| **Users** | Every delegated call carries `sub`; tools enforce the user's own permissions (search as the user, Kubernetes impersonation) |
| **Data classes** | Content capture, retention and which Langfuse project a trace may enter are set by the agent's declared data class; restricted classes do not send content to Langfuse until Enterprise retention controls exist |

## Prompt injection: where it is contained

Untrusted text enters through code, documents, logs, tickets, web pages and
tool responses. The model cannot be relied on to ignore it, so containment
is structural:

| Control | Where |
|---|---|
| Read and write tools are separate; read-only agents have no write tools at all | Agent design, enforced by gateway tool policy |
| Every write needs a human approval of the exact parameters and resource version, enforced by the executing tool | Tool (APR tests) |
| Agents act with the user's permissions, never more | chain-sts narrowing; tools search and act as the user |
| Model output that drives code is schema-validated; free text is rendered, never executed | Shared package, publisher jobs |
| Links and instructions in retrieved content are not followed automatically | Tool design |
| Guardrails (regex, Bedrock Guardrails, webhooks) are a signal, not the boundary | Gateway |
| Injection canaries in evaluation datasets | Langfuse experiments |

## Backup, restore and disaster recovery

| Component | Backup | RPO | RTO (proposed) | Restore test |
|---|---|---|---|---|
| Keycloak database | CloudNativePG continuous WAL archiving to S3 (Barman Cloud plugin), cross-region copy | 5 minutes | 1 hour | Quarterly, timed |
| Keycloak configuration | Realm as code in GitLab | 0 | With the database | Every rebuild |
| chain-sts | Stateless; keys in KMS (multi-region key if DR needs it) | 0 | 15 minutes | Every deploy |
| Gateway configuration | GitOps | 0 | 30 minutes | Every deploy |
| Gateway database (usage, analytics) | CloudNativePG backups | 1 hour | 4 hours | Quarterly |
| Approval and workflow state | Application PostgreSQL with PITR | 5 minutes | 1 hour | Quarterly |
| Audit records | S3 Object Lock, replicated | 0 after delivery | Not applicable | Read test monthly |
| Langfuse | ClickHouse backups per existing practice; PostgreSQL PITR | 24 hours | 1 business day | Twice a year |

**Region loss:** Bedrock global endpoints already route across regions. The
platform's own tier-0 services are single-region at first; the DR plan is
rebuild in a second region from GitOps and restored databases, within 4
hours. A warm standby is a decision for when an agent's business objective
needs a shorter RTO (decision D-11).

## Upgrade strategy

| Component | Cadence | Process |
|---|---|---|
| Agentgateway | Monthly minor; security patches within 7 days | CRDs first, then controller, in staging; full conformance suite; production a week later. Read release notes for behavior changes (they happen every minor) |
| Keycloak | Quarterly minor; security patches within 7 days | Realm-as-code applied to a staging realm; identity conformance suite; leaver drill |
| chain-sts | On change | Identity conformance suite in CI and staging |
| Langfuse | Monthly | Staging first; watch ClickHouse migrations; never edit its schema except the documented TTL workaround |
| CloudNativePG, Valkey, Kyverno, collector | Quarterly | Staging first; restore test after a PostgreSQL major |
| Integration chart, base chart, shared package, templates | As released | Automated MRs to teams; conformance in staging gates auto-merge |
| Bedrock models | When AWS announces lifecycle changes | See below |

CRDs and controllers are never upgraded by an app. The platform publishes a
compatibility matrix per release, and CI rejects combinations outside it.

## Model lifecycle and configuration changes

- Applications name **aliases** (`claude-sonnet`, `claude-haiku`), never
  provider IDs. The gateway maps aliases to Bedrock IDs per environment.
- Changing what an alias points to is a merge request that must link
  evaluation results for every agent using the alias in staging.
- Rollout: staging, then production for a small set of routes, then all.
  Rollback is reverting the merge request.
- Harnesses pin model IDs in managed settings (Claude Code's background
  model included), so a vendor default change does not move users silently.
- The platform tracks Bedrock model end-of-life dates and opens alias change
  requests 60 days ahead.

## Durable tasks, retries, cancellation and deadlines

| Rule | Owner |
|---|---|
| Every task has an ID from creation, carried in every span, audit record and usage record | Shared package |
| Every task has a deadline; calls inherit the remaining time | Shared package |
| Cancellation propagates to in-flight model and tool calls | Shared package |
| Retries: at most two, only for idempotent calls or calls with an operation ID, with backoff and jitter | Shared package; tools provide idempotency |
| A write is idempotent by operation ID at the tool | Tool |
| Approvals expire and are revalidated at execution | Tool |
| Long tasks use offline sessions, never stored access tokens | Workflow service ([Identity profile](04-identity-profile.md#long-running-tasks)) |

## Adoption and value: what is measured

| Measure | Target direction | Source |
|---|---|---|
| Developers using a harness through the gateway | Up; share of harness traffic outside the gateway down | Gateway usage; Kiro and vendor reports |
| Cost per accepted task, per harness and model | Down, or flat with better acceptance | [Developer harnesses](16-developer-harnesses.md#measuring-cost-per-accepted-task) |
| MR reviewer actionable rate and false-positive rate | Up and down | [Use cases](06-use-cases.md#measures) |
| Time from idea to first deployed agent | Under two weeks with the template | Project creation to first production deploy |
| Support requests per team per month | Down after onboarding | Support channel |
| Agents passing conformance and evaluations on every release | 100% | CI |
| Platform cost per developer | Tracked against [Cost model](08-cost-model.md) | FinOps |

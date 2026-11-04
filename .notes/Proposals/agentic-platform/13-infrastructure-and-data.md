# Kubernetes infrastructure and data services

| | |
|---|---|
| Status | Proposal |
| Updated | 4 November 2026 |
| Versions checked | CloudNativePG 1.30.1 (23 September 2026), Valkey 9.1.3 (26 October 2026), Karpenter 1.15.1 (23 October 2026; LTS 1.14.3 to July 2027), Kyverno 1.19.2 (20 October 2026). GitHub release pages, read 4 November 2026 |

The platform adds few new stateful services, and none of them is a shared
"agent memory". Most of what agents need is ordinary application state,
stored the way the organization already stores it.

## Responsibilities and failure domains

| Component | Role in the platform | If it fails | Capacity class | Owner |
|---|---|---|---|---|
| EKS control plane, VPC, ECR, KMS | Foundation, unchanged | Everything | AWS-managed | Infrastructure (existing) |
| **Agentgateway** proxy and controller | The only door to models, tools and agents | All agent traffic stops: tier 0. Fails closed | On-Demand or RI; spread across 3 AZs; PodDisruptionBudget | Platform |
| Gateway's PostgreSQL (usage records, UI analytics) | Usage records and the admin UI | **Observed in the demo:** a proxy that restarts while its database is down stays down (105 s without routes for a 90 s outage). Must not be a start dependency in production, or must be HA | CloudNativePG, 3 instances | Platform |
| **Keycloak** and its PostgreSQL | Platform authorization server, IdP broker | New sign-ins and token refresh stop; tokens already issued keep working until they expire. Tier 0 | On-Demand or RI; 3 replicas; CloudNativePG with PITR | Identity team or platform (decision D-03) |
| **chain-sts** | Delegation exchange for agents | Agents cannot call downstream for users. Fails closed. Tier 0 | On-Demand or RI; 3 replicas; stateless; KMS signer | Platform |
| Istio (where already run) | mTLS between the gateway and backends; L4 "only the gateway may connect" | Mesh-wide | Existing | Infrastructure (existing) |
| Kyverno | Admission rules that keep the gateway the only door, require signed images and labels | With `failurePolicy: Fail`, deployments stop; with `Ignore`, rules lapse. Choose per rule | On-Demand; 3 replicas | Platform |
| Karpenter | Node provisioning, Spot handling | New pods cannot get nodes; running pods continue | Existing | Infrastructure (existing) |
| OTel collector | Routes four record streams | Telemetry gaps. Audit and usage streams buffer to disk (persistent queue) | On-Demand for the gateway tier (stateful tail sampling); agent DaemonSet as today | Observability (existing) |
| Langfuse (web, worker) | Agent traces, evaluations, prompts | Evaluation and debugging degrade; agents continue (exporters drop or buffer) | Spot acceptable for workers; web On-Demand | Platform |
| ClickHouse for Langfuse | Langfuse trace store | Langfuse ingestion backs up in its queue; agents continue | **A dedicated single-shard cluster** (3 replicas, 3 Keeper), run with the team's existing ClickHouse skills. The existing cluster only for a proof of concept, under the conditions in [Observability](14-observability.md) | Data platform (existing skills), platform (service) |
| ClickHouse (existing) | The usage ledger, as one more ordinary database | FinOps reports go stale; recomputable from logs | Existing cluster | Data platform (existing) |
| Valkey | Caches and rate-limit counters; Langfuse's queue (separate instance, `noeviction`) | Rate limits fall back to local or fail open by policy; caches go cold; Langfuse ingestion pauses | On-Demand; replica with failover | Platform |
| S3 | Artifacts, audit records (Object Lock), backups, Langfuse blobs | Regional AWS service | AWS-managed | Infrastructure (existing) |
| Agentregistry | Catalog for discovery and install | Discovery and new installs stop; nothing running is affected | Any | Platform |

## EKS economics: what is actually free

Reserved Instances and Savings Plans are sunk only up to the capacity that
was idle anyway. The rule this review uses:

- **Incremental cost** = new nodes Karpenter launches because of the platform,
  plus storage, plus data transfer, plus Spot.
- **Opportunity cost** = committed capacity the platform takes that another
  team would otherwise have used. Price it at the effective committed rate,
  not zero, once the cluster's average requested CPU exceeds about 60 to 70%
  of committed capacity, or the commitment will be renewed larger because of
  it.
- **Idle cost** = reservations for agents that wait on model calls. A Python
  agent waiting on a 20-second model call holds its memory but almost no
  CPU. Size requests for memory, and let CPU requests be small, or the
  scheduler reserves cores nobody uses.

### What may run on Spot

| Run on Spot | Keep on On-Demand or committed capacity |
|---|---|
| GitLab runner jobs (MR review, evaluations, batch agents), with interruptible jobs and idempotent output | Agentgateway, Keycloak, chain-sts: tier 0 and fail-closed |
| Langfuse workers, evaluation jobs | PostgreSQL instances (CloudNativePG) |
| Stateless agent replicas behind a gateway route, when a lost request is retried by the caller | The OTel gateway collector, because tail sampling holds traces in memory |
| Workflow steps that checkpoint before every model call | Anything holding the only copy of in-flight state |

Spot is acceptable only where interruption is tested, not assumed. Each
Spot workload needs a passing **disruption test** (below) before it moves.

## Kubernetes policy: one job per policy system

| System | Decides | Does not decide |
|---|---|---|
| NetworkPolicy, or Istio `AuthorizationPolicy` where the mesh runs | Which workload may open a connection to which (L4, workload identity) | Anything about users, tools or models |
| Agentgateway | Which caller (user, agent, workload) may use which route, tool, agent or model; budgets | Business rules |
| Kyverno | What may be deployed: no `Backend` that points at a model host, no route that skips the gateway's policies, signed images only, required ownership labels | Runtime requests |
| The tool or service | Ownership, approvals, state, idempotency | Network reachability |

Two systems never decide the same question. Where both Istio and
NetworkPolicy exist, use one for "only the gateway may connect", not both.

## Data: separate by class, not by "agent"

| Data class | Example | Store | Lifetime | Isolation | Backup and restore |
|---|---|---|---|---|---|
| Durable workflow and approval state | A proposed change, its approval, its execution record | PostgreSQL, the owning service's database | Business retention | Database per service, role per service | PITR; restore tested quarterly |
| Conversation history | A helpdesk chat thread | PostgreSQL, the application's database (ADK `DatabaseSessionService` or the app's own table) | Days to months, by classification | Per application; row-level by user where shared | PITR, or accept loss if classified as convenience data |
| Artifacts | Generated reports, review findings, files | S3, prefix per application, KMS key per data class | By policy | IAM per application role | S3 versioning; Object Lock for audit |
| Caches | Tool results, embeddings lookup, token cache | Valkey, key prefix and ACL user per application | Minutes to hours | ACL user per application; separate instance for rate-limit counters | None. Loss must be safe |
| Long-term memory | Facts an agent keeps about a user or team | **Defer.** Build only for a named use case, with retention, deletion and permission rules agreed first | | | |
| Traces and evaluations | Agent spans, scores, datasets | Langfuse (ClickHouse, PostgreSQL, S3) | 30 to 90 days, by classification | Langfuse project per team (see [Observability](14-observability.md)) | ClickHouse backups per existing practice |
| Audit records | Who did what, through which agents, with which approval | S3 with Object Lock, and the SIEM | Per audit policy | Write-only for producers | Immutable |
| Usage records | Tokens, cost, principal, workflow | The existing ClickHouse (own database), loaded from gateway access logs | 13 months or longer for FinOps | Read by FinOps and owners | Recomputable from logs |

No shared "agent memory" service is proposed. A universal memory API would
hide retention, deletion and permission rules that differ per use case, and
the priority use cases do not need one.

### Shared PostgreSQL with CloudNativePG

- **One CloudNativePG cluster per tier-0 service** (Keycloak, the gateway).
  Their failure domains stay separate, and an upgrade of one does not
  schedule downtime for the other.
- **One shared cluster for platform-hosted applications,** with a database
  and a role per application, credentials from the operator's generated
  Secrets, and connection limits per role so one application cannot exhaust
  connections.
- **Backups:** CloudNativePG's in-tree Barman Cloud support is deprecated
  since 1.26 and will be removed in a future release; use the Barman Cloud
  plugin with an `ObjectStore` resource
  ([migration guide](https://cloudnative-pg.io/plugin-barman-cloud/docs/migration/),
  documented upstream).
- **Restore is the test, not the backup.** A scheduled job restores the
  latest backup into a scratch namespace and runs a query per database,
  monthly at least.

### Valkey

- Separate instances, or at least separate logical databases with separate
  memory limits, for **rate-limit counters** and **caches**. Under
  `allkeys-lru`, a cache burst would otherwise evict counters and reset
  budgets.
- ACL user per application with a key-prefix pattern. No application gets
  the default user.
- Nothing in Valkey is the only copy of anything.

## Tests that must pass before a workload uses Spot or claims recovery

| Test | Pass condition |
|---|---|
| Node drain during a model call | The caller gets a retryable error or the call completes on another replica; no duplicate side effect |
| Spot interruption notice (2 minutes) | Pods receive `SIGTERM`, finish or checkpoint within `terminationGracePeriodSeconds`; the workflow resumes from the last checkpoint |
| Kill the pod between "approved" and "applied" | Re-running apply produces the same result once (`replayed: true` or equivalent), never twice |
| Database failover (CloudNativePG switchover) | Applications reconnect within the agreed time; no approval or state is lost |
| Restore from backup | Point-in-time restore of each tier-0 database, timed against the recovery objective |
| Gateway restart while its database is down | Routes return within the objective (the demo failed this: 105 s) |
| Keycloak down | Tokens already issued keep working until expiry; new sign-ins fail with a clear error; chain-sts keeps working for valid subjects |
| Valkey flushed | Rate limits recover or fail by the agreed policy; no data loss |

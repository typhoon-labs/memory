# The dev cluster

> **Owner:** coordinator · **Type:** reference · **Checked:** 2026-11-03 against Kubernetes 1.37.0, Agentgateway 1.7.0, Keycloak 26.7.5, chain-sts 0.2.0, kagent and Agent Substrate 1.0.0-rc1

Names, ports and commands of the kind cluster the demo runs in. What the parts
agree on is in [`contracts.md`](contracts.md).

| Item | Value |
|---|---|
| kind cluster | `agentgateway-demo` |
| Kubeconfig | `local/kind/kubeconfig` |
| Kubernetes | 1.37+ with the `certificates.k8s.io/v1beta1` API enabled (kagent 1.x requirement) |
| Image registry | container `agentgateway-demo-registry`, host `localhost:5002`, images named `localhost:5002/<component>:<version>` |
| Node memory cap | None. The Docker VM's 31 GiB is the limit, so measure memory before and after installing anything heavy |

Host ports (all bound to 127.0.0.1) map to NodePorts fixed at cluster creation.

| Host port | NodePort | Use |
|---|---|---|
| 18080 | 30080 | Agentgateway: model, MCP and A2A routes |
| 18081 | 30081 | Keycloak |
| 18082 | 30082 | Sample App `web` |
| 18083 | 30083 | Chat UI |
| 18084 | 30084 | Grafana |
| 18085 | 30085 | Langfuse |
| 18086 | 30086 | Agentregistry UI |
| 18087 | 30087 | kagent UI, through its sign-in proxy |
| 18088 | 30088 | Agentgateway admin UI, through its sign-in proxy |
| 18089 | 30089 | Spare |

Seven UIs have no NodePort and are reached with `task ui -- <name>`, a
`kubectl port-forward` on a host port of its own for as long as the task runs.
These ports are bound to 127.0.0.1 too, and are free when nothing is forwarded.

| Host port | `task ui -- <name>` | Forwards to | Path |
|---|---|---|---|
| 18090 | `agentgateway` | `deployment/agentgateway-proxy` 15000 in `agentgateway-system` | `/ui` |
| 18091 | `prometheus` | `service/kube-prometheus-stack-prometheus` 9090 in `telemetry` | `/` |
| 18092 | `alertmanager` | `service/kube-prometheus-stack-alertmanager` 9093 in `telemetry` | `/` |
| 18093 | `rustfs` | `service/rustfs` 9001 in `ate-system` | `/rustfs/console/` |
| 18094 | `seaweedfs` | `service/langfuse-s3-all-in-one` 9333 in `langfuse` | `/` |
| 18095 | `seaweedfs-filer` | `service/langfuse-s3-all-in-one` 8888 in `langfuse` | `/` |
| 18096 | `clickhouse` | `service/langfuse-clickhouse` 8123 in `langfuse` | `/play` |

- **Why a forward and not a NodePort:** none of the seven has a login worth
  the name, so a NodePort would hand each to every pod in the cluster, and
  there is one spare port. Agentgateway's admin UI also has a sign-in proxy,
  below, and is here as the way in while that is down.
- **Agentgateway's admin UI is at `http://localhost:18088/ui/`**, for
  `platform-engineer` only, with `/ui/` in the address. What it shows, its
  database, and how its port is guarded:
  [`10-agentgateway/README.md`](../agent-deployments/clusters/dev/platform/10-agentgateway/README.md).
- The table and the reasons live in `local/ui/ui.sh`.

## Working with the cluster

The trunk is kind, the registry, Gateway API 1.6.0, Agentgateway 1.7.0,
Keycloak 26.7.5 and the model route, on Kubernetes 1.37.0. Tools are pinned in
`mise.toml` (helmfile 1.8.1, task 3.54.0); run commands through
`mise exec -- task ...` if mise is not active in your shell.

Every task, and what it is for, is under [Tasks](#tasks).

- **Adding a release:** create `agent-deployments/clusters/dev/platform/<nn>-<name>/helmfile.yaml`
  or `workloads/<name>/helmfile.yaml`; the root helmfile picks it up by glob.
  Numbers: 40 observability, 50 Langfuse, 60 kagent, 70 Agentregistry, 80
  policies, 90 chain-sts; a domain's routes are
  `domains/<domain>/helmfile.yaml`. Set
  `helmDefaults.kubeContext: kind-agentgateway-demo` in every sub-helmfile,
  and pass `--context kind-agentgateway-demo` in any hook that runs kubectl.
  Do not use the label `layer=trunk`.
- **Taskfiles:** the root `Taskfile.yml` header states the rules. In short:
  write `--kubeconfig "{{.ROOT_DIR}}/local/kind/kubeconfig"` and the context on
  every kubectl, helm and helmfile command, and prefix every top-level
  variable with your component's name, because variables in included
  Taskfiles are global.
- **Gateway:** in-cluster `http://agentgateway-proxy.agentgateway-system.svc.cluster.local`,
  from the host `http://localhost:18080`. It validates the JWT and then
  **removes the `Authorization` header** unless the backend's policy sets
  `backend.auth.passthrough: {}`. The charts for an MCP route with per-tool
  rules on `roles` and on the acting agent, and for an A2A route, are in
  `agent-platform/profiles/gateway/`; each `values.yaml` says what was
  verified.
- **chain-sts:** in-cluster `http://chain-sts.chain-sts.svc.cluster.local`
  (Service port 80, container port 8080), with no host port; release
  `chain-sts` in namespace `chain-sts`, two replicas, applied by
  `task sts:install`. Only pods in `agents`, `tools` and
  `agentgateway-system` reach it.
- **Keys for in-cluster token validation:**
  `http://keycloak.keycloak.svc.cluster.local:8080/realms/demo/protocol/openid-connect/certs`.
  The issuer in Keycloak's tokens is always
  `http://localhost:18081/realms/demo`. chain-sts's keys are at
  `http://chain-sts.chain-sts.svc.cluster.local/jwks`, and its address is the
  issuer in its tokens.
- **A Keycloak restart keeps the signing key.** Keycloak keeps nothing else,
  but the realm imports its key from Secret `keycloak/keycloak-realm-keys`
  (`local/identity/keycloak/scripts/realm-keys.sh`, run before each sync).
  On 2026-11-02 a token from a restarted pod passed `task smoke` one second
  after the restart; before, the gateway refused new tokens for up to 5
  minutes, until its controller fetched the new key. Rotating the key
  (`realm-keys.sh --rotate`) brings that window back once. Sessions are still
  lost: signed-in users sign in again.
- **One sign-in.** Keycloak keeps one session per browser, which Grafana,
  Langfuse, kagent and the Agentgateway UI all use, so only the first of them
  asks for the password. Whoever signed in last is who the next one sees: after a sign-in
  as `developer`, Grafana opens read-only and Langfuse refuses. The Chat UI
  always asks, so that each tab can choose its user, and that changes the
  session too. Signing out of Grafana ends it for all of them. A tab left on
  Keycloak's form while another tab signs in turns into Grafana's "Login
  failed" page; a reload clears it.
- The machine client `alert-automation` carries `team: automation`.

Namespaces: `agentgateway-system`, `keycloak`, `kagent` (kagent, and
diagnosis-agent), `ate-system`, `podcertificate-controller-system`,
`agentregistry`, `telemetry`, `langfuse`, `kyverno`, `sample-app`,
`chain-sts`, `agents` (chat-assistant, remediation-agent, comms-agent),
`tools` (delivery-mcp, observability-mcp).

## The audit trail

Who did what, through which agents, allowed or refused by which rule, and
what changed, kept in Loki for 7 days on a volume. Grafana's dashboard
"Audit" (`http://localhost:18084/d/audit`) shows it by person and change;
`task audit:change -- <id>` puts one change together. The field names the
sources share are in [`contracts.md`](contracts.md#audit-records).

| Source | What it records | How it reaches Loki |
|---|---|---|
| Agentgateway's access log | Every request: the verified caller, the agents acting for them, the route, the tool, the status | The telemetry policy, over OTLP |
| delivery-mcp | Every state a change reaches, every write to an incident, every refusal with its rule | Logger `delivery.audit`, over OTLP |
| chain-sts | Every token exchange, issued or refused, with the reason | Logger `chain_sts.audit`, over OTLP |
| Keycloak | Sign-ins and token events; admin changes, without their contents | Its own OTLP log export |
| The API server | Every write by a person or a workload, by whom; not the platform controllers' writes that follow from them (`local/kind/audit/policy.yaml`) | `kube-audit-forwarder` reads the node's file |

Records join by ids they share: `operation.id` (a change; unique, where
change ids start again after `task demo:reset`), `trace_id`, `token.jti`
(a token chain-sts issued, and every request that carried it) and
`session.id` (a sign-in, and every request of that session). The API
server's records have no trace, and join by namespace and time.

- **On kind, a person at this machine is `kubernetes-admin`** in the API
  server's records, whether through `kubectl`, Helm or a task: the record
  tells them apart from delivery-mcp's service account, not one person from
  another. On EKS the API server names the IAM identity.
- **It records, it does not prove.** Loki's data can be deleted by an admin.
  In production the bucket under Loki is where that is closed.
- **Not recorded:** a chat in the kagent UI, which reaches the agent outside
  the gateway (`60-kagent/README.md`); the Kubernetes reads of
  `diagnosis-agent`'s own tool server, which takes no gateway route and
  whose reads the API server's policy leaves out; and the model's prompts,
  which stay in Langfuse and the gateway's own database.
- **Production:** the API server's audit log is an EKS logging setting
  (CloudWatch), and Loki runs on object storage. Sign-ins are recorded by
  the enterprise identity provider (Okta's System Log, for one), and also by
  Keycloak's events if Keycloak stays in front of it, as
  [`production-design.md`](production-design.md) proposes. The field
  names and the joins stay.

## The platform services

Each has its notes next to its helmfile, under
`agent-deployments/clusters/dev/platform/`:

| Directory | Notes |
|---|---|
| `10-agentgateway/` | [Agentgateway: its releases, the admin UI, its database and how its port is guarded](../agent-deployments/clusters/dev/platform/10-agentgateway/README.md) |
| `20-keycloak/` | [Keycloak: the demo realm, the stand-in identity provider `corp`, the broker test and the reconciliation job prototype](../agent-deployments/clusters/dev/platform/20-keycloak/README.md) |
| `40-observability/` | [Prometheus, Loki, Tempo, the collector, the alert](../agent-deployments/clusters/dev/platform/40-observability/README.md) |
| `50-langfuse/` | [Langfuse: ingest, reading traces back, its ClickHouse](../agent-deployments/clusters/dev/platform/50-langfuse/README.md) |
| `60-kagent/` | [kagent and Agent Substrate: versions, the shared database, traces, the workload credential, the UI and its sign-in proxy, the limits found](../agent-deployments/clusters/dev/platform/60-kagent/README.md) |
| `70-agentregistry/` | [Agentregistry: a catalog only](../agent-deployments/clusters/dev/platform/70-agentregistry/README.md) |
| `90-chain-sts/` | [chain-sts: the release, its signing keys and their rotation, the checks and drills](../agent-deployments/clusters/dev/platform/90-chain-sts/README.md) |

`30-model-route/` and `80-policies/` have no README. What each installs, and why, is at the top of
its `helmfile.yaml`; the model provider is in the
[README](../README.md#model-provider).

## Tasks

`task --list` shows every task with one line each. This is the one list with
what each is for. The README keeps the few everyone needs.

**Build and run** (root `Taskfile.yml`)

| Task | Does |
|---|---|
| `task doctor` | Does this machine have the tools the tasks need: one line each, and what to install under the failing lines. `-- --dev` adds node, npm and uv |
| `task setup` | After `mise install`: fetches now what the tasks would fetch on first use. `-- --dev` adds every component's packages. Safe to re-run |
| `task up` | From no cluster to a ready demo, every step in order. Safe to re-run |
| `task up:trunk` | Creates or updates the trunk only: cluster, registry, Gateway API, Agentgateway, Keycloak and the model route |
| `task publish` | Builds and pushes every image, and pushes the Sample App chart. Safe to re-run |
| `task install` | Applies the workloads and their gateway routes, one at a time |
| `task policies` | Applies the controls, one at a time: network boundaries, Kyverno, the admission rules for gateway resources |
| `task deploy -- -l name=<release>` | Applies one release again, after a change to its files. Use this: a bare `task deploy` applies every helmfile, including ones another workstream is still writing |
| `task routes` | The operations domain's gateway routes, and whether the gateway accepted them |
| `task status` | What is running, the addresses, node memory |
| `task ui` | Every web UI, its address and whether it answers. `-- <name>` forwards one that has no host port until Ctrl-C, `-- all` forwards the seven |
| `task model` | Which model provider the gateway uses. `-- bedrock` switches to Amazon Bedrock with the AWS credentials exported in the shell, `-- local` goes back to the model endpoint on this machine. See the [README](../README.md#model-provider) |
| `task down` | Removes the cluster, the local registry and the kubeconfig. Nothing else on the machine |

**Identity, checks and audit** (root `Taskfile.yml`, and chain-sts's in its release's `Taskfile.yml`)

| Task | Does |
|---|---|
| `task token -- <user>` | Access token for a user (client `demo-cli`, direct grant) or for `alert-automation` (its client credentials), valid 30 minutes. `-- <user> --chat-ui` gives the token a Chat UI sign-in gets, audience `chat-assistant` |
| `task smoke` | Positive and negative checks of the model route (one small model call) |
| `task sts:check` | The token exchange's refusals, each next to its allowed twin: the gateway's rules on chain-sts's tokens, chain-sts's own rules, who reaches it ([`agent-platform/tests`](../agent-platform/tests/README.md)) |
| `task sso:check` | One sign-in covers Grafana, Langfuse and the Agentgateway UI, and each lets in only whom it should |
| `task audit:change -- <id>` | Who changed what, for one change (`CHG-0001`, the latest with that id, or `op-<uuid>`), from the audit records in Loki alone: [The audit trail](#the-audit-trail) |
| `task identity:broker-check` | Signs in as a corp user through the demo realm's `corp` button and calls the gateway with the brokered token |
| `task identity:reconcile` | The reconciliation job prototype: disables demo-realm users whose corp account is disabled, and ends the sessions of those removed from a platform group |
| `task identity:revocation-drill` | Disables a corp user, runs the job, and times when refresh and the gateway refuse; then re-enables the user |
| `task docs:check` | Every document's links, anchors, spelling, Mermaid blocks and freshness line ([`CONTRIBUTING.md`](../CONTRIBUTING.md#documentation)) |
| `task sts:install`, `sts:status`, `sts:signing-key` | Install or upgrade chain-sts, show its state, create its first signing key |
| `task sts:rotate:new`, `:check`, `:promote`, `:drop` | The key rotation's steps, each refused before its wait is over ([the runbook](../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#rotating-the-key)) |

**The incident** (`demo/Taskfile.yml`, used by the [run of show](../demo/run-of-show.md))

| Task | Does |
|---|---|
| `task demo:preflight` | Go or no-go before a showing, with the fix under each failing line |
| `task demo:reset` | Back to a clean start: search-service 2.0.0, no incident, no alert firing. Before each showing |
| `task demo:break` | Ships search-service 2.1.0, the release that starts the incident, without changing a tracked file |
| `task demo:alert` | Fallback: delivers the alert by hand when the card does not appear |
| `task demo:drive` | The whole incident as a script, through the gateway, as each role, opened by the real alert |
| `task demo:chain` | One Apply from the Chat UI, followed through chain-sts, the gateway and delivery-mcp: what each recorded of it. Then `demo:reset` |
| `task demo:model-fault -- down` or `-- slow` | Cuts the agents off from the model. `demo:model-restore` undoes it |
| `task demo:backup:<name>` | Thirteen short drills for questions from the room. The run of show lists them |

**Platform services and components.** Each platform release's tasks, such as
`kagent:*`, `langfuse:*` and `registry:*`, are in its README under
`agent-deployments/clusters/dev/platform/`. `task langfuse:restart-clickhouse`
is the one to know: it restarts Langfuse's ClickHouse when Langfuse stops
answering queries. Each component's tasks, `task <component>:test`, `:lint`,
`:build`, `:push` and `:run-local`, are in its README under `components/`.

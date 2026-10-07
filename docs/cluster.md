# The dev cluster

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
| 18088-18089 | 30088-30089 | Spare |

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

- **Why a forward and not one of the spare NodePorts:** none of the seven has
  a login worth the name, so a NodePort would hand each to every pod in the
  cluster, and there are two spare ports for seven UIs.
- **Agentgateway's admin UI can only be forwarded.** The proxy binds port
  15000 to the pod's own localhost: from the node, the pod's address answers
  on 15020 (metrics) and not on 15000. The UI is read-only, because the
  proxy's configuration comes from the controller. The same port serves
  `/config_dump`, the whole configuration as JSON.
- The table and the reasons live in `local/ui/ui.sh`.

## Working with the cluster

The trunk is kind, the registry, Gateway API 1.6.0, Agentgateway 1.6.0,
Keycloak 26.7.5 and the model route, on Kubernetes 1.37.0. Tools are pinned in
`mise.toml` (helmfile 1.8.1, task 3.54.0); run commands through
`mise exec -- task ...` if mise is not active in your shell.

| Command | Does |
|---|---|
| `task up` | From no cluster to a ready demo, about 15 minutes; safe to re-run |
| `task demo:preflight` | Go or no-go list before a showing |
| `task up:trunk` | Creates or updates the trunk only |
| `task deploy -- -l name=<release>` | Applies one release. Use this; a bare `task deploy` applies every helmfile, including ones another workstream is still writing |
| `task status` | What is running, URLs, node memory |
| `task ui` | Every web UI, its address and whether it answers. `-- <name>` forwards one of the seven above until Ctrl-C, `-- all` forwards them all |
| `task token -- <user>` | Access token for a user or for `alert-automation` (client `demo-cli`, direct grant, valid 30 minutes) |
| `task smoke` | Positive and negative checks of the model route |
| `task model` | Which model provider the gateway uses. `-- bedrock` switches to Amazon Bedrock with the AWS credentials exported in the shell, `-- local` goes back to the model endpoint on this machine |

- **Adding a release:** create `agent-deployments/clusters/dev/platform/<nn>-<name>/helmfile.yaml`
  or `workloads/<name>/helmfile.yaml`; the root helmfile picks it up by glob.
  Numbers: 40 observability, 50 Langfuse, 60 kagent, 70 Agentregistry, 80
  policies; a domain's routes are `domains/<domain>/helmfile.yaml`. Set
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
  rules on `roles`, and for an A2A route, are in
  `agent-platform/profiles/gateway/`; each `values.yaml` says what was
  verified.
- **Keys for in-cluster token validation:**
  `http://keycloak.keycloak.svc.cluster.local:8080/realms/demo/protocol/openid-connect/certs`.
  The issuer in tokens is always `http://localhost:18081/realms/demo`.
- **After Keycloak restarts, the gateway refuses every new token for up to 5
  minutes.** Keycloak keeps nothing, so a restarted pod signs with new keys,
  and the gateway's controller fetches the keys every 5 minutes. Applying a
  changed realm file restarts the pod. Seen on 2026-10-07: 401 from the
  gateway for 3 minutes 45 seconds after `task deploy -- -l name=keycloak`,
  then 200 with no other action. Signed-in users sign in again.
- The machine client `alert-automation` carries `team: automation`.

Namespaces: `agentgateway-system`, `keycloak`, `kagent`, `ate-system`,
`agentregistry`, `telemetry`, `langfuse`, `kyverno`, `sample-app`, `agents`
(chat-assistant, remediation-agent, comms-agent), `tools` (delivery-mcp,
observability-mcp).

## The platform services

Each has its notes next to its helmfile, under
`agent-deployments/clusters/dev/platform/`:

| Directory | Notes |
|---|---|
| `40-observability/` | [Prometheus, Loki, Tempo, the collector, the alert](../agent-deployments/clusters/dev/platform/40-observability/README.md) |
| `50-langfuse/` | [Langfuse: ingest, reading traces back, its ClickHouse](../agent-deployments/clusters/dev/platform/50-langfuse/README.md) |
| `60-kagent/` | [kagent and Agent Substrate: versions, the workload credential, the UI and its sign-in proxy, alpha limits](../agent-deployments/clusters/dev/platform/60-kagent/README.md) |
| `70-agentregistry/` | [Agentregistry: a catalog only](../agent-deployments/clusters/dev/platform/70-agentregistry/README.md) |

The trunk (`10-agentgateway/`, `20-keycloak/`, `30-model-route/`) and
`80-policies/` have no README. What each installs, and why, is at the top of
its `helmfile.yaml`; the model provider is in the
[README](../README.md#model-provider).

## Tasks

`task --list` shows all of them. Building the cluster is in the root
`Taskfile.yml`: `up`, `up:trunk`, `publish` (push images and the Sample App
chart), `install`, `policies`. The incident is in `demo/Taskfile.yml`:
`demo:break` (ships 2.1.0 without editing a tracked file), `demo:reset` (clean
2.0.0, no incidents), `demo:alert` (delivers the alert by hand when
Alertmanager does not), `demo:drive` (the scripted incident), a model-fault
scenario, and the backup drills.

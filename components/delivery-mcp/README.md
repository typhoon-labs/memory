# delivery-mcp

> **Owner:** delivery-mcp maintainers · **Type:** reference · **Checked:** 2026-11-03 against delivery-mcp 0.2.2

Incident and change state for the demo, served as MCP tools. It enforces the
separation-of-duties rules itself, against the caller's verified token,
whatever a gateway or a UI allowed before the call reached it.

| | |
|---|---|
| Built with | FastMCP 3.4.8, Python 3.13, from a kmcp scaffold ([kmcp](#kmcp)) |
| Serves | MCP over Streamable HTTP at `/mcp`, on container port 8080; local dev port 18190 |
| Gateway route | `/mcp/delivery`. The role each tool needs, and the agent that may call it for a user, are in [`docs/contracts.md`](../../docs/contracts.md#delivery-mcp-tools) |
| Model | None |
| In the dev cluster | 0.2.2, release `delivery-mcp` in namespace `tools` |
| Values and route files | [`values.yaml`](../../agent-deployments/clusters/dev/workloads/delivery-mcp/values.yaml); its rights in `sample-app`, [`rbac/`](../../agent-deployments/clusters/dev/workloads/delivery-mcp/rbac/values.yaml); the route, [`delivery-mcp.yaml`](../../agent-deployments/clusters/dev/domains/operations/delivery-mcp.yaml) |

## Identity

The token's signature (RS256), issuer, audience and expiry are checked on
every request, and `nbf` when the token carries one. A token with no `exp` is
refused. It trusts the two issuers in
[`docs/contracts.md`](../../docs/contracts.md#agents-acting-for-a-user-chain-sts),
Keycloak (`OIDC_ISSUER`, keys from `OIDC_JWKS_URL`) and chain-sts
(`DELEGATION_ISSUER`, keys from `DELEGATION_JWKS_URL`), and does not exchange
tokens at chain-sts itself. A token is verified against the keys of the
issuer its `iss` names, and with an `iss` that is neither it is refused.

Each issuer has its own audience. Keycloak's tokens must carry
`OIDC_AUDIENCE`, the gateway's (`agentgateway`). chain-sts issues each token
for one target, and only one issued for this service's own route counts here:
its audience must be one of `DELEGATION_AUDIENCE`, in the dev cluster
`http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/delivery`.
A chain token issued for another target, such as the one an agent was
called with, is refused with 401, as the gateway refuses it (since version
0.2.2; before, both issuers' tokens were checked against `OIDC_AUDIENCE`).
While the dev cluster rolls out tokens per target, its values list
`agentgateway` too, the audience every chain-sts token carried before
([`90-chain-sts`](../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#tokens-per-target)). The dev
cluster trusts chain-sts since version 0.1.2: its release sets the
`DELEGATION_` values from `delegation` in
`agent-deployments/clusters/dev/identity.yaml`.

The user is `preferred_username` (without one: `client_id`, `azp` or `sub`,
the first that is there; in a token with `act`, where `client_id` and `azp`
name the agent, `sub`); roles are the top-level `roles` array; the team is
`team`. A chain-sts token carries the user's roles and no others
([`docs/contracts.md`](../../docs/contracts.md#agents-acting-for-a-user-chain-sts)).
A claim of the wrong type counts as absent. Nothing is read from arguments or
other headers ([`docs/contracts.md`](../../docs/contracts.md#identity)).

**The chain.** In a token with `act`, the agents that acted for the user are
read from its nested `act`, newest (outermost) first, each by its
`client_id`, else its `sub`: `["remediation-agent", "chat-assistant"]` for a
platform engineer's Apply button. A token without `act`, the user's own, has
the chain `[]`. The chain decides nothing here (which agent may call which
tool is the gateway's rule, in
[`docs/contracts.md`](../../docs/contracts.md#delivery-mcp-tools)); it is
recorded next to the user wherever a user is, since version 0.1.3:

| Record | User | Chain |
|---|---|---|
| Incident | `opened_by` | `opened_via` |
| Diagnosis | `recorded_by` | `recorded_via` |
| Change | `proposed_by`, `approved_by`, `rejected_by`, `applied_by` | `proposed_via`, `approved_via`, `rejected_via`, `applied_via` (`null` until that step) |
| Change `history` entry | `by` | `via` (`null`, like `by`, for a step the service takes itself: `verifying`, `applied`, `failed`) |
| Status update | `posted_by` | `posted_via` |
| `restart_workload`'s answer | `restarted_by` | `restarted_via` |

A database file from an earlier version gets the new columns when it is
opened; what it held reads as direct calls (`[]`), or `null` for a step not
taken.

**Separation of duties.** Since version 0.2.1 the rule that the approver is
not the proposer keys on the token's `sub`, not on the user name: a login name
can be renamed or given to someone else, and `sub` stays. It keys on `sub`
alone, not on `iss` with `sub`. A person's own token is Keycloak's and their
chain token is chain-sts's, with the same `sub`, since chain-sts keeps it and
takes subjects from Keycloak only; so whoever proposed with one cannot approve
with the other
([`docs/production-design.md`](../../docs/production-design.md#25-claims-groups-and-entitlements),
section 2.5). A change keeps the `sub` of each person who moved it beside
their name, which stays for display, so its records join on `sub`:

| Record | User | Subject |
|---|---|---|
| Change | `proposed_by`, `approved_by`, `rejected_by`, `applied_by` | `proposed_by_sub`, `approved_by_sub`, `rejected_by_sub`, `applied_by_sub` (`null` until that step) |

A token without `sub` fails closed: `propose_change` and `approve_change`
refuse it with `approver_is_not_proposer`, since a change proposed without one
could later be approved by its proposer, and an approver without one cannot be
told from the proposer. `reject_change` and `apply_change` accept it and store
`null` as the subject.

A change stored before version 0.2.1 has no `proposed_by_sub`, and for it the
rule falls back to comparing names, as it did then: the approver's user, as
above, against `proposed_by`. Only a database file can hold such a change
(`DELIVERY_DB_PATH`); the dev cluster keeps its state in memory, so a new pod
starts without one.

## What it serves and returns

The tools, the role each needs, the agent that may call each for a user, and
the rules are the contract in
[`docs/contracts.md`, "delivery-mcp tools"](../../docs/contracts.md#delivery-mcp-tools).

| Path | |
|---|---|
| `POST /mcp` | MCP over Streamable HTTP. Stateless: no session id, each request stands alone. A bearer token is required; without one that verifies the answer is 401. |
| `GET /healthz` | Liveness. No token. |

### Results and refusals

A tool that succeeds returns its object, as `structuredContent` and as JSON
text. Anything else returns the four keys of the refusal in
[`docs/contracts.md`](../../docs/contracts.md#delivery-mcp-tools), with
`isError: true`:

| `error` | `rule` | When |
|---|---|---|
| `forbidden` | `authenticated_caller` | The token verifies and names nobody |
| `forbidden` | `role_required` | The caller lacks the role the tool needs |
| `forbidden` | `one_open_incident_per_service` | `open_incident` on a service with an unresolved incident |
| `forbidden` | `team_owns_service` | `propose_change` by a developer whose team does not own the service |
| `forbidden` | `target_is_retained_earlier_version` | The target is not in `RETAINED_VERSIONS`, or is not earlier than what runs, or the service has no version this service can select (only `search-service` has) |
| `forbidden` | `approver_is_not_proposer` | `approve_change` by the person who proposed the change, the same `sub` whatever the name ([Separation of duties](#identity)); `propose_change` or `approve_change` with a token without `sub` |
| `forbidden` | `change_is_approved` | `apply_change` on a change that is proposed or rejected |
| `not_found` | `incident_exists`, `change_exists` | No such incident or change |
| `invalid_state` | `incident_is_open`, `change_is_pending` | For example approving a change twice |
| `invalid_argument` | `service_is_known`, `argument_is_valid` | |
| `operation_failed` | `operation_completed` | `restart_workload` was allowed and the Kubernetes API refused or failed |

The role is checked first, then the rule that depends on state. With the four
demo users this means a developer who tries to approve their own change is
refused by `role_required`: no demo user holds both roles, so
`approver_is_not_proposer` is only reached by someone who does, or by a token
without `sub`.

### Applying a change

`apply_change` returns at once with the change `applying`. In the background
the change is applied, moves to `verifying`, and ends `applied` or `failed`;
`get_incident` shows where it is, and each change carries its `history`. The
incident becomes `mitigating` when a change is proposed and `resolved` when
one is applied.

A second `apply_change` with the same `change_id` starts nothing. It returns
the change as it stands, with `replayed: true`. A failed change stays failed;
propose a new one.

Two appliers implement one interface (`src/delivery/applier.py`):

- `fake` keeps the selection in memory. For tests and local runs.
- `helm` runs `helm upgrade sample-app <chart> --namespace sample-app
  --reuse-values --set-string searchService.image.tag=<version>
  --description "delivery-mcp operation <id>: ..." --timeout <seconds>s`, and
  `--version` and `--plain-http` when `HELM_CHART_VERSION` and
  `HELM_PLAIN_HTTP` are set, as they are in the dev cluster. No `--wait`,
  `--force` or `--install`: the release stays the only writer of the
  Deployment, and the rights it needs are small
  (`agent-deployments/clusters/dev/workloads/delivery-mcp/rbac/`).
  `--set-string` rather than `--set`, so a tag such as `2.10` is not read as a
  number.

Verification is a real `GET` of `VERIFY_SEARCH_URL`, retried until
`VERIFY_TIMEOUT_SECONDS`. It passes on 200 with at least one result. With the
fake applier and no `VERIFY_SEARCH_URL` nothing is requested, and the change
is marked `applied` with a detail that says so.

### Audit records

The state above is in SQLite, in memory in the dev cluster, and is gone when
the pod restarts. What happened to it is also written as audit records, one
log record each on the logger `delivery.audit`, and since version 0.2.0 sent
to the OpenTelemetry Collector, which hands them to Loki. Each is written once
the write it records is done.

| `audit.event` | `audit.outcome` | When |
|---|---|---|
| `change.proposed`, `change.approved`, `change.rejected`, `change.applying` | `succeeded` | The change reached that status in the caller's tool call |
| `change.verifying`, `change.applied`, `incident.resolved` | `succeeded` | In the background, after `apply_change` returned |
| `change.failed` | `failed` | In the background; or at start-up, for a change left in flight, and then naming nobody |
| `incident.opened`, `incident.diagnosis_recorded`, `incident.status_update_posted` | `succeeded` | The incident's own writes |
| `tool.call` | `allowed` | A tool that writes was called; written after the records above it caused |
| `tool.call` | `refused` | A rule said no, to any tool, a read included. `audit.rule` is the rule, and `error.type` the contract's `error`: `forbidden`, `not_found`, `invalid_state` or `invalid_argument` |
| `tool.call` | `failed` | `restart_workload` was allowed and failed (`error.type` `operation_failed`) |

A read that succeeds is not recorded: the gateway records every request. The
steps an apply takes in the background name the caller who asked to apply, and
carry the trace of that request.

Who acted, from the verified token only, under the names the gateway's access
log uses, so that records from both join: the `user.*`, `session.id`,
`token.jti` and `actor.chain` fields in
[`docs/contracts.md`, "Audit records"](../../docs/contracts.md#audit-records).
`user.id` is the user as every record here names them ([Identity](#identity),
for a token without `preferred_username`). `session.id` is absent for
chain-sts's tokens and the alert's machine client, which have no `sid`.

What a record concerns: `incident.id`, `change.id`, and `operation.id`, the
`op-<uuid>` of a change, which the Helm release's description also names.
Change ids start again at `CHG-0001` with a new database; operation ids are
not used twice. A change's records also name `delivery.service` and
`change.target_version`; `change.proposed` the `change.previous_version`;
`change.failed` the `change.detail`; and once the Helm upgrade has run,
`helm.release`, `helm.namespace` and `helm.revision`, the revision it
created. `incident.opened` names `delivery.service` and `incident.severity`,
and `tool.call` the tool, `gen_ai.tool.name`, as the gateway does, with the
argument that names what the call is about, cut to 64 characters. A field
that is absent is left out, never written as null.

Each record goes two ways:

- To the pod's log, as `<time> INFO delivery.audit <JSON>`, the JSON object
  being the record's fields and, when there is a trace, `trace.id`:

  ```
  2026-11-02 10:15:42,107 INFO delivery.audit {"audit.event": "change.applied", "audit.outcome": "succeeded", "change.id": "CHG-0001", "incident.id": "INC-0001", "operation.id": "op-6c1f...", "delivery.service": "search-service", "change.target_version": "2.0.0", "helm.release": "sample-app", "helm.namespace": "sample-app", "helm.revision": 4, "user.id": "platform-engineer", ..., "actor.chain": "remediation-agent,chat-assistant", "trace.id": "4bf92f35..."}
  ```

- With `OTEL_EXPORTER_OTLP_ENDPOINT` set, to the collector as an OTLP log
  record, on the same endpoint and protocol as the traces (over HTTP,
  `/v1/logs`). The fields are the record's attributes, and its trace and span
  ids are those of the span that was active. Loki keeps the attributes as
  structured metadata, with `_` for `.`:
  `{service_name="delivery-mcp"} | audit_event="change.applied" | user_id="platform-engineer"`.

Only `delivery.audit` is sent to the collector; the rest of the service's log
stays in the pod's. An audit record is written whatever `LOG_LEVEL` says. Until
version 0.1.3 the line had other fields (`tool`, `target`, `user`, `chain`,
`roles`, `team`, `outcome`, `rule`), one per tool call, reads included, and
went to the pod's log only.

## Settings

| Variable | Default | |
|---|---|---|
| `OIDC_ISSUER` | required | The `iss` every token must carry |
| `OIDC_JWKS_URL` | required | Where the signing keys are fetched |
| `OIDC_AUDIENCE` | required | The `aud` a Keycloak token must carry |
| `DELEGATION_ISSUER` | | chain-sts's `iss`. Set with `DELEGATION_JWKS_URL` and `DELEGATION_AUDIENCE`, or not at all; unset, only Keycloak's tokens are accepted |
| `DELEGATION_JWKS_URL` | | Where chain-sts's signing keys are fetched |
| `DELEGATION_AUDIENCE` | | The audiences a chain-sts token may carry, comma-separated; one is enough. This service's own route, the target chain-sts issued the token for. Since version 0.2.2 |
| `APP_VERSION` | `0.2.2` | `service.version`, and the version `/healthz` reports |
| `DEPLOYMENT_ENVIRONMENT` | `dev` | `deployment.environment` |
| `HOST`, `PORT` | `127.0.0.1`, `8080` | The image binds `0.0.0.0:8080` |
| `DELIVERY_DB_PATH` | `:memory:` | SQLite file. In memory, state is lost on restart |
| `APPLIER` | `fake` | `fake` or `helm` |
| `RETAINED_VERSIONS` | `2.0.0` | Comma-separated versions a change may return to |
| `HELM_CHART_REF` | required with `helm` | The Sample App chart: an `oci://` reference or a path |
| `HELM_CHART_VERSION` | | Chart version for an OCI reference |
| `HELM_PLAIN_HTTP` | `false` | `true` for an OCI registry served over HTTP |
| `HELM_RELEASE`, `HELM_NAMESPACE` | `sample-app`, `sample-app` | |
| `HELM_BIN` | `helm` | The Helm binary to run |
| `HELM_TIMEOUT_SECONDS` | `120` | |
| `VERIFY_SEARCH_URL` | required with `helm` | The search request that proves the change |
| `VERIFY_RESULTS_FIELD` | `results` | The list in the response |
| `VERIFY_TIMEOUT_SECONDS`, `VERIFY_INTERVAL_SECONDS` | `90`, `2` | |
| `RESTART_LABEL_SELECTOR` | `app.kubernetes.io/name={service}` | Pods `restart_workload` deletes |
| `FAKE_CURRENT_VERSION`, `FAKE_APPLY_SECONDS` | `2.1.0`, `0` | Fake applier only |
| `MCP_STATELESS_HTTP` | `true` | |
| `MCP_TRANSPORT_MODE` | `http` | The only transport accepted |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | | Traces and the audit records are exported only when set |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | `grpc` or `http/protobuf`, for both |
| `OTEL_SERVICE_NAME` | `delivery-mcp` | `service.name` |
| `LOG_LEVEL` | `INFO` | |

With `helm`, the service does not start without `HELM_CHART_REF` and
`VERIFY_SEARCH_URL`. It never starts without the three `OIDC_` values, nor
with one or two of the three `DELEGATION_` values without the rest, nor with
`DELEGATION_ISSUER` equal to `OIDC_ISSUER`.

The dev cluster's values are the `env` of
[`values.yaml`](../../agent-deployments/clusters/dev/workloads/delivery-mcp/values.yaml).

The audit records are described in [Audit records](#audit-records). The tool
call's span carries `delivery.tool`, `delivery.outcome` (`allowed` or the
contract's `error`), `delivery.rule` for an error, `enduser.id` and, for a
chain, `delivery.chain`.

## Run and test

From the repository root. From this directory the same tasks run without the
component's name, `task test`; a bare `task token` at the root is the root's,
and asks Keycloak ([`docs/cluster.md`](../../docs/cluster.md#tasks)).

```sh
task delivery-mcp:test          # every tool: a permitted and a refused case per rule
task delivery-mcp:lint          # ruff check and format check
task delivery-mcp:run-local     # :18190, with a test issuer on :18199 and a stub search on :18198
task delivery-mcp:token -- platform-engineer   # a token from the test issuer
task delivery-mcp:stop-local
task delivery-mcp:build         # the image localhost:5002/delivery-mcp:<version>
task delivery-mcp:push          # push it to the local registry
```

The test issuer (`scripts/test_issuer.py`) generates its signing key when it
starts and keeps it in memory. It mints tokens for the identities in the
contracts and for `test-two-roles`, which exists in no realm. In the tests a
second one, with a key of its own, plays chain-sts, and issues for this
service's route. Both give an identity the same `sub`, as chain-sts keeps the
user's.

## Release

`<version>`, in the image `localhost:5002/delivery-mcp:<version>`, is
`DELIVERY_MCP_VERSION` in `Taskfile.yml`, which the build passes as the
`VERSION` build argument and the image sets as `APP_VERSION`; in the dev
cluster the shared chart sets `APP_VERSION` to the `image.tag` of the values.
The service reports `APP_VERSION` and nothing else.

The version is written in eight places, all the same:

| Where | What reads it |
|---|---|
| `DELIVERY_MCP_VERSION` in `Taskfile.yml` | The image tag and the build argument |
| `image.tag` in [`values.yaml`](../../agent-deployments/clusters/dev/workloads/delivery-mcp/values.yaml) | The dev cluster: the image it runs, and its `APP_VERSION` |
| `ARG VERSION` in `Dockerfile` | A build without the build argument, such as `kmcp build` |
| The `APP_VERSION` default in `src/delivery/config.py` | A run without `APP_VERSION`, such as `task delivery-mcp:run-local` |
| `version` in `pyproject.toml`, and in `uv.lock` | uv; `uv lock` writes the second |
| `version` in `kmcp.yaml` | The kmcp CLI only. The server loads the file and reads nothing from it |
| The `version` label in `catalog.yaml` | The catalog |

To release a version: set it in each place above, run `uv lock`,
`task delivery-mcp:build` and `task delivery-mcp:push`, and apply the release
with `task deploy -- -l name=delivery-mcp`
([`docs/cluster.md`](../../docs/cluster.md#tasks)).

### kmcp

The project was scaffolded with `kmcp init python` (kmcp 0.4.0) and keeps that
layout: `kmcp.yaml`, `src/main.py`, `src/core/`, one tool per file in
`src/tools/`. `task delivery-mcp:kmcp:install` downloads the CLI into
`.tools/`, which is git-ignored. `task delivery-mcp:kmcp:manifest` renders the
`MCPServer` resource into `deploy/mcpserver.yaml`, which is git-ignored too:
it is generated, and nothing here applies it.

The dev cluster does not use that resource: it deploys this image with the
shared chart (`agent-platform/charts/agent`). The rendered resource has not
been applied to a kmcp controller, and it would also need the ServiceAccount
that the Role in the workload's `rbac/` chart is bound to.

Changed from the scaffold: FastMCP 3.4.8 instead of 3.0.0, Python 3.13, HTTP
only (stdio cannot carry a bearer token), and `.env` is read from this
directory only and never overrides the environment.

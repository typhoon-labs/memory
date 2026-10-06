# delivery-mcp

Incident and change state for the demo, served as MCP tools. It enforces the
separation-of-duties rules itself, against the caller's verified token,
whatever a gateway or a UI allowed before the call reached it.

The tools, roles and rules are the contract in
[`agent-platform/docs/conventions.md`](../../agent-platform/docs/conventions.md).

## What it serves

| Path | |
|---|---|
| `POST /mcp` | MCP over Streamable HTTP. Stateless: no session id, each request stands alone. A bearer token is required; without one that verifies the answer is 401. |
| `GET /healthz` | Liveness. No token. |

The token's signature (keys from `OIDC_JWKS_URL`, RS256), issuer, audience and
expiry are checked on every request. A token with no `exp` is refused. The
user is `preferred_username`; roles are the top-level `roles` array; the team
is `team`. A claim of the wrong type counts as absent. Nothing is read from
arguments or other headers.

## Results and refusals

A tool that succeeds returns its object, as `structuredContent` and as JSON
text. Anything else returns the same four keys, with `isError: true`:

```json
{"error": "forbidden", "layer": "service", "rule": "change_is_approved", "message": "..."}
```

| `error` | `rule` | When |
|---|---|---|
| `forbidden` | `role_required` | The caller lacks the role the tool needs |
| `forbidden` | `one_open_incident_per_service` | `open_incident` on a service with an unresolved incident |
| `forbidden` | `team_owns_service` | `propose_change` by a developer whose team does not own the service |
| `forbidden` | `target_is_retained_earlier_version` | The target is not in `RETAINED_VERSIONS`, or is not earlier than what runs |
| `forbidden` | `approver_is_not_proposer` | `approve_change` by the person who proposed the change |
| `forbidden` | `change_is_approved` | `apply_change` on a change that is proposed or rejected |
| `not_found` | `incident_exists`, `change_exists` | No such incident or change |
| `invalid_state` | `incident_is_open`, `change_is_pending` | For example approving a change twice |
| `invalid_argument` | `service_is_known`, `argument_is_valid` | |
| `operation_failed` | `operation_completed` | `restart_workload` was allowed and the Kubernetes API refused or failed |

The role is checked first, then the rule that depends on state. With the four
demo users this means a developer who tries to approve their own change is
refused by `role_required`: no demo user holds both roles, so
`approver_is_not_proposer` is only reached by someone who does.

## Applying a change

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
  --reuse-values --set-string searchService.image.tag=<version>`. No `--wait`,
  `--force` or `--install`: the release stays the only writer of the
  Deployment, and the rights it needs are small
  (`agent-deployments/clusters/dev/workloads/delivery-mcp/access/`).
  `--set-string` rather than `--set`, so a tag such as `2.10` is not read as a
  number.

Verification is a real `GET` of `VERIFY_SEARCH_URL`, retried until
`VERIFY_TIMEOUT_SECONDS`. It passes on 200 with at least one result.

## Environment

| Variable | Default | |
|---|---|---|
| `OIDC_ISSUER` | required | The `iss` every token must carry |
| `OIDC_JWKS_URL` | required | Where the signing keys are fetched |
| `OIDC_AUDIENCE` | required | The `aud` every token must carry |
| `APP_VERSION` | `0.1.0` | `service.version` |
| `DEPLOYMENT_ENVIRONMENT` | `dev` | `deployment.environment` |
| `HOST`, `PORT` | `127.0.0.1`, `8080` | The image binds `0.0.0.0:8080` |
| `DELIVERY_DB_PATH` | `:memory:` | SQLite file. In memory, state is lost on restart |
| `APPLIER` | `fake` | `fake` or `helm` |
| `RETAINED_VERSIONS` | `2.0.0` | Comma-separated versions a change may return to |
| `HELM_CHART_REF` | required with `helm` | The Sample App chart: an `oci://` reference or a path |
| `HELM_CHART_VERSION` | | Chart version for an OCI reference |
| `HELM_PLAIN_HTTP` | `false` | `true` for an OCI registry served over HTTP |
| `HELM_RELEASE`, `HELM_NAMESPACE` | `sample-app`, `sample-app` | |
| `HELM_TIMEOUT_SECONDS` | `120` | |
| `VERIFY_SEARCH_URL` | required with `helm` | The search request that proves the change |
| `VERIFY_RESULTS_FIELD` | `results` | The list in the response |
| `VERIFY_TIMEOUT_SECONDS`, `VERIFY_INTERVAL_SECONDS` | `90`, `2` | |
| `RESTART_LABEL_SELECTOR` | `app.kubernetes.io/name={service}` | Pods `restart_workload` deletes |
| `FAKE_CURRENT_VERSION`, `FAKE_APPLY_SECONDS` | `2.1.0`, `0` | Fake applier only |
| `MCP_STATELESS_HTTP` | `true` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | | Traces are exported only when set |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | `grpc` or `http/protobuf` |
| `LOG_LEVEL` | `INFO` | |

With `helm`, the service does not start without `HELM_CHART_REF` and
`VERIFY_SEARCH_URL`. It never starts without the three `OIDC_` values.

Each tool call writes one JSON line to the logger `delivery.audit`: tool,
target, user, roles, team, outcome and rule.

## Run and test

```sh
task test          # every tool: a permitted and a refused case per rule
task run-local     # :18190, with a test issuer on :18199 and a stub search on :18198
task token -- platform-engineer
task stop-local
```

The test issuer (`scripts/test_issuer.py`) generates its signing key when it
starts and keeps it in memory. It mints tokens for the identities in the
conventions and for `test-two-roles`, which exists in no realm.

## kmcp

The project was scaffolded with `kmcp init python` (kmcp 0.4.0) and keeps that
layout: `kmcp.yaml`, `src/main.py`, `src/core/`, one tool per file in
`src/tools/`. `task kmcp:install` downloads the CLI into `.tools/`, which is
git-ignored. `task kmcp:manifest` renders the `MCPServer` resource into
`deploy/mcpserver.yaml`.

The dev cluster does not use that resource: it deploys this image with the
shared chart (`agent-platform/charts/agent`). `deploy/mcpserver.yaml` has not
been applied to a kmcp controller, and it would also need the ServiceAccount
that the Role in `access/` is bound to.

Changed from the scaffold: FastMCP 3.4.8 instead of 3.0.0, Python 3.13, HTTP
only (stdio cannot carry a bearer token), and `.env` is read from this
directory only and never overrides the environment.

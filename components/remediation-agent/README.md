# remediation-agent

> **Owner:** remediation-agent maintainers · **Type:** reference · **Checked:** 2026-11-03 against remediation-agent 0.1.4

Applies an approved change as the caller and reports the verified result. It
calls `apply_change` on `delivery-mcp` with the caller's own token, or with the
token chain-sts exchanges it for, for `delivery-mcp` alone, and holds no
credential of its own there.

| | |
|---|---|
| Built with | Strands, Python 3.13; `comms-agent` is built the same way |
| Serves | A2A 0.3 over JSON-RPC on container port 8080; local dev port 18191 |
| Gateway route | `/a2a/remediation-agent`, for role `platform-engineer`; on a user's behalf, `chat-assistant` only ([Routes](../../docs/contracts.md#routes)) |
| Model | `MODEL_ID_FAST` ([Model access](../../docs/contracts.md#model-access)) |
| Running version | 0.1.4, `image.tag` in the values |
| Values and route | What the dev cluster runs is `agent-deployments/clusters/dev/workloads/remediation-agent/values.yaml`, and who may call it is `agent-deployments/clusters/dev/domains/operations/remediation-agent.yaml` |

## Identity

- The caller's token is read from `Authorization`, and the agent verifies the
  JWT itself: signature (RS256), issuer, audience and expiry. It then calls
  `delivery-mcp` and `{MODEL_BASE_URL}/v1/messages` with that token unchanged
  or, when `DELEGATION_METADATA_URL` and `DELEGATION_ACTOR_TOKEN_FILE` are
  set, each with a token chain-sts issued for it alone.
  - It trusts two issuers, each with its own audience
    ([bindings](../../docs/contracts.md#components)): Keycloak (`OIDC_*`),
    whose tokens must carry `OIDC_AUDIENCE`, and, when `DELEGATION_ISSUER`,
    `DELEGATION_JWKS_URL` and `DELEGATION_AUDIENCE` are set, chain-sts, whose
    tokens must carry one of `DELEGATION_AUDIENCE`: the resource of this
    agent's own gateway route (what chain-sts's tokens carry:
    [chain-sts](../../docs/contracts.md#agents-acting-for-a-user-chain-sts)).
    A token is verified against the keys of the issuer its `iss` names; an
    `iss` that is neither is refused with 401. So is a chain token issued for
    another target, such as `delivery-mcp` or the model route, and a Keycloak
    token whose audience is only this agent's resource. `agentgateway`, the
    audience every chain token carried before chain-sts issued one per
    target, is accepted from chain-sts only while `DELEGATION_AUDIENCE` lists
    it.
  - With the exchange set, the agent exchanges the caller's token once for
    each target, right before its first call there (`delegation.py`, RFC
    8693): for `delivery-mcp` before `apply_change`, and for the model once
    the change has finished. Each exchange posts the caller's token as
    `subject_token`, the agent's projected service-account token from
    `DELEGATION_ACTOR_TOKEN_FILE` as `actor_token`, both of type
    `urn:ietf:params:oauth:token-type:jwt`, and the target as `resource` (RFC
    8707): `DELIVERY_MCP_URL`, or `MODEL_BASE_URL` with `/v1`, the prefix of
    the model route's paths, each without a trailing slash. It goes to the
    `token_endpoint` of the metadata at `DELEGATION_METADATA_URL`. Each target
    gets only the token issued for it, whose `aud` is that target alone, so
    the gateway accepts it nowhere else; what it carries is in
    [`docs/contracts.md`](../../docs/contracts.md#agents-acting-for-a-user-chain-sts).
    The subject is always the caller's token, never one issued for another
    target. The file is read again for every exchange, since the kubelet
    replaces it. The client is kagent's `agentsts-core` 1.0.0rc1, which reads
    the metadata at the first exchange and keeps it.
  - A refused or failed exchange for `delivery-mcp` ends the task `failed`,
    with `outcome: error`, before anything is called; the caller's token is
    never sent instead. One for the model leaves the verified result
    standing, worded by the template (`phrased_by: template`), and the model
    is not called. The task's text names chain-sts's `error` code
    (`unauthorized_client`, `temporarily_unavailable`, ...) or the kind of
    failure (`actor_token_unreadable`, `network_error`, `invalid_metadata`,
    `invalid_response`); the agent's log line names it and the target. Neither
    names a token.

## What it serves and returns

- Called with `{"action": "apply_and_verify", "change_id": "..."}`.
- A2A 0.3.0 over JSON-RPC at `POST /` (`message/send`, `message/stream`),
  agent card at `/.well-known/agent-card.json`. Send the request JSON as a
  text part or a data part.
- The result is one artifact with a text part and a data part. The data part
  carries `outcome` and `refusal` (the service's refusal, passed through
  intact), and the task is `completed` only for `applied`.
  - `outcome` is `applied`, `failed`, `refused`, `rejected`, `timeout` or
    `error`, with the `change`. It streams each stage as the change passes
    it: `applying`, `verifying`, then `applied` or `failed`.

## Settings

Every setting is in `.env.example`.

- Required settings: the three `OIDC_*`, `DELIVERY_MCP_URL`, `MODEL_BASE_URL`,
  and `MODEL_ID_FAST`. The others have defaults there, among them
  `MODEL_TIMEOUT_SECONDS` (30; the dev cluster sets 10) and
  `FOLLOW_TIMEOUT_SECONDS` (180).
  `DELEGATION_ISSUER`, `DELEGATION_JWKS_URL` and `DELEGATION_AUDIENCE` are
  optional, all three or none; there is no default. `DELEGATION_AUDIENCE` is
  comma-separated, and a chain-sts token must carry one of its values. The
  dev cluster sets the first two since version 0.1.2, to `delegation` in
  `agent-deployments/clusters/dev/identity.yaml`, and `DELEGATION_AUDIENCE`
  since version 0.1.4, to the resource of this agent's route
  (`delegation.resources` in the same file), in its values file.
  `DELEGATION_METADATA_URL` and `DELEGATION_ACTOR_TOKEN_FILE` are optional
  too, both or neither, and apart from those three. The dev cluster sets both
  since version 0.1.3, with the token file mounted by the shared chart's
  `projectedToken` (600 seconds) at the path and for the audience in
  [`docs/contracts.md`](../../docs/contracts.md#components). A group that is
  set in part stops the start.
- The shared chart `agent-platform/charts/agent/` sets `runAsNonRoot`, so
  images need a numeric `USER`, and it injects `PORT`, `APP_VERSION` and
  `OTEL_SERVICE_NAME`.

## Run and test

| Task | Does |
|---|---|
| `task remediation-agent:test` | pytest, with stand-ins for `delivery-mcp`, chain-sts and the model (no model is called) |
| `task remediation-agent:lint` | ruff check and format check |
| `task remediation-agent:run-local` | Run on :18191 (needs `task delivery-mcp:run-local` and the model endpoint) |
| `task remediation-agent:stop-local` | Stop it |
| `task remediation-agent:build`, `task remediation-agent:push` | The image, and its push to the local registry |
| `task remediation-agent:drive` | Drive one incident through `delivery-mcp`, this agent and `comms-agent` (two model calls) |

## Release

The image's version is `REMEDIATION_AGENT_VERSION` in `Taskfile.yml`, which
the build sets as `APP_VERSION`; `pyproject.toml`'s version is not the
image's. To deploy a new version, raise it, `image.tag` in the values and
`version` in `catalog.yaml`, then `task remediation-agent:build remediation-agent:push`,
`task deploy -- -l name=remediation-agent` and, for the catalog,
`task registry:publish`.

# comms-agent

Drafts a status update for an incident. It reads the incident from
`delivery-mcp` with the caller's own token, or with the token chain-sts
exchanges it for, and returns a draft; it does not post. Posting is the
incident manager's own act (`post_status_update`).

| | |
|---|---|
| Built with | Strands, Python 3.13 |
| Called with | `{"action": "draft_status_update", "incident_id": "..."}` |
| Serves | A2A 0.3 over JSON-RPC on container port 8080; local dev port 18192 |
| Gateway route | `/a2a/comms-agent`, for role `incident-manager` |
| Model | `MODEL_ID` |

## As built

Shared with `remediation-agent`, which is built the same way.

- A2A 0.3.0 over JSON-RPC at `POST /` (`message/send`, `message/stream`),
  agent card at `/.well-known/agent-card.json`. Send the request JSON as a
  text part or a data part.
- The caller's token is read from `Authorization` and sent to `delivery-mcp`
  and to `{MODEL_BASE_URL}/v1/messages`: unchanged, or exchanged at chain-sts
  first when `DELEGATION_METADATA_URL` and `DELEGATION_ACTOR_TOKEN_FILE` are
  set. Both agents also verify the JWT themselves: signature (RS256), issuer,
  audience and expiry.
  - Both trust two issuers: Keycloak (`OIDC_*`) and, when `DELEGATION_ISSUER`
    and `DELEGATION_JWKS_URL` are set, chain-sts, whose tokens carry a user's
    claims for an agent acting for them and name the agents in `act`. A token
    is verified against the keys of the issuer its `iss` names; an `iss` that
    is neither is refused. Both audiences are `OIDC_AUDIENCE`.
  - With the exchange set, each task exchanges the caller's token once, before
    its first call (`delegation.py`, RFC 8693): the caller's token as
    `subject_token`, the agent's projected service-account token from
    `DELEGATION_ACTOR_TOKEN_FILE` as `actor_token`, both of type
    `urn:ietf:params:oauth:token-type:jwt`, and `OIDC_AUDIENCE` as `audience`,
    posted to the `token_endpoint` of the metadata at
    `DELEGATION_METADATA_URL`. Only the token chain-sts issues goes out for
    the rest of the task: the same user's, with `act` naming this agent and
    every agent before it. The file is read again for every exchange, since the
    kubelet replaces it. The client is kagent's `agentsts-core` 1.0.0a16,
    which reads the metadata at the first exchange and keeps it.
  - A refused or failed exchange ends the task `failed`, with `outcome:
    error`, before anything is called; the caller's token is never sent
    instead. The text, and the agent's log line, name chain-sts's `error` code
    (`unauthorized_client`, `temporarily_unavailable`, ...) or the kind of
    failure (`actor_token_unreadable`, `network_error`, `invalid_metadata`,
    `invalid_response`), and never a token.
- The result is one artifact with a text part and a data part. The data part
  carries `outcome` and `refusal` (the service's refusal, passed through
  intact), and the task is `completed` only for `applied` or `drafted`.
  - `remediation-agent`: `outcome` is `applied`, `failed`, `refused`,
    `rejected`, `timeout` or `error`, with the `change`. It streams each stage
    as the change passes it: `applying`, `verifying`, then `applied` or
    `failed`.
  - `comms-agent`: `outcome` is `drafted`, `refused`, `rejected` or `error`,
    with the `draft`, its `word_count` and `posted: false`. A model that does
    not answer in time is an `error`.
- Settings: the three `OIDC_*`, `DELIVERY_MCP_URL`, `MODEL_BASE_URL`, and
  `MODEL_ID_FAST` (remediation) or `MODEL_ID` (comms); see each `.env.example`.
  `DELEGATION_ISSUER` and `DELEGATION_JWKS_URL` are optional, both or neither.
  The dev cluster sets both since version 0.1.2, to `delegation` in
  `agent-deployments/clusters/dev/identity.yaml`. `DELEGATION_METADATA_URL`
  and `DELEGATION_ACTOR_TOKEN_FILE` are optional too, both or neither, and
  apart from those two. The dev cluster sets both since version 0.1.3, with
  the token file mounted by the shared chart's `projectedToken` (audience
  `chain-sts`, 600 seconds) at `/var/run/secrets/chain-sts/token`. One of a
  pair without the other stops the start.
- The shared chart `agent-platform/charts/agent/` sets `runAsNonRoot`, so
  images need a numeric `USER`, and it injects `PORT`, `APP_VERSION` and
  `OTEL_SERVICE_NAME`.

## Tasks

| Task | Does |
|---|---|
| `task comms-agent:test` | pytest, with stand-ins for `delivery-mcp` and the model (no model is called) |
| `task comms-agent:lint` | ruff check and format check |
| `task comms-agent:run-local` | Run on :18192 (needs `task delivery-mcp:run-local` and the model endpoint) |
| `task comms-agent:stop-local` | Stop it |
| `task comms-agent:build`, `task comms-agent:push` | The image, and its push to the local registry |

Every setting is in `.env.example`. What the dev cluster runs is
`agent-deployments/clusters/dev/workloads/comms-agent/values.yaml`, and who may
call it is `agent-deployments/clusters/dev/domains/operations/comms-agent.yaml`.

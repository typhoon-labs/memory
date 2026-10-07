# remediation-agent

Applies an approved change as the caller and reports the verified result. It
calls `apply_change` on `delivery-mcp` with the caller's own token and has no
identity of its own.

| | |
|---|---|
| Built with | Strands, Python 3.13 |
| Called with | `{"action": "apply_and_verify", "change_id": "..."}` |
| Serves | A2A 0.3 over JSON-RPC on container port 8080; local dev port 18191 |
| Gateway route | `/a2a/remediation-agent`, for role `platform-engineer` |
| Model | `MODEL_ID_FAST` |

## As built

Shared with `comms-agent`, which is built the same way.

- A2A 0.3.0 over JSON-RPC at `POST /` (`message/send`, `message/stream`),
  agent card at `/.well-known/agent-card.json`. Send the request JSON as a
  text part or a data part.
- The caller's token is read from `Authorization` and forwarded unchanged to
  `delivery-mcp` and to `{MODEL_BASE_URL}/v1/messages`. Both agents also
  verify the JWT themselves.
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
- The shared chart `agent-platform/charts/agent/` sets `runAsNonRoot`, so
  images need a numeric `USER`, and it injects `PORT`, `APP_VERSION` and
  `OTEL_SERVICE_NAME`.

## Tasks

| Task | Does |
|---|---|
| `task remediation-agent:test` | pytest, with stand-ins for `delivery-mcp` and the model (no model is called) |
| `task remediation-agent:lint` | ruff check and format check |
| `task remediation-agent:run-local` | Run on :18191 (needs `task delivery-mcp:run-local` and the model endpoint) |
| `task remediation-agent:stop-local` | Stop it |
| `task remediation-agent:build`, `task remediation-agent:push` | The image, and its push to the local registry |
| `task remediation-agent:drive` | Drive one incident through `delivery-mcp`, this agent and `comms-agent` (two model calls) |

Every setting is in `.env.example`. What the dev cluster runs is
`agent-deployments/clusters/dev/workloads/remediation-agent/values.yaml`, and who may
call it is `agent-deployments/clusters/dev/domains/operations/remediation-agent.yaml`.

# comms-agent

Drafts a status update for an incident. It reads the incident from
`delivery-mcp` with the caller's own token and returns a draft; it does not
post. Posting is the incident manager's own act (`post_status_update`).

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
| `task comms-agent:test` | pytest, with stand-ins for `delivery-mcp` and the model (no model is called) |
| `task comms-agent:lint` | ruff check and format check |
| `task comms-agent:run-local` | Run on :18192 (needs `task delivery-mcp:run-local` and the model endpoint) |
| `task comms-agent:stop-local` | Stop it |
| `task comms-agent:build`, `task comms-agent:push` | The image, and its push to the local registry |

Every setting is in `.env.example`. What the dev cluster runs is
`agent-deployments/clusters/dev/workloads/comms-agent/values.yaml`, and who may
call it is `agent-deployments/clusters/dev/domains/operations/comms-agent.yaml`.

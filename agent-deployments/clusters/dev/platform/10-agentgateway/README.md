# 10-agentgateway

> **Owner:** platform team · **Type:** runbook · **Checked:** 2026-11-03 against Agentgateway 1.7.0

The trunk's gateway: the Gateway API and Agentgateway CRDs, the controller,
the one Gateway every model, MCP and A2A route attaches to, and for the admin
UI a sign-in proxy and a database. The releases are in
[`helmfile.yaml`](helmfile.yaml): `agentgateway-crds`, `agentgateway`,
`agentgateway-postgresql` (chart [`postgres/`](postgres/values.yaml)),
`agentgateway-proxy` (chart [`gateway/`](gateway/values.yaml)) and
`agentgateway-ui` (oauth2-proxy, [`ui.yaml`](ui.yaml)). `task up:trunk`
installs them. Addresses and ports are in
[`docs/cluster.md`](../../../../../docs/cluster.md), and who may call which
route in [`docs/contracts.md`](../../../../../docs/contracts.md#routes).

## The admin UI

It is at `http://localhost:18088/ui/`, for `platform-engineer` only, with
`/ui/` in the address: `/` answers 404. The path is the browser,
oauth2-proxy in its own pod (release `agentgateway-ui`, client
`agentgateway-ui`), the proxy's admin port. A session lasts 8 hours. It shows
one pod's configuration, and that pod's only. `task ui -- agentgateway`
forwards the admin port directly, as the way in when the sign-in proxy is
down.

- **The menu is short, and that is not a fault.** With a controller behind it
  the UI lists Home, Models, Client Setup, Listeners, Routes, Policies and CEL
  Playground, whatever is configured. Analytics and Logs work but are not
  listed: go to `/ui/llm/analytics` and `/ui/llm/logs`. Do not go by the other
  pages it hides, such as MCP Servers and Virtual API Keys: they read the local
  file, which is empty here, so they report nothing configured.
- **Its database is release `agentgateway-postgresql`**, in the shape of
  kagent's (`postgres/values.yaml`), with a generated password where kagent's
  has client certificates, because those arrive at step 5 and this is needed
  at step 1. It keeps usage, timing and cost through restarts of the gateway,
  and it **keeps prompts and completions**: what is captured for Langfuse is
  stored too, and they travel to it unencrypted, on a path only the gateway
  may use. Only `platform-engineer` can read them, by opening a row on the Logs
  page: the Prompt column stays empty in the list. Nothing deletes old rows. It
  grew about 10 KiB a model call, so its 500 MiB hold roughly 50,000 calls.
  When it is full, writes are dropped with a warning and routes go on.
- **The gateway needs that database to start.** A running pod does not: with
  the database down, routes and model calls work, and those calls are not
  recorded. A rollout waits, with the old pod serving, and finished 10 seconds
  after the database came back. But a gateway pod that dies while the database
  is down stays down, and every route with it, until the database returns. It
  retries about every 30 seconds. [Measured](../../../../../docs/measurements.md#the-gateways-admin-port-and-database):
  with the database down for 90 seconds, the routes were gone for 105.
- **This is a convenience of this cluster, and another should not copy it.**
  By default the port answers on the pod's own localhost, which is the place
  for it, with `kubectl port-forward` as the way in. Here it is opened with
  `ADMIN_ADDR`, for the sign-in proxy.
- **The port has no login and is not read-only.** `POST /quitquitquit` shuts
  the proxy down and `POST /logging` is there too (read in the source at 1.7.0,
  not called). Without `UI_READ_ONLY` the proxy also runs in `file` mode, where
  the UI's calls that write the configuration are refused only because the
  file is a read-only mount. Three things guard it, in
  `platform/10-agentgateway`: NetworkPolicy `agentgateway-proxy-admin` lets
  only the sign-in proxy reach the port (`gateway/templates/admin.yaml`, the
  first in this namespace, which must keep every other port open or the routes
  stop); `UI_READ_ONLY=true` refuses a write with 403, whoever sends it; and
  the sign-in proxy forwards `/ui/`, `/config_dump` and `/api/` and nothing
  else (`ui.yaml`). `/config_dump` is the whole configuration as JSON, with its
  credentials shown as `<redacted>`.

The checks run against these guards are in
[`docs/measurements.md`](../../../../../docs/measurements.md#the-gateways-admin-port-and-database).

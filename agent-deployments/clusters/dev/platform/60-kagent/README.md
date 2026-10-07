# kagent and Agent Substrate

As built in the dev cluster. Releases and their order are in `helmfile.yaml`;
the charts' shared values are in `agent-platform/profiles/kagent/`. The one
agent that runs on it is `diagnosis-agent`
([`components/diagnosis-agent/`](../../../../../components/diagnosis-agent/README.md)).

- kagent 1.0.0-alpha7, Agent Substrate 0.3.0-alpha3, kagent-tools 0.3.0.
  About 0.5 GiB after install, 1.1 GiB after use. Tasks: `kagent:install`,
  `kagent:status`, `kagent:ui-secret`, `diagnosis-agent:deploy`,
  `diagnosis-agent:ask`, `diagnosis-agent:eval`, `diagnosis-agent:checks`.
- **A workload's own credential:** kagent cannot forward a caller's token, so
  a kagent agent calls the model route, and any MCP route it uses, with a key
  the gateway issued to that workload (the gateway stores only the hash).
  kagent keeps one credential per host name. Charts:
  `agent-platform/profiles/kagent/` (`model-access`, `tool-access`).
- **The UI** is at `http://localhost:18087`, for `platform-engineer` only
  (password `demo`). It is on in this cluster's `values.yaml` and off in the
  profile. The path is browser, the chart's oauth2-proxy (which signs in with
  Keycloak, client `kagent-ui`), the UI's nginx, the controller. The two new
  pods hold 13 MiB together.
  - **What guards it.** kagent reads the user from the token without
    verifying it, so the proxy is the only check. Only the proxy has a
    NodePort; the UI's Service stays ClusterIP, and the NetworkPolicy
    `kagent-ui-callers` (in the profile) lets nothing but the proxy reach the
    UI. Checked from a pod in `sample-app`: the UI and the controller do not
    answer, and the proxy answers a token the pod wrote itself with 403.
  - **What it opens.** kagent authorizes nothing: whoever signs in can
    create, change and delete agents, `diagnosis-agent` included, which the
    release would put back only at its next sync. A chat started in the UI
    reaches the agent through the controller and not through the gateway
    route, so the route's policy and the gateway's records do not cover it.
    That is why one role is let in, and why the UI is not part of the show.
  - **Sessions** last 25 minutes, shorter than the token (30 minutes),
    because the proxy does not renew a session and kagent does not look at a
    token's expiry. The browser is then sent through Keycloak again.
  - **Secret `kagent-ui-oidc`** (client id, client secret, cookie key) is
    made by `scripts/ui-secret.sh` before each sync. The client secret is the
    demo-only value in the realm file.
  - Before sign-in the UI's icon is refused (403): the chart exempts
    `favicon.ico` and the UI asks for `favicon.svg`. Nothing else is affected.
- **Substrate's object store has a console** (RustFS, the chart's default
  keys): `task ui -- rustfs`, then `http://localhost:18093/rustfs/console/`.
- **Alpha limits found:** a skill cannot be loaded from git (the runbook is
  in the prompt); kagent does not verify tokens itself, so the gateway route,
  the UI's sign-in proxy and two NetworkPolicies guard its port.

# Observability

> **Owner:** platform team · **Type:** runbook · **Checked:** 2026-11-03 against the chart versions in its `helmfile.yaml`

As built in the dev cluster. Releases and their order are in `helmfile.yaml`.
Grafana, Prometheus, Alertmanager, Loki and Tempo stand in for the
organization's operational backend, so their values, dashboards and alert
rules are in `local/observability/`.

- Namespace `telemetry`: kube-prometheus-stack, Loki, Tempo and one OTel
  Collector. Grafana at `http://localhost:18084` (sign-in with Keycloak,
  client `grafana`: `platform-engineer` is Admin, the other roles are Viewer),
  with the Agentgateway dashboard, "Sample App" and "Platform overview".
  User `admin` stays, because the pre-flight and the status and MCP credential
  scripts use it, and it is the way in while Keycloak is down:
  `task observability:login` prints its address and password. Tasks:
  `observability:install`,
  `observability:status`, `observability:open`, `observability:urls`,
  `observability:test-rules`.
- **Loki and Tempo keep 7 days, on volumes** (1 GiB and 4 GiB), so a restart
  keeps what they hold. They are the audit trail as well as the debugging
  tools. Prometheus still keeps 24 hours in memory. On a cluster from before
  this, `kubectl delete statefulset loki tempo` in `telemetry` first: a
  StatefulSet's volumes cannot be added in place.
- **Audit records** reach Loki over OTLP from the gateway, delivery-mcp,
  chain-sts and Keycloak, and from the API server's audit log through
  `kube-audit-forwarder`, which reads the file in the kind node. The
  collector gives Keycloak's and the API server's records the shared field
  names (`transform/audit`). Dashboard "Audit", and the rest:
  [the audit trail](../../../../../docs/cluster.md#the-audit-trail).
- **Prometheus and Alertmanager have their own UIs,** without a host port:
  `task ui -- prometheus` (`http://localhost:18091`) and
  `task ui -- alertmanager` (`http://localhost:18092`), each for as long as
  the task runs. Neither has a login.
- **Collector:** gRPC `otel-collector.telemetry.svc.cluster.local:4317`, HTTP
  `http://otel-collector.telemetry.svc.cluster.local:4318`. A component sets
  `OTEL_EXPORTER_OTLP_ENDPOINT` to the HTTP URL and
  `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`.
- **Scraping needs nothing from a component.** The Sample App is scraped
  every 5 seconds by a monitor in the observability release
  (`telemetry/sample-app`). Never switch on the Sample App chart's own
  ServiceMonitor: the rollback's Role cannot patch it and Apply fails.
  `delivery-mcp` and the agents expose no `/metrics`.
- **Traces:** Tempo gets every trace with prompt and completion text
  removed. Langfuse gets only traces that contain a model call, with the
  text kept, about 20 seconds late; that pipeline is on when
  `langfuse.enabled` is set and Secret `telemetry/langfuse-ingest` exists.
  While it is on, the gateway's own database keeps the text too, for its admin
  UI's Logs page ([`docs/cluster.md`](../../../../../docs/cluster.md)).
- **Alert:** the search error-ratio rule reaches `POST /hooks/alert` about 25
  seconds after a bad release (31 at worst), authenticated as
  `alert-automation`.
- **`observability-mcp`:** Grafana's MCP server 2.0.1, released from
  `workloads/observability-mcp/`, offering 20 of its read-only tools.
  `OBSERVABILITY_MCP_URL=http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/observability`
  with a Keycloak token. For `diagnosis-agent`:
  `http://agentgateway-proxy.agentgateway-system.svc/workloads/diagnosis-agent/mcp/observability`
  with `authorization: Bearer <its gateway key>` from a Secret.

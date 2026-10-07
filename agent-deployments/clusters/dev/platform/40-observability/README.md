# Observability

As built in the dev cluster. Releases and their order are in `helmfile.yaml`.
Grafana, Prometheus, Alertmanager, Loki and Tempo stand in for the
organization's operational backend, so their values, dashboards and alert
rules are in `local/observability/`.

- Namespace `telemetry`: kube-prometheus-stack, Loki, Tempo and one OTel
  Collector. Grafana at `http://localhost:18084` (user `admin`; the password,
  demo only, is not written in this repository: `task observability:login`
  prints it from the cluster), with the Agentgateway dashboard, "Sample App"
  and "Platform overview". Tasks: `observability:install`,
  `observability:status`, `observability:open`, `observability:urls`,
  `observability:test-rules`.
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
- **Alert:** the search error-ratio rule reaches `POST /hooks/alert` about 25
  seconds after a bad release (31 at worst), authenticated as
  `alert-automation`.
- **`observability-mcp`:** 20 read-only tools.
  `OBSERVABILITY_MCP_URL=http://agentgateway-proxy.agentgateway-system.svc.cluster.local/mcp/observability`
  with a Keycloak token. For `diagnosis-agent`:
  `http://agentgateway-proxy.agentgateway-system.svc/workloads/diagnosis-agent/mcp/observability`
  with `authorization: Bearer <its gateway key>` from a Secret.

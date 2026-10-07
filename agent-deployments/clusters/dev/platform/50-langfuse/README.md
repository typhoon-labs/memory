# Langfuse

As built in the dev cluster. The release is in `helmfile.yaml`; model prices
and their sources are in `model-prices.json`.

- Langfuse 4.46.0 (chart 2.1.3) in `langfuse`, UI at `http://localhost:18085`.
  About 1.8 GiB idle. Its ClickHouse has a 4 GiB limit: it once grew past a
  smaller one while idle and every query failed, cause not found;
  `task langfuse:restart-clickhouse` recovers it. Other tasks:
  `langfuse:install`, `langfuse:secrets`, `langfuse:check`, `langfuse:login`.
- Trace ingest: OTLP over HTTP only, at
  `http://langfuse-web.langfuse.svc.cluster.local:3000/api/public/otel`
  (exporters append `/v1/traces`), with header
  `x-langfuse-ingestion-version: 4` and the `Authorization` value from Secret
  `telemetry/langfuse-ingest` (key `authorization`). `task langfuse:secrets`
  creates that Secret and must run before anything that mounts it.
- Its stores have UIs of their own, without a host port, for as long as the
  task runs: `task ui -- clickhouse` (`http://localhost:18096/play`, a query
  page; the task prints the login), `task ui -- seaweedfs`
  (`http://localhost:18094`, the object store) and `task ui -- seaweedfs-filer`
  (`http://localhost:18095`, the stored files).
- Reading traces back: `GET /api/public/v2/observations` (the older
  `/api/public/traces` returns 404 on Langfuse 4).

# Sample App

> **Owner:** sample-app maintainers · **Type:** reference · **Checked:** 2026-11-03 against search-service 2.0.0 (deployed), web 1.2.1, registration-service 1.0.0

The application the incident happens to: three small Node services in one Helm
release.

| | |
|---|---|
| Built with | Node; the pages are a React app ([Pages](#pages)) |
| Serves | `web`, `search-service` and `registration-service`, each on container port 8080. What each serves, and its local dev port: [`docs/contracts.md`](../../docs/contracts.md#components) |
| Gateway route | None. From the host, `web` is at `http://localhost:18082` ([`docs/cluster.md`](../../docs/cluster.md)) |
| Model | None |
| In the dev cluster | `search-service` 2.0.0, `web` 1.2.1, `registration-service` 1.0.0. Helm release `sample-app` in namespace `sample-app`, chart in `components/sample-app/chart/` |
| Values | [`values.yaml`](../../agent-deployments/clusters/dev/workloads/sample-app/values.yaml), over the chart's own [`chart/values.yaml`](chart/values.yaml) |

## What it serves and returns

- `search-service` exists as `2.0.0` (healthy) and `2.1.0` (every search
  fails), built from one source. `search-service` is owned by team `search`,
  `registration-service` by team `registration`, `web` by team `web`.
- Pod labels: `app.kubernetes.io/name` (`web`, `search-service`,
  `registration-service`), `app.kubernetes.io/instance=sample-app`,
  `app.kubernetes.io/version=<tag>`, `team`.
- Search check: `http://search-service.sample-app.svc.cluster.local:8080/search?q=red`
  returns 200 with `count: 50` on 2.0.0 and 500 on 2.1.0. From the host:
  `http://localhost:18082/api/search?q=red`. `/healthz` returns 200 on both.
- Metrics, labeled with `service_name` and `version`: `http_requests_total`,
  `http_request_duration_seconds`, `search_zero_results_total`,
  `registrations_total`, `app_info`.
- Traces leave as OTLP over HTTP (port 4318) only, so the collector must
  expose its HTTP receiver.
- The traffic generator (`local/traffic/`) runs in namespace `sample-app`.

### Pages

The pages are one React app in `web/ui`: Vite, TypeScript, Tailwind CSS and
shadcn/ui components (`web/ui/src/components/ui`, added with the shadcn CLI),
with React Router for the three addresses and TanStack Query for the refresh
every 3 seconds. `web/src/server.js` serves the built `web/ui/dist` and has no
dependencies of its own; the image builds the pages in a first stage.

- A red banner under the header says what is unavailable, on every page, and
  turns green for 10 seconds when it comes back. "Search" is judged by real
  search requests, since `search-service` 2.1.0 still passes its health check.
- The bar at the bottom of the window shows each service's version and state.
- Title, description and suggested searches come from `seed/catalog.json`
  (`GET /api/site`).
- The theme (colors, font, radius) is in `web/ui/src/index.css`.

`web` reads `web/ui/dist` when it starts: after a change to the pages, run
`task sample-app:ui` and restart `web`.

## Settings

All optional: `PORT` (8080), `APP_VERSION` (the image sets the version
`Taskfile.yml` built it as), `DEPLOYMENT_ENVIRONMENT` (`dev`),
`OTEL_EXPORTER_OTLP_ENDPOINT` (no traces without it) and `SEED_FILE`
(`seed/catalog.json`, for `web` and `search-service`). `web` reaches the other
two at `SEARCH_SERVICE_URL` and `REGISTRATION_SERVICE_URL`, by default
`http://localhost:18183` and `http://localhost:18184`.

## Run and test

| Task | Does |
|---|---|
| `task sample-app:ui` | Build the pages (`web/ui`) into `web/ui/dist`, which `web` serves |
| `task sample-app:test` | Type check and build of the pages, then tests from source (needs Node 22+, no Docker) |
| `task sample-app:build` | The four images: `web`, `registration-service`, `search-service` 2.0.0 and 2.1.0 |
| `task sample-app:push` | Push them to the local registry |
| `task sample-app:chart:push` | Package the chart and push it to the registry as an OCI chart |
| `task sample-app:run-local` | Run the three services with Docker on ports 18182 to 18184 |
| `task sample-app:stop-local` | Remove what `run-local` started |
| `task sample-app:lint` | `helm lint` and `helm template` of the chart |

Swap the search version locally, as the incident and the rollback do in the
cluster: `task sample-app:run-local SAMPLE_APP_SEARCH_VERSION=2.1.0`, then
`task sample-app:run-local`.

## Release

The selection the rollback changes is the value `searchService.image.tag`,
which the dev cluster sets in its
[`values.yaml`](../../agent-deployments/clusters/dev/workloads/sample-app/values.yaml).
The versions the images are built as are `SAMPLE_APP_WEB_VERSION`,
`SAMPLE_APP_REGISTRATION_VERSION` and `SAMPLE_APP_SEARCH_VERSIONS` in
`Taskfile.yml`; the tags the chart deploys are in
[`chart/values.yaml`](chart/values.yaml).

To release: `task sample-app:build`, `task sample-app:push` and
`task sample-app:chart:push`, then `task deploy -- -l name=sample-app`
([`docs/cluster.md`](../../docs/cluster.md#tasks)). delivery-mcp upgrades the
release from the chart in the registry, so push the chart after every change
to it
([`helmfile.yaml`](../../agent-deployments/clusters/dev/workloads/sample-app/helmfile.yaml)).

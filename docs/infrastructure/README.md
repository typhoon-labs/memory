# Infrastructure

Typhoon runs on a set of Docker Compose services covering databases, caches, object storage, an LLM gateway, OIDC authentication, and observability. All services are managed through a wrapper script that handles compose file merging, environment loading, and profile selection.

## Services at a Glance

| Category       | Services                                                         |
| -------------- | ---------------------------------------------------------------- |
| Data stores    | PostgreSQL 17 (pgvector), Redis 8                                |
| Object storage | MinIO (S3-compatible)                                            |
| LLM            | Bifrost gateway (Anthropic, OpenAI, Bedrock)                     |
| Auth           | Dex OIDC provider (local dev)                                    |
| App            | API server, Worker, Scheduler, Desk SPA, Admin SPA, Widget       |
| Observability  | otel-lgtm (Grafana + Loki + Tempo + Prometheus + OTel Collector) |

See [Docker Services](./docker-services.md) for the full service inventory, profiles, volumes, and configuration details.

## The docker.sh Wrapper

All Docker operations **must** use `scripts/docker.sh` (or its npm aliases). Never run raw `docker compose` -- the wrapper handles:

- **Multi-file compose** -- merges `docker-compose.yml` + `docker-compose.dev.yml` (dev mode only)
- **Environment loading** -- passes `--env-file .env` automatically
- **Project name** -- sets `COMPOSE_PROJECT_NAME=typhoon` for consistent container naming
- **Profile selection** -- always uses `--profile all` to start every service

Production mode skips the dev overrides:

```bash
PROD=1 ./scripts/docker.sh up -d
```

## Quick Reference

| Command                  | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `bun run docker:up`      | Start all services (build + detach)                        |
| `bun run docker:down`    | Stop all services                                          |
| `bun run docker:restart` | Stop, rebuild, and restart all services                    |
| `bun run docker:status`  | Show running containers and health                         |
| `bun run docker:build`   | Rebuild images (no cache)                                  |
| `bun run docker:logs`    | Tail logs from all services                                |
| `bun run doctor`         | Check health of all services (DB, Redis, MinIO, endpoints) |
| `bun run setup`          | First-time dev setup (install, env, docker, migrate)       |
| `bun run reset`          | Tear down everything and re-setup from scratch             |
| `bun run seed`           | Seed DB + upload sample documents to MinIO                 |

## Sub-Pages

- [Docker Services](./docker-services.md) -- full service table, profiles, volumes, dev overrides, Bifrost, Dex, MinIO
- [Observability](./observability.md) -- Grafana LGTM stack, OTel Collector, dashboards, trace-log correlation
- [Environment Variables](./environment-variables.md) -- complete env var reference with Zod validation schemas
- [Production Deployment](./production.md) -- K8s model, external services, scaling, security
- [AWS Bedrock](./aws-bedrock.md) -- direct Bedrock integration, IRSA setup, inference profiles, IAM policies

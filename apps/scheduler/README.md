# @typhoon/scheduler

Cron scheduler that enqueues sync scan jobs based on sync target schedules. Single-replica deployment.

## Running

```bash
bun run dev   # Development with --watch
```

Health endpoint: `http://localhost:5171/healthz`

## Responsibilities

- Reads active sync target cron schedules from PostgreSQL
- Enqueues `scan` jobs to the BullMQ sync queue on schedule
- Polls the database every 60 seconds for schedule changes

## Environment Variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | BullMQ connection |
| `DATABASE_URL` | PostgreSQL connection |
| `LOG_LEVEL` | Logging verbosity (default: info) |
| `HEALTH_PORT` | Health server port (default: 5171) |

## Dependencies

`@typhoon/db`, `@typhoon/ingestion`, `@typhoon/logger`, Croner, BullMQ

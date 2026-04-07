#!/usr/bin/env bash
set -euo pipefail

COMPOSE="-f infra/docker/docker-compose.yml"
[ "${PROD:-}" != "1" ] && COMPOSE="$COMPOSE -f infra/docker/docker-compose.dev.yml"

exec docker compose $COMPOSE \
  --env-file infra/docker/.env --env-file .env \
  --profile all "$@"

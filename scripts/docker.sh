#!/usr/bin/env bash
set -euo pipefail

export COMPOSE_PROJECT_NAME=typhoon

COMPOSE="-f infra/docker/docker-compose.yml"
[ "${PROD:-}" != "1" ] && COMPOSE="$COMPOSE -f infra/docker/docker-compose.dev.yml"

exec docker compose $COMPOSE \
  --env-file .env \
  --profile all "$@"

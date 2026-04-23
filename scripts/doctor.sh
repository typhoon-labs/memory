#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}?${NC}"
ERRORS=0

check() {
  local label="$1"
  shift
  if "$@" &> /dev/null; then
    printf "  ${PASS}  %s\n" "$label"
  else
    printf "  ${FAIL}  %s\n" "$label"
    ERRORS=$((ERRORS + 1))
  fi
}

check_http() {
  local label="$1"
  local url="$2"
  if curl -sf --max-time 3 "$url" &> /dev/null; then
    printf "  ${PASS}  %s\n" "$label"
  else
    printf "  ${FAIL}  %s\n" "$label"
    ERRORS=$((ERRORS + 1))
  fi
}

container_running() {
  docker inspect --format '{{.State.Status}}' "typhoon-$1" 2>/dev/null | grep -q running
}

echo ""
echo "=== Typhoon Doctor ==="
echo ""

# Docker daemon
echo "Docker"
check "Docker daemon running" docker info

# Containers
echo ""
echo "Containers"
for svc in postgres redis minio dex api worker scheduler desk admin widget otel-lgtm; do
  check "typhoon-$svc" container_running "$svc"
done

# PostgreSQL
echo ""
echo "PostgreSQL (:5432)"
check "Accepting connections" docker exec typhoon-postgres pg_isready -U typhoon
check "pgvector extension" docker exec typhoon-postgres psql -U typhoon -d typhoon -tAc "SELECT 1 FROM pg_extension WHERE extname = 'vector'" | grep -q 1

# Redis
echo ""
echo "Redis (:6379)"
check "PING → PONG" docker exec typhoon-redis redis-cli ping

# MinIO
echo ""
echo "MinIO (:9000)"
if container_running minio; then
  NETWORK="$(docker inspect typhoon-minio --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null || true)"
  if [ -n "$NETWORK" ]; then
    check "typhoon-documents bucket" docker run --rm --network "$NETWORK" --entrypoint /bin/sh minio/mc:latest -c \
      "mc alias set m http://typhoon-minio:9000 minioadmin minioadmin --api S3v4 && mc ls m/typhoon-documents" 2>/dev/null
  else
    printf "  ${WARN}  Could not determine MinIO network\n"
  fi
else
  printf "  ${FAIL}  MinIO not running — skipping bucket check\n"
  ERRORS=$((ERRORS + 1))
fi

# HTTP endpoints
echo ""
echo "HTTP endpoints"
check_http "API health (:5172)" "http://localhost:5172/api/v1/auth/ok"
check_http "Desk (:5173)" "http://localhost:5173"
check_http "Admin (:5174)" "http://localhost:5174"
check_http "Widget (:5175)" "http://localhost:5175"

# Observability
echo ""
echo "Observability"
check "typhoon-otel-lgtm" container_running "otel-lgtm"
check_http "Grafana (:3000)" "http://localhost:3000/api/health"

# Summary
echo ""
if [ "$ERRORS" -eq 0 ]; then
  printf "${GREEN}All checks passed.${NC}\n"
else
  printf "${RED}${ERRORS} check(s) failed.${NC} Run 'bun run docker:logs' to investigate.\n"
fi
echo ""

exit "$ERRORS"

#!/usr/bin/env bash
set -euo pipefail

echo "=== Typhoon Development Setup ==="

# 0. Check prerequisites
echo "Checking prerequisites..."

if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed. Install it from https://bun.sh (v1.3.14+ required)"
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo "Error: docker is not installed. Install from https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker info &> /dev/null; then
  echo "Error: Docker daemon is not running. Start Docker Desktop or the Docker service."
  exit 1
fi

if ! docker compose version &> /dev/null; then
  echo "Error: docker compose (v2) is not available. Update Docker or install the compose plugin."
  exit 1
fi

echo "  bun $(bun --version), docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+'), compose $(docker compose version --short)"

# 1. Install dependencies
echo "Installing dependencies..."
bun install

# 2. Copy .env if not present
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

# 3. Start infrastructure
echo "Starting Docker services..."
./scripts/docker.sh up -d

# 4. Wait for migrations to complete (handled by the typhoon-migrate container)
echo "Waiting for migrations..."
until [ "$(docker inspect -f '{{.State.Status}}' typhoon-migrate 2>/dev/null)" = "exited" ]; do
  sleep 1
done
if [ "$(docker inspect -f '{{.State.ExitCode}}' typhoon-migrate 2>/dev/null)" != "0" ]; then
  echo "Error: migrations failed. Check logs: docker logs typhoon-migrate"
  exit 1
fi

# 5. Seed sample data
./scripts/seed-data.sh

echo ""
echo "=== Setup complete ==="
echo ""
echo "  Services:"
echo "    Admin dashboard  http://localhost:5174"
echo "    Rep desk         http://localhost:5173"
echo "    API server       http://localhost:5172"
echo "    Widget           http://localhost:5175"
echo "    Grafana          http://localhost:3000"
echo ""
echo "  Login (SSO via Dex):"
echo "    admin@typhoon.local / password"
echo "    rep@typhoon.local   / password"
echo ""
echo "  Next steps:"
echo "    bun run dev        Start all services in dev mode"
echo "    bun run doctor     Check service health"
echo "    bun run docker:logs  Tail Docker logs"

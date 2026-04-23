#!/usr/bin/env bash
set -euo pipefail

echo "=== Typhoon Development Setup ==="

# 0. Check prerequisites
echo "Checking prerequisites..."

if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed. Install it from https://bun.sh (v1.3.11+ required)"
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

echo "  bun $(bun --version), docker $(docker --version | grep -oP '\d+\.\d+\.\d+'), compose $(docker compose version --short)"

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

# 4. Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until docker exec typhoon-postgres pg_isready -U typhoon > /dev/null 2>&1; do
  sleep 1
done

# 5. Ensure pgvector extension exists
echo "Enabling pgvector extension..."
docker exec typhoon-postgres psql -U typhoon -d typhoon -c "CREATE EXTENSION IF NOT EXISTS vector;" > /dev/null 2>&1

# 6. Run migrations
echo "Running database migrations..."
set -a; source .env; set +a
bun run db:migrate

# 7. Seed sample data
echo "Seeding sample data..."
bun run seed:db
bun run seed:scorers
bun run seed:evals

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
echo "    bun run seed:docs  Upload sample documents to MinIO"
echo "    bun run doctor     Check service health"
echo "    bun run docker:logs  Tail Docker logs"

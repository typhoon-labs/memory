#!/usr/bin/env bash
set -euo pipefail

echo "=== Typhoon Development Setup ==="

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
docker compose -f infra/docker/docker-compose.yml up -d

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

echo "=== Setup complete ==="
echo "Run 'bun run dev' to start the development server."

#!/usr/bin/env bash
set -euo pipefail

echo "=== Resetting Typhoon Dev Environment ==="

echo "Stopping Docker services..."
docker compose -f infra/docker/docker-compose.yml down -v

echo "Removing node_modules..."
rm -rf node_modules .turbo packages/*/dist packages/*/.turbo apps/*/dist apps/*/.turbo

echo "Re-running setup..."
./scripts/dev-setup.sh

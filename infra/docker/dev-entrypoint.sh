#!/bin/sh
set -e

# Sync node_modules when package.json changes.
# The dev_node_modules named volume persists across rebuilds, so new
# dependencies only appear if we run `bun install` when the lockfile
# has changed since the last install.

HASH_FILE="/app/node_modules/.lockfile_hash"
CURRENT_HASH=$(sha256sum /app/bun.lock 2>/dev/null | cut -d' ' -f1 || echo "none")
STORED_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
  echo "[dev-entrypoint] bun.lock changed — running bun install..."
  cd /app && bun install --frozen-lockfile
  echo "$CURRENT_HASH" > "$HASH_FILE"
  echo "[dev-entrypoint] done."
fi

# Clear stale Vite dependency caches so rebuilt source is picked up.
find /app/apps -path '*/node_modules/.vite' -type d -exec rm -rf {} + 2>/dev/null || true

exec "$@"

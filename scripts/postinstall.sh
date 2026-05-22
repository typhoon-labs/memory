#!/bin/sh

# Install lefthook git hooks for local development only.
# Skipped inside Docker builds where .git is excluded via .dockerignore,
# and in CI environments where git hooks are not needed.
[ -d .git ] && lefthook install || true

# Install Playwright browsers (chromium) for E2E tests.
# Downloads the browser binary only (no root required).
# If system libraries are missing, Playwright prints the exact apt-get command to run.
# Skipped in Docker production builds where playwright is not installed.
if command -v npx >/dev/null 2>&1 && npx playwright --version >/dev/null 2>&1; then
  echo "playwright: installing browsers..."
  npx playwright install chromium
fi
